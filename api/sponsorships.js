// Vercel serverless function — manages Sponsorship banners. A third, distinct
// partner product: flat $3,000/year fee (not commission-based), one slot per
// destination that rotates among however many sponsors exist for that city.
//
// Approval workflow: two passwords, two roles.
//   ADMIN_PASSWORD -> role "admin"  -> entries go live immediately, can approve/reject/delete
//   SALES_PASSWORD -> role "sales"  -> entries always saved as "pending", invisible to travelers until approved
//
// GET    /api/sponsorships?city=Miami   -> list APPROVED+active sponsors, no auth needed
//                                          (with a valid admin/sales key, returns everything, for the admin panel)
// POST   /api/sponsorships              -> add a sponsor (requires x-admin-key header)
// PUT    /api/sponsorships              -> update a sponsor by id (requires x-admin-key header)
// DELETE /api/sponsorships?id=...       -> remove a sponsor (admin role only)

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const STORE_KEY = "sponsorships-v1";

let redis = null;
function getRedis() {
  if (redis) return redis;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const { Redis } = require("@upstash/redis");
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redis;
}

function getRole(req) {
  const key = req.headers["x-admin-key"];
  if (!key) return null;
  if (process.env.ADMIN_PASSWORD && key === process.env.ADMIN_PASSWORD) return "admin";
  if (process.env.SALES_PASSWORD && key === process.env.SALES_PASSWORD) return "sales";
  return null;
}

async function readAll(db) {
  const raw = await db.get(STORE_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function writeAll(db, sponsorships) {
  await db.set(STORE_KEY, JSON.stringify(sponsorships));
}

function normalizeCityName(name) {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const db = getRedis();
  if (!db) {
    res.status(501).json({ error: "Storage not configured — add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel env vars." });
    return;
  }

  try {
    const role = getRole(req);

    if (req.method === "GET") {
      const all = await readAll(db);
      const city = req.query.city;
      const visible = role ? all : all.filter((s) => s.active !== false && s.status !== "pending");
      const filtered = city ? visible.filter((s) => normalizeCityName(s.city) === normalizeCityName(city)) : visible;
      res.status(200).json({ sponsorships: filtered, role: role || undefined });
      return;
    }

    if (!role) {
      res.status(401).json({ error: "Invalid admin key" });
      return;
    }

    if (req.method === "POST") {
      const { city, businessName, tagline, address, phone, imageUrl, ctaText, ctaLink, annualPrice, startDate, endDate } = req.body || {};
      if (!city || !businessName || !imageUrl) {
        res.status(400).json({ error: "City, business name, and image are required" });
        return;
      }
      const all = await readAll(db);
      const sponsorship = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        city: city.trim(),
        businessName: businessName.trim(),
        tagline: tagline || "",
        address: address || "",
        phone: phone || "",
        imageUrl,
        ctaText: ctaText || "Learn More",
        ctaLink: ctaLink || "",
        annualPrice: annualPrice || 3000,
        startDate: startDate || "",
        endDate: endDate || "",
        active: true,
        status: role === "admin" ? "approved" : "pending",
        createdBy: role,
        clicks: 0,
        createdAt: Date.now(),
      };
      all.push(sponsorship);
      await writeAll(db, all);
      res.status(200).json({ sponsorship });
      return;
    }

    if (req.method === "PUT") {
      const { id, ...updates } = req.body || {};
      if (!id) {
        res.status(400).json({ error: "id is required" });
        return;
      }
      const all = await readAll(db);
      const idx = all.findIndex((s) => s.id === id);
      if (idx === -1) {
        res.status(404).json({ error: "Sponsorship not found" });
        return;
      }

      if (role !== "admin") {
        delete updates.status;
        updates.status = "pending";
      }

      all[idx] = { ...all[idx], ...updates };
      await writeAll(db, all);
      res.status(200).json({ sponsorship: all[idx] });
      return;
    }

    if (req.method === "DELETE") {
      if (role !== "admin") {
        res.status(403).json({ error: "Only an admin can delete entries" });
        return;
      }
      const id = req.query.id;
      if (!id) {
        res.status(400).json({ error: "id is required" });
        return;
      }
      const all = await readAll(db);
      const filtered = all.filter((s) => s.id !== id);
      await writeAll(db, filtered);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Storage error" });
  }
};
