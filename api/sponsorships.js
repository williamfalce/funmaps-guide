// Vercel serverless function — manages Sponsorship banners. A third, distinct
// partner product: flat $3,000/year fee (not commission-based), one slot per
// destination that rotates among however many sponsors exist for that city.
//
// GET    /api/sponsorships?city=Miami   -> list active sponsors for a city, no auth needed
// POST   /api/sponsorships              -> add a sponsor (requires x-admin-key header)
// PUT    /api/sponsorships              -> update a sponsor by id (requires x-admin-key header)
// DELETE /api/sponsorships?id=...       -> remove a sponsor (requires x-admin-key header)

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

function checkAdmin(req) {
  const key = req.headers["x-admin-key"];
  return !!process.env.ADMIN_PASSWORD && key === process.env.ADMIN_PASSWORD;
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
    if (req.method === "GET") {
      const all = await readAll(db);
      const city = req.query.city;
      const isAdmin = checkAdmin(req);
      const visible = isAdmin ? all : all.filter((s) => s.active !== false);
      const filtered = city ? visible.filter((s) => normalizeCityName(s.city) === normalizeCityName(city)) : visible;
      res.status(200).json({ sponsorships: filtered });
      return;
    }

    if (!checkAdmin(req)) {
      res.status(401).json({ error: "Invalid admin key" });
      return;
    }

    if (req.method === "POST") {
      const { city, businessName, tagline, imageUrl, ctaText, ctaLink, annualPrice, startDate, endDate } = req.body || {};
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
        imageUrl,
        ctaText: ctaText || "Learn More",
        ctaLink: ctaLink || "",
        annualPrice: annualPrice || 3000,
        startDate: startDate || "",
        endDate: endDate || "",
        active: true,
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
      all[idx] = { ...all[idx], ...updates };
      await writeAll(db, all);
      res.status(200).json({ sponsorship: all[idx] });
      return;
    }

    if (req.method === "DELETE") {
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
