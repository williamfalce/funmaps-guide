// Vercel serverless function — manages Banner Ad partners (separate product from
// Featured Partners). These are commission-based: a promo code + click tracking
// support the 15%-of-sale verification model, rather than a flat listing fee.
//
// Approval workflow: two passwords, two roles.
//   ADMIN_PASSWORD -> role "admin"  -> entries go live immediately, can approve/reject/delete
//   SALES_PASSWORD -> role "sales"  -> entries always saved as "pending", invisible to travelers until approved
//
// GET    /api/banners?city=Miami   -> list APPROVED+active banners for a city, no auth needed
//                                      (with a valid admin/sales key, returns everything instead, for the admin panel)
// POST   /api/banners              -> add a banner (requires x-admin-key header)
// PUT    /api/banners              -> update a banner by id (requires x-admin-key header)
// DELETE /api/banners?id=...       -> remove a banner (admin role only)

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const STORE_KEY = "banner-partners-v1";

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

async function writeAll(db, banners) {
  await db.set(STORE_KEY, JSON.stringify(banners));
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
      // Public (traveler-facing) requests only ever see approved + active entries.
      // Any authenticated admin-panel request (either role) sees everything, so
      // the panel can show pending items for review.
      const visible = role ? all : all.filter((b) => b.active !== false && b.status !== "pending");
      const filtered = city ? visible.filter((b) => normalizeCityName(b.city) === normalizeCityName(city)) : visible;
      res.status(200).json({ banners: filtered, role: role || undefined });
      return;
    }

    if (!role) {
      res.status(401).json({ error: "Invalid admin key" });
      return;
    }

    if (req.method === "POST") {
      const { city, businessName, category, tier, priceTier, tagline, address, phone, imageUrl, ctaText, ctaLink, bookingLink, promoCode, promoIncentive } = req.body || {};
      if (!city || !businessName) {
        res.status(400).json({ error: "City and business name are required" });
        return;
      }
      const resolvedTier = tier === "premium" ? "premium" : "basic";
      if (resolvedTier === "premium" && !imageUrl) {
        res.status(400).json({ error: "Premium tier requires an uploaded image or logo" });
        return;
      }
      const all = await readAll(db);
      const banner = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        city: city.trim(),
        businessName: businessName.trim(),
        category: category || "Attractions",
        tier: resolvedTier,
        priceTier: ["$", "$$", "$$$"].includes(priceTier) ? priceTier : "$$",
        tagline: tagline || "",
        address: address || "",
        phone: phone || "",
        imageUrl: imageUrl || "",
        ctaText: ctaText || "Learn More",
        ctaLink: ctaLink || "",
        bookingLink: bookingLink || "",
        promoCode: promoCode || "",
        promoIncentive: promoIncentive || "",
        commissionRate: resolvedTier === "premium" ? 22 : 15,
        active: true,
        status: role === "admin" ? "approved" : "pending",
        createdBy: role,
        clicks: 0,
        createdAt: Date.now(),
      };
      all.push(banner);
      await writeAll(db, all);
      res.status(200).json({ banner });
      return;
    }

    if (req.method === "PUT") {
      const { id, ...updates } = req.body || {};
      if (!id) {
        res.status(400).json({ error: "id is required" });
        return;
      }
      const all = await readAll(db);
      const idx = all.findIndex((b) => b.id === id);
      if (idx === -1) {
        res.status(404).json({ error: "Banner not found" });
        return;
      }

      // A sales-role edit (even to something already approved) sends it back
      // for re-review — never let sales silently self-approve via updates.
      // Only an admin-role request may set status directly (used by the
      // Approve/Reject buttons, which send { status: "approved" } etc.).
      if (role !== "admin") {
        delete updates.status;
        updates.status = "pending";
      }

      all[idx] = { ...all[idx], ...updates };
      await writeAll(db, all);
      res.status(200).json({ banner: all[idx] });
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
      const filtered = all.filter((b) => b.id !== id);
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
