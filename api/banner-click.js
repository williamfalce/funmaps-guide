// Vercel serverless function — logs a banner ad click. Called by the app itself
// whenever a real visitor taps it, before they're redirected to the partner's
// link. No admin auth needed since this is triggered by end users.
//
// Clicks are counted with an atomic increment in their own Redis hash (see
// api/_store.js), so a click can never overwrite an admin's or rep's edit.

const { getRedis } = require("./_auth");
const { makeStore } = require("./_store");

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

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
    await makeStore(db, "banners").incrementClicks(String(id));
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(200).json({ ok: false }); // still fail quietly
  }
};
