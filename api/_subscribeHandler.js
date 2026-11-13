// Newsletter sign-up from the website's pop-up, sent to Brevo. Not its own
// Vercel function: served by api/listings.js (vercel.json rewrites
// /api/subscribe to /api/listings?resource=subscribe) to stay under the Hobby
// plan's limit of 12 serverless functions.
//
// POST /api/subscribe  { email, firstName?, interests?: [], website? (spam trap), startedAt? }
//
// Uses Brevo's double opt-in: Brevo emails a "Confirm your subscription" link;
// once clicked, the contact joins the "FunMaps Newsletter" list (#3). The
// Brevo automation "Welcome message" starts on "Contact added to list #3" and
// sends the welcome email with the free trip guide.
//
// Needs BREVO_API_KEY in Vercel (a Restricted key with Contacts: Read/write).

const crypto = require("crypto");
const { getRedis } = require("./_auth");

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const NEWSLETTER_LIST_ID = Number(process.env.BREVO_NEWSLETTER_LIST_ID || 3);
const DOI_TEMPLATE_ID = Number(process.env.BREVO_DOI_TEMPLATE_ID || 4); // "Confirm your subscription"
// The INTERESTS multiple-choice options set up in Brevo (Contacts → Settings).
const INTERESTS = ["Beach & Tropical", "City Breaks", "Pride & Events", "Cruises", "Luxury", "Bear", "Leather", "Travel Deals", "Weddings"];
// Where the confirmation link sends people: our own "You're in" page.
const SITE_HOSTS = { "funmaps.com": "/subscribed", "www.funmaps.com": "/subscribed", "compass.funmaps.com": "/site/subscribed" };

const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

function clientKey(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown").split(",")[0].trim();
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

async function handleSubscribe(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return void res.status(204).end();
  if (req.method !== "POST") return void res.status(405).json({ error: "Method not allowed" });

  const key = process.env.BREVO_API_KEY;
  if (!key) return void res.status(501).json({ error: "Sign-up isn't switched on yet. Please try again soon." });

  const b = req.body || {};
  // Spam trap and too-fast forms get a normal answer and are dropped.
  if (String(b.website || "").trim() || (Number(b.startedAt) && Date.now() - Number(b.startedAt) < 2500)) {
    return void res.status(200).json({ ok: true });
  }
  const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
  if (!validEmail(email)) return void res.status(400).json({ error: "Please enter a valid email address." });
  const firstName = String(b.firstName || "").trim().slice(0, 60);
  const interests = (Array.isArray(b.interests) ? b.interests : []).filter((i) => INTERESTS.includes(i));

  const db = getRedis();
  if (db) {
    const k = `subscribe-limit:${clientKey(req)}`;
    const n = await db.incr(k);
    if (n === 1) await db.expire(k, 60 * 60);
    if (n > 8) return void res.status(429).json({ error: "Too many sign-ups from here. Please try again in an hour." });
  }

  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase().split(":")[0];
  const redirectionUrl = `https://${SITE_HOSTS[host] ? host : "funmaps.com"}${SITE_HOSTS[host] || "/subscribed"}`;
  const attributes = {};
  if (firstName) attributes.FIRSTNAME = firstName;
  if (interests.length) attributes.INTERESTS = interests;

  const brevo = (path, method, body) =>
    fetch(`https://api.brevo.com/v3/${path}`, {
      method,
      headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  const fail = (status, data) => {
    // The reference helps us look the problem up; it holds no private details.
    const ref = `${status}${data && data.code ? ` ${data.code}` : ""}`;
    res.status(502).json({ error: `We couldn't sign you up just now. Please try again in a few minutes. (Ref: ${ref})` });
  };

  // Someone already on the newsletter list: no new confirmation email (and no
  // second welcome email, which only fires when someone joins the list); just
  // add any new interests and their first name.
  async function alreadySubscribed() {
    const c = await brevo(`contacts/${encodeURIComponent(email)}`, "GET");
    const contact = c.ok ? await c.json().catch(() => null) : null;
    if (!contact || !(contact.listIds || []).includes(NEWSLETTER_LIST_ID) || contact.emailBlacklisted) return false;
    const had = (contact.attributes && contact.attributes.INTERESTS) || [];
    const merged = [...new Set([...(Array.isArray(had) ? had : []), ...interests])];
    const update = {};
    if (firstName) update.FIRSTNAME = firstName;
    if (merged.length) update.INTERESTS = merged;
    if (Object.keys(update).length) await brevo(`contacts/${encodeURIComponent(email)}`, "PUT", { attributes: update });
    return true;
  }

  try {
    if (await alreadySubscribed()) return void res.status(200).json({ ok: true, alreadySubscribed: true });
    const r = await brevo("contacts/doubleOptinConfirmation", "POST", { email, attributes, includeListIds: [NEWSLETTER_LIST_ID], templateId: DOI_TEMPLATE_ID, redirectionUrl });
    if (r.ok) return void res.status(200).json({ ok: true });
    const data = await r.json().catch(() => ({}));
    console.error("Brevo sign-up failed", r.status, data.code, data.message);

    if (r.status === 400 && (data.code === "duplicate_parameter" || /already exist/i.test(data.message || "")) && (await alreadySubscribed())) {
      return void res.status(200).json({ ok: true, alreadySubscribed: true });
    }
    if (r.status === 400 && /email/i.test(data.message || "") && !/already/i.test(data.message || "")) {
      return void res.status(400).json({ error: "Please check your email address." });
    }
    fail(r.status, data);
  } catch (err) {
    console.error(err);
    fail("network");
  }
}

module.exports = { handleSubscribe, INTERESTS };
