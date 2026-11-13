// Permanent links to the latest free trip guide and newsletter issue, so the
// Brevo welcome email (and anything else) never needs editing when a new
// quarter's guide or newsletter comes out. Not its own Vercel function: served
// by api/listings.js (vercel.json rewrites these addresses to
// /api/listings?resource=latest...).
//
// /guide        -> 302 to the latest guide (counts the visit)
// /newsletter   -> 302 to the latest newsletter issue (counts the visit)
// GET /api/latest   (admin) -> { latest, visits }
// PUT /api/latest   (admin) { guideUrl?, guideName?, newsletterUrl?, newsletterName? }

const { getRedis, getAuth } = require("./_auth");

const KEY = "settings:latest";
const VISITS = "settings:latest:visits";
const DEFAULTS = {
  guideUrl: "https://funmaps.com/wp-content/uploads/2026/10/FunMaps-LGBTQ-Fall-Winter-Guide-2026.pdf",
  guideName: "Fall & Winter 2026 LGBTQ+ Trip Guide",
  newsletterUrl: "http://sh1.sendinblue.com/notz9lqygc.html",
  newsletterName: "October 2026 newsletter",
};
const FALLBACK = "https://funmaps.com/";

function parse(v) {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? JSON.parse(v) : v;
}

async function readLatest(db) {
  return { ...DEFAULTS, ...((db && parse(await db.get(KEY))) || {}) };
}

const validUrl = (u) => /^https?:\/\/[^\s"'<>]+$/i.test(u) && u.length <= 1000;

async function handleLatest(req, res) {
  const db = getRedis();
  const go = req.query.go;

  // Public: the permanent links.
  if (go === "guide" || go === "newsletter") {
    let target = FALLBACK;
    try {
      const latest = await readLatest(db);
      target = (go === "guide" ? latest.guideUrl : latest.newsletterUrl) || FALLBACK;
      if (db) await db.hincrby(VISITS, go, 1);
    } catch (err) {
      console.error(err);
      if (!db) target = go === "guide" ? DEFAULTS.guideUrl : DEFAULTS.newsletterUrl;
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", target);
    res.status(302).end();
    return;
  }

  // Admin: read and change where they point.
  try {
    if (!db) return void res.status(501).json({ error: "Storage not configured" });
    const auth = await getAuth(req, db);
    if (!auth || auth.role !== "admin") return void res.status(403).json({ error: "Only an admin can change these links" });
    if (req.method === "GET") {
      const visits = (await db.hgetall(VISITS)) || {};
      return void res.status(200).json({ latest: await readLatest(db), visits: { guide: Number(visits.guide) || 0, newsletter: Number(visits.newsletter) || 0 } });
    }
    if (req.method === "PUT") {
      const b = req.body || {};
      const current = parse(await db.get(KEY)) || {};
      const next = { ...current };
      for (const k of ["guideUrl", "newsletterUrl"]) {
        if (b[k] === undefined) continue;
        const v = String(b[k]).trim();
        if (!validUrl(v)) return void res.status(400).json({ error: `Enter a full web address for the ${k === "guideUrl" ? "guide" : "newsletter"}, starting with https://` });
        next[k] = v;
      }
      for (const k of ["guideName", "newsletterName"]) if (b[k] !== undefined) next[k] = String(b[k]).trim().slice(0, 120);
      next.updatedAt = Date.now();
      next.updatedBy = auth.name;
      await db.set(KEY, JSON.stringify(next));
      return void res.status(200).json({ latest: await readLatest(db) });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = { handleLatest };
