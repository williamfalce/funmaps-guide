// Vercel serverless function — manages Banner Ad partners (separate product from
// Featured Partners). These are commission-based: a promo code + click tracking
// support the 15%-of-sale verification model, rather than a flat listing fee.
//
// GET    /api/banners?city=Miami   -> list active banners for a city, no auth needed
// POST   /api/banners              -> add a banner (requires x-admin-key header)
// PUT    /api/banners              -> update a banner by id (requires x-admin-key header)
// DELETE /api/banners?id=...       -> remove a banner (requires x-admin-key header)

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

function checkAdmin(req) {
  const key = req.headers["x-admin-key"];
  return !!process.env.ADMIN_PASSWORD && key === process.env.ADMIN_PASSWORD;
}

async function readAll(db) {
  const raw = await db.get(STORE_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function writeAll(db, banners) {
  await db.set(STORE_KEY, JSON.stringify(banners));
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
      const visible = isAdmin ? all : all.filter((b) => b.active !== false);
      const filtered = city ? visible.filter((b) => b.city.toLowerCase().trim() === city.toLowerCase().trim()) : visible;
      res.status(200).json({ banners: filtered });
      return;
    }

    if (!checkAdmin(req)) {
      res.status(401).json({ error: "Invalid admin key" });
      return;
    }

    if (req.method === "POST") {
      const { city, businessName, category, tier, tagline, address, phone, imageUrl, ctaText, ctaLink, bookingLink, promoCode, promoIncentive } = req.body || {};
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
      all[idx] = { ...all[idx], ...updates };
      await writeAll(db, all);
      res.status(200).json({ banner: all[idx] });
      return;
    }

    if (req.method === "DELETE") {
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
