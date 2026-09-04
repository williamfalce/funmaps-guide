// Vercel serverless function — logs a banner ad click. Called by the app itself
// whenever a real visitor taps a banner, before they're redirected to the
// partner's link. No admin auth needed since this is triggered by end users.

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

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const db = getRedis();
  if (!db) {
    res.status(200).json({ ok: false }); // fail quietly — never block the user's click-through
    return;
  }

  try {
    const { id } = req.body || {};
    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }
    const raw = await db.get(STORE_KEY);
    const all = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
    const idx = all.findIndex((b) => b.id === id);
    if (idx !== -1) {
      all[idx].clicks = (all[idx].clicks || 0) + 1;
      await db.set(STORE_KEY, JSON.stringify(all));
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(200).json({ ok: false }); // still fail quietly
  }
};
