// Vercel serverless function — logs a click on a partner banner, sponsorship
// banner or deal. Called by the traveler app whenever a real visitor taps one,
// before they're redirected. No admin auth needed since end users trigger it.
//
// Old addresses keep working through rewrites in vercel.json:
//   /api/banner-click       -> /api/click?type=banners
//   /api/deal-click         -> /api/click?type=deals
//   /api/sponsorship-click  -> /api/click?type=sponsorships
// (One function instead of three keeps the project under the Vercel Hobby
// plan's limit of 12 serverless functions per deployment.)
//
// Clicks are counted with an atomic increment in their own Redis hash (see
// api/_store.js), so a click can never overwrite an admin's or rep's edit.

const { getRedis } = require("./_auth");
const { makeStore } = require("./_store");

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const TYPES = ["banners", "deals", "sponsorships"];

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

  const type = req.query.type;
  if (!TYPES.includes(type)) {
    res.status(400).json({ error: "Unknown click type" });
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
    await makeStore(db, type).incrementClicks(String(id));
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(200).json({ ok: false }); // still fail quietly
  }
};
