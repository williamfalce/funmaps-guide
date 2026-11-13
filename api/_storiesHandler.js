// Traveler Stories: personal trip stories sent in by travelers through the
// website's "Share your trip" page, reviewed by admins in the admin panel.
// Not its own Vercel function: served by api/listings.js (vercel.json rewrites
// /api/stories to /api/listings?resource=stories) to stay under the Hobby
// plan's limit of 12 serverless functions.
//
// Public (no sign-in):
//   POST /api/stories?action=photo   { imageDataUrl }  -> { url }   one photo, before submitting
//   POST /api/stories                { ...story }       -> { ok }    the submission
// Admins:
//   GET    /api/stories                                 -> { stories, wordpressReady }
//   PUT    /api/stories   { id, status?, adminNote? }   -> { story }
//   PUT    /api/stories   { id, sendToWordPress: true } -> { story } creates a WordPress draft
//   DELETE /api/stories?id=
//
// Nothing a traveler sends is ever published automatically. Published stories
// live in WordPress (category "Traveler Stories"); the website reads them there.

const crypto = require("crypto");
const { put } = require("@vercel/blob");
const { getRedis, getAuth } = require("./_auth");
const { makeStore } = require("./_store");

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const STATUSES = ["new", "accepted", "published", "declined"];
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;
const PHOTO_URLS_KEY = "stories:photo-urls"; // photos uploaded through this form; only these may be attached
const WP_CATEGORY_SLUG = "traveler-stories";

function clientKey(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown").split(",")[0].trim();
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24); // never store the raw address
}

// Allows `max` actions per `seconds` for this key. Returns false once over.
async function allow(db, key, max, seconds) {
  const n = await db.incr(key);
  if (n === 1) await db.expire(key, seconds);
  return n <= max;
}

