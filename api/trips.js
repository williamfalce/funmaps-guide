// Vercel serverless function for the "share by code" feature.
// Requires a free Upstash Redis database — see README for setup.
// If UPSTASH env vars aren't set, this endpoint returns a clear error
// instead of crashing, so the rest of the app still works fine.

let redis = null;
function getRedis() {
  if (redis) return redis;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  const { Redis } = require("@upstash/redis");
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redis;
}

const NINETY_DAYS = 60 * 60 * 24 * 90;

module.exports = async (req, res) => {
  const db = getRedis();
  if (!db) {
    res.status(501).json({
      error: "Sharing isn't set up yet — add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your Vercel project settings. See README.",
    });
    return;
  }

  try {
    if (req.method === "POST") {
      const { code, data } = req.body || {};
      if (!code || !data) {
        res.status(400).json({ error: "Missing 'code' or 'data'" });
        return;
      }
      await db.set(`trip:${code}`, JSON.stringify(data), { ex: NINETY_DAYS });
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "GET") {
      const code = (req.query.code || "").toUpperCase();
      if (!code) {
        res.status(400).json({ error: "Missing 'code' query param" });
        return;
      }
      const value = await db.get(`trip:${code}`);
      if (!value) {
        res.status(404).json({ error: "No trip found with that code" });
        return;
      }
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      res.status(200).json({ data: parsed });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).json({ error: "Storage error" });
  }
};
