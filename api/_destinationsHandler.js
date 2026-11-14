// Destination cards on the homepage: an admin-editable photo and one-line hook
// per destination (the destinations themselves are in src/site/siteData.js).
// Not its own Vercel function: served by api/listings.js (vercel.json rewrites
// /api/destinations to /api/listings?resource=destinations).
//
// GET /api/destinations           -> { destinations: { <slug>: { imageUrl?, hook? } } }  (public)
// PUT /api/destinations (admin)   { slug, imageUrl?, hook?, showOnHome? }  or  { season }   ("" clears back to the default)

const { getRedis, getAuth } = require("./_auth");

const KEY = "settings:destinations";
const SEASON_KEY = "settings:season"; // the homepage heading: "Popular <season> Destinations"
const SEASONS = ["Winter", "Spring", "Summer", "Fall", ""];
const DEFAULT_SEASON = "Winter";
const parse = (v) => (v === null || v === undefined ? null : typeof v === "string" ? JSON.parse(v) : v);

async function handleDestinations(req, res) {
  const db = getRedis();
  try {
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "public, max-age=60");
      const season = db ? await db.get(SEASON_KEY) : null;
      return void res.status(200).json({ destinations: (db && parse(await db.get(KEY))) || {}, season: season === null || season === undefined ? DEFAULT_SEASON : String(season) });
    }
    if (req.method !== "PUT") return void res.status(405).json({ error: "Method not allowed" });
    if (!db) return void res.status(501).json({ error: "Storage not configured" });
    const auth = await getAuth(req, db);
    if (!auth || auth.role !== "admin") return void res.status(403).json({ error: "Only an admin can change destination cards" });
    const { slug, imageUrl, hook, showOnHome, season } = req.body || {};
    if (season !== undefined) {
      if (!SEASONS.includes(season)) return void res.status(400).json({ error: "Unknown season" });
      await db.set(SEASON_KEY, season);
      return void res.status(200).json({ destinations: parse(await db.get(KEY)) || {}, season });
    }
    if (!/^[a-z0-9-]{1,60}$/.test(String(slug || ""))) return void res.status(400).json({ error: "Unknown destination" });
    const all = parse(await db.get(KEY)) || {};
    const entry = { ...(all[slug] || {}) };
    if (imageUrl !== undefined) {
      const u = String(imageUrl || "").trim();
      if (u && (!/^https?:\/\/[^\s"'<>]+$/i.test(u) || u.length > 1000)) return void res.status(400).json({ error: "Upload the photo again" });
      if (u) entry.imageUrl = u;
      else delete entry.imageUrl;
    }
    if (hook !== undefined) {
      const h = String(hook || "").trim().slice(0, 90);
      if (h) entry.hook = h;
      else delete entry.hook;
    }
    if (showOnHome !== undefined) entry.showOnHome = !!showOnHome;
    entry.updatedBy = auth.name;
    entry.updatedAt = Date.now();
    all[slug] = entry;
    await db.set(KEY, JSON.stringify(all));
    res.status(200).json({ destinations: all });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = { handleDestinations };