const str = (v, max) => String(v ?? "").trim().slice(0, max);
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function wordpressConfig() {
  const url = (process.env.WORDPRESS_URL || "https://funmaps.com").replace(/\/+$/, "");
  const user = process.env.WORDPRESS_USER;
  const pass = process.env.WORDPRESS_APP_PASSWORD;
  return user && pass ? { url, auth: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64") } : null;
}

const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function storyHtml(s) {
  const when = s.tripMonth ? `, ${escapeHtml(s.tripMonth)}` : "";
  const parts = [`<p><em>A traveler story by ${escapeHtml(s.displayName)} · ${escapeHtml(s.destination)}${when}</em></p>`];
  if (s.hosted) parts.push(`<p><em>Disclosure: part of this trip was hosted or provided free${s.hostedDetails ? ` (${escapeHtml(s.hostedDetails)})` : ""}.</em></p>`);
  for (const para of s.story.split(/\n{2,}|\r\n\r\n/)) if (para.trim()) parts.push(`<p>${escapeHtml(para.trim()).replace(/\n/g, "<br>")}</p>`);
  for (const url of s.photos || []) parts.push(`<figure><img src="${escapeHtml(url)}" alt="" /></figure>`);
  return parts.join("\n");
}

async function wpFetch(wp, path, options = {}) {
  const r = await fetch(`${wp.url}/wp-json/wp/v2/${path}`, {
    ...options,
    headers: { Authorization: wp.auth, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `WordPress answered ${r.status}`);
  return data;
}

async function travelerStoriesCategory(wp) {
  const found = await wpFetch(wp, `categories?slug=${WP_CATEGORY_SLUG}`);
  if (Array.isArray(found) && found[0]) return found[0].id;
  const made = await wpFetch(wp, "categories", { method: "POST", body: JSON.stringify({ name: "Traveler Stories", slug: WP_CATEGORY_SLUG }) });
  return made.id;
}

async function handleStories(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  const db = getRedis();
  if (!db) {
    res.status(501).json({ error: "Storage not configured" });
    return;
  }

  try {
    const store = makeStore(db, "stories");

    // ---------- Public: one photo ----------
    if (req.method === "POST" && req.query.action === "photo") {
      if (!(await allow(db, `stories:photo-limit:${clientKey(req)}`, 25, 60 * 60))) {
        res.status(429).json({ error: "Too many photos sent. Try again in an hour." });
        return;
      }
      const m = String((req.body || {}).imageDataUrl || "").match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
      if (!m) {
        res.status(400).json({ error: "Please choose a JPEG, PNG or WebP photo." });
        return;
      }
      const buffer = Buffer.from(m[2], "base64");
      if (buffer.length > MAX_PHOTO_BYTES) {
        res.status(413).json({ error: "That photo is too large. Please choose a smaller one." });
        return;
      }
      const blob = await put(`traveler-stories/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${m[1] === "jpeg" ? "jpg" : m[1]}`, buffer, {
        access: "public",
        contentType: `image/${m[1]}`,
      });
      await db.hset(PHOTO_URLS_KEY, { [blob.url]: Date.now() });
      res.status(200).json({ url: blob.url });
      return;
    }

    // ---------- Public: the story ----------
    if (req.method === "POST") {
      const b = req.body || {};
      // Spam checks: a hidden field people never fill in, and a form filled in
      // implausibly fast. Both get a normal-looking answer and are dropped.
      const tooFast = Number(b.startedAt) && Date.now() - Number(b.startedAt) < 8000;
      if (str(b.website, 200) || tooFast) {
        res.status(200).json({ ok: true });
        return;
      }
      const story = {
        displayName: str(b.displayName, 80),
        email: str(b.email, 200).toLowerCase(),
        destination: str(b.destination, 120),
        tripMonth: str(b.tripMonth, 40),
        title: str(b.title, 160),
        story: str(b.story, 20000),
        hosted: !!b.hosted,
        hostedDetails: b.hosted ? str(b.hostedDetails, 300) : "",
        consent: b.consent === true,
        contestEntry: !!b.contestEntry,
      };
      if (!story.displayName || !story.destination || !story.title) return void res.status(400).json({ error: "Please fill in your name, destination and a title." });
      if (!validEmail(story.email)) return void res.status(400).json({ error: "Please enter a valid email address so we can reach you." });
      if (story.story.length < 300) return void res.status(400).json({ error: "Please tell us a little more: at least 300 characters." });
      if (!story.consent) return void res.status(400).json({ error: "Please tick the box giving FunMaps permission to publish your story." });
      const photos = Array.isArray(b.photos) ? b.photos.slice(0, MAX_PHOTOS).map((u) => String(u)) : [];
      for (const url of photos) {
        if (!(await db.hget(PHOTO_URLS_KEY, url))) return void res.status(400).json({ error: "Please add your photos again." });
      }
      // Counted only once the story is complete, so fixing a mistake doesn't use up a try.
      if (!(await allow(db, `stories:submit-limit:${clientKey(req)}`, 5, 24 * 60 * 60)) || !(await allow(db, "stories:submit-limit:all", 300, 24 * 60 * 60))) {
        res.status(429).json({ error: "We've received a lot of stories today. Please try again tomorrow." });
        return;
      }
      const rec = {
        id: `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
        ...story,
        photos,
        status: "new",
        adminNote: "",
        consentAt: Date.now(),
        createdAt: Date.now(),
      };
      await store.put(rec);
      res.status(200).json({ ok: true });
      return;
    }

    // ---------- Admins only from here ----------
    const auth = await getAuth(req, db);
    if (!auth || auth.role !== "admin") {
      res.status(403).json({ error: "Only an admin can review traveler stories" });
      return;
    }

    if (req.method === "GET") {
      const stories = (await store.all()).map(({ clicks, ...s }) => s).reverse(); // newest first
      res.status(200).json({ stories, wordpressReady: !!wordpressConfig() });
      return;
    }

    if (req.method === "PUT") {
      const { id, status, adminNote, sendToWordPress } = req.body || {};
      const existing = id && (await store.get(String(id)));
      if (!existing) {
        res.status(404).json({ error: "Story not found" });
        return;
      }
      const next = { ...existing, updatedByName: auth.name, updatedAt: Date.now() };
      delete next.clicks;
      if (status !== undefined) {
        if (!STATUSES.includes(status)) return void res.status(400).json({ error: "Unknown status" });
        next.status = status;
      }
      if (adminNote !== undefined) next.adminNote = str(adminNote, 2000);
      if (sendToWordPress) {
        const wp = wordpressConfig();
        if (!wp) return void res.status(501).json({ error: "WordPress isn't connected yet. Use Copy story for now." });
        let post;
        try {
          const category = await travelerStoriesCategory(wp);
          post = await wpFetch(wp, existing.wpPostId ? `posts/${existing.wpPostId}` : "posts", {
            method: "POST",
            body: JSON.stringify({ title: existing.title, content: storyHtml(existing), status: "draft", categories: [category] }),
          });
        } catch (e) {
          res.status(502).json({ error: `WordPress didn't accept the draft: ${e.message}` });
          return;
        }
        next.wpPostId = post.id;
        next.wpEditUrl = `${wp.url}/wp-admin/post.php?post=${post.id}&action=edit`;
        if (next.status === "new") next.status = "accepted";
      }
      await store.put(next);
      res.status(200).json({ story: next });
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) return void res.status(400).json({ error: "id is required" });
      await store.remove(String(id));
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = { handleStories, storyHtml };
