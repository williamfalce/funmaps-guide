// Vercel serverless function — FunMaps.com website listings (the rate card's
// Gold Star, Premium and Basic profiles), entered by sales reps and approved by
// admins in the admin panel's Website Listings tab.
//
// GET    /api/listings?city=&category=  -> public: only LIVE listings (see isLive), best tier
//                                          first, order rotated within a tier so advertisers
//                                          share top billing. Signed in: every listing.
// POST   /api/listings                  -> add a listing (signed in)
// PUT    /api/listings                  -> update by id (signed in)
// DELETE /api/listings?id=...           -> remove (admin only)
// /api/rate-card is also served from here; see api/_rateCardHandler.js.
//
// Approval works like Compass partners: admin saves go live; sales saves are
// "pending"; a sales edit to an approved listing is kept as proposed changes
// (pendingChanges) while the approved version stays live, until an admin
// approves ({ approveChanges: true }) or rejects ({ rejectChanges: true }) it.
//
// Until DocuSign is connected, an admin marks the contract signed by hand.

const { getRedis, getAuth } = require("./_auth");
const { makeStore } = require("./_store");
const { isUnapproved, sendBack, clearReview } = require("./_review");
const { getRateCard, validMoney } = require("./_rateCard");
const { handleRateCard } = require("./_rateCardHandler");
const { handleStories } = require("./_storiesHandler");
const { handleSubscribe } = require("./_subscribeHandler");
const { handleLatest } = require("./_latestHandler");
const { handleDestinations } = require("./_destinationsHandler");

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// Never set through POST/PUT bodies.
const SYSTEM_FIELDS = ["id", "clicks", "createdBy", "createdByName", "createdByUserId", "createdAt", "updatedByName", "pendingChanges", "pendingChangesAt", "pendingChangesBy", "reviewNote", "reviewNoteBy", "reviewNoteAt", "changesSentBack", "lastCheckedAt"];
// Only admins may change these; sales values are dropped.
// "verified" is FunMaps LGBTQ+ Verified: earned through the free Verified review, never
// tied to advertising, so only admins set it.
const ADMIN_ONLY_FIELDS = ["contractSigned", "repCommissionRate", "verified"];
// Fields travelers (and the public website) may see.
const PUBLIC_FIELDS = ["id", "city", "businessName", "category", "address", "phone", "website", "googleUrl", "description", "imageUrl", "product", "verified", "tribes", "lat", "lng"];
const PENDING_META = ["pendingChanges", "pendingChangesAt", "pendingChangesBy"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isDate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

function addOneYear(d) {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y + 1, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() - 1); // a one-year term ends the day before the anniversary
  return dt.toISOString().slice(0, 10);
}

function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function cleanUrl(v) {
  const t = String(v || "").trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

// The free directory listing: no contract, payment, dates, photo or description.
const FREE_PRODUCT = "directory";
const isFree = (l) => l.product === FREE_PRODUCT;

// A listing shows on the website only when all of these are true.
// Free directory listings only need admin approval and not being paused.
function isLive(l, onDate = today()) {
  if (l.status !== "approved" || l.active === false) return false;
  if (isFree(l)) return true;
  return (
    l.contractSigned === true &&
    l.paymentReceived === true &&
    (!l.startDate || l.startDate <= onDate) &&
    (!l.endDate || onDate <= l.endDate)
  );
}

// Cleans the fields present in `input`. Returns { fields } or { error }.
function normalize(input, card, { creating }) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
  const str = (k, max = 500) => String(input[k] ?? "").trim().slice(0, max);

  if (creating || has("businessName")) {
    out.businessName = str("businessName", 200);
    if (!out.businessName) return { error: "Business name is required" };
  }
  if (creating || has("city")) {
    out.city = str("city", 200);
    if (!out.city) return { error: "City is required" };
  }
  if (creating || has("category")) {
    out.category = card.categories.includes(input.category) ? input.category : null;
    if (!out.category) return { error: "Choose a category" };
  }
  if (creating || has("product")) {
    const p = card.products.find((x) => x.id === input.product);
    if (!p) return { error: "Choose a rate card product" };
    if (!p.active && creating) return { error: "That product isn't currently offered" };
    out.product = p.id;
  }
  for (const k of ["address", "phone", "signerName", "signerTitle"]) if (has(k)) out[k] = str(k, 300);
  if (has("description")) out.description = str("description", 2000);
  for (const k of ["website", "googleUrl"]) if (has(k)) out[k] = cleanUrl(input[k]).slice(0, 1000);
  if (has("imageUrl")) {
    // Must be the address the image upload returned (Vercel Blob), never a pasted data blob.
    out.imageUrl = String(input.imageUrl || "").trim();
    if (out.imageUrl && (!/^https?:\/\//i.test(out.imageUrl) || out.imageUrl.length > 1000)) return { error: "Upload the image again" };
  }
  if (has("signerEmail")) {
    out.signerEmail = str("signerEmail", 200).toLowerCase();
    if (out.signerEmail && !validEmail(out.signerEmail)) return { error: "Enter a valid signer email" };
  }
  if (has("partnerId")) out.partnerId = str("partnerId", 100);
  if (has("addOns")) {
    const ids = Array.isArray(input.addOns) ? input.addOns : [];
    out.addOns = card.addOns.filter((a) => ids.includes(a.id)).map((a) => a.id);
  }
  if (has("price")) {
    if (input.price === "" || input.price === null) out.price = null; // fall back to rate card below
    else if (validMoney(input.price)) out.price = Number(input.price);
    else return { error: "Enter a valid price" };
  }
  if (has("startDate")) {
    if (input.startDate && !isDate(input.startDate)) return { error: "Enter a valid start date" };
    out.startDate = input.startDate || "";
  }
  if (has("endDate")) {
    if (input.endDate && !isDate(input.endDate)) return { error: "Enter a valid end date" };
    out.endDate = input.endDate || "";
  }
  if (has("tribes")) {
    const picked = Array.isArray(input.tribes) ? input.tribes : [];
    out.tribes = (card.tribes || []).filter((t) => picked.includes(t));
  }
  if (has("verified")) out.verified = !!input.verified;
  if (has("lat") || has("lng")) {
    // Map location, looked up from the address by the admin screen. Blank clears it.
    const lat = input.lat === "" || input.lat === null ? null : Number(input.lat);
    const lng = input.lng === "" || input.lng === null ? null : Number(input.lng);
    const ok = (v, max) => v === null || (Number.isFinite(v) && Math.abs(v) <= max);
    if (!ok(lat, 90) || !ok(lng, 180)) return { error: "Invalid map location" };
    out.lat = lat;
    out.lng = lng;
  }
  if (has("paymentReceived")) out.paymentReceived = !!input.paymentReceived;
  if (has("contractSigned")) out.contractSigned = !!input.contractSigned;
  if (has("active")) out.active = !!input.active;
  if (has("repCommissionRate")) {
    if (!validMoney(input.repCommissionRate) || Number(input.repCommissionRate) > 100) return { error: "Enter a commission between 0 and 100" };
    out.repCommissionRate = Number(input.repCommissionRate);
  }
  return { fields: out };
}

// Fills in derived values after a create or merge.
function finalize(rec, card) {
  const p = card.products.find((x) => x.id === rec.product);
  if (isFree(rec)) {
    Object.assign(rec, { price: 0, addOns: [], imageUrl: "", description: "", endDate: "" });
    if (!rec.startDate) rec.startDate = today();
    return rec;
  }
  if ((rec.price === null || rec.price === undefined) && p) rec.price = p.price;
  if (!rec.startDate) rec.startDate = today();
  if (!rec.endDate || rec.endDate < rec.startDate) rec.endDate = addOneYear(rec.startDate);
  return rec;
}

function toPublic(rec, card) {
  const out = {};
  for (const k of PUBLIC_FIELDS) if (rec[k] !== undefined) out[k] = rec[k];
  const p = card.products.find((x) => x.id === rec.product);
  if (p) {
    out.productName = p.name;
    out.label = p.label || null; // "Recommended" or "Featured" (paid placements); none for free listings
    out.rank = p.rank;
    out.image = p.image;
  }
  return out;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normCity(name) {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

module.exports = async (req, res) => {
  // /api/rate-card is rewritten here (see vercel.json) to save a serverless function.
  if (req.query.resource === "rate-card") return handleRateCard(req, res);
  // /api/stories (Traveler Stories) is served from here too; see api/_storiesHandler.js.
  if (req.query.resource === "stories") return handleStories(req, res);
  // /api/subscribe (newsletter sign-up, sent to Brevo); see api/_subscribeHandler.js.
  if (req.query.resource === "subscribe") return handleSubscribe(req, res);
  // /guide, /newsletter and /api/latest (permanent links); see api/_latestHandler.js.
  if (req.query.resource === "latest") return handleLatest(req, res);
  // /api/destinations (homepage destination cards); see api/_destinationsHandler.js.
  if (req.query.resource === "destinations") return handleDestinations(req, res);
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
    const auth = await getAuth(req, db);
    const role = auth ? auth.role : null;
    const store = makeStore(db, "listings");
    const card = await getRateCard(db);

    if (req.method === "GET") {
      const all = await store.all();
      const { city, category } = req.query;
      const match = (l) => (!city || normCity(l.city) === normCity(city)) && (!category || l.category === category);
      if (role) {
        const now = today();
        res.status(200).json({ listings: all.filter(match).map((l) => ({ ...l, live: isLive(l, now) })), role });
        return;
      }
      const live = all.filter((l) => isLive(l) && match(l)).map((l) => toPublic(l, card));
      // Best tier first; within a tier, a fresh random order each request.
      const byRank = {};
      for (const l of live) (byRank[l.rank ?? 99] = byRank[l.rank ?? 99] || []).push(l);
      // Free directory listings (no label) aren't rotated: Verified first, then A to Z.
      const az = (list) => list.sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0) || a.businessName.localeCompare(b.businessName));
      const ordered = Object.keys(byRank).map(Number).sort((a, b) => a - b).flatMap((r) => (byRank[r][0].label ? shuffle(byRank[r]) : az(byRank[r])));
      res.status(200).json({ listings: ordered });
      return;
    }

    if (!auth) {
      res.status(401).json({ error: "Invalid admin key" });
      return;
    }

    if (req.method === "POST") {
      const body = { ...(req.body || {}) };
      for (const f of SYSTEM_FIELDS) delete body[f];
      if (role !== "admin") for (const f of ADMIN_ONLY_FIELDS) delete body[f];
      const { fields, error } = normalize(body, card, { creating: true });
      if (error) {
        res.status(400).json({ error });
        return;
      }
      const listing = finalize(
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          address: "",
          phone: "",
          website: "",
          googleUrl: "",
          description: "",
          imageUrl: "",
          addOns: [],
          signerName: "",
          signerEmail: "",
          signerTitle: "",
          paymentReceived: false,
          contractSigned: false,
          verified: false,
          tribes: [],
          lat: null,
          lng: null,
          repCommissionRate: card.digitalCommissionRate,
          ...fields,
          active: true,
          status: role === "admin" ? "approved" : "pending",
          createdBy: role,
          lastCheckedAt: role === "admin" ? today() : null,
          createdByName: auth.name,
          createdByUserId: auth.userId,
          createdAt: Date.now(),
        },
        card
      );
      await store.put(listing);
      res.status(200).json({ listing });
      return;
    }

    if (req.method === "PUT") {
      const { id, approveChanges, rejectChanges, sendBack: doSendBack, note, markChecked, ...body } = req.body || {};
      if (!id) {
        res.status(400).json({ error: "id is required" });
        return;
      }
      const existing = await store.get(String(id));
      if (!existing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }
      // Admin "Send back to rep" with a required note (see api/_review.js).
      if (doSendBack) {
        if (role !== "admin") {
          res.status(403).json({ error: "Only an admin can send entries back" });
          return;
        }
        const result = sendBack(existing, note, auth);
        if (result.error) {
          res.status(400).json({ error: result.error });
          return;
        }
        await store.put(result.record);
        res.status(200).json({ listing: { ...result.record, live: isLive(result.record) } });
        return;
      }
      for (const f of SYSTEM_FIELDS) delete body[f];
      delete body.status;
      if (role !== "admin") for (const f of ADMIN_ONLY_FIELDS) delete body[f];
      const { fields, error } = normalize(body, card, { creating: false });
      if (error) {
        res.status(400).json({ error });
        return;
      }

      let updated;
      if (role !== "admin") {
        if (!isUnapproved(existing.status)) {
          // Live listing: keep the approved version up; stage the edit for review.
          updated = {
            ...existing,
            pendingChanges: { ...(existing.pendingChanges || {}), ...fields },
            pendingChangesAt: Date.now(),
            pendingChangesBy: auth.name,
            changesSentBack: false, // resubmitted after being sent back, if it was
          };
        } else {
          updated = finalize({ ...existing, ...fields, status: "pending", updatedByName: auth.name }, card);
        }
      } else {
        let merged = { ...existing };
        if (approveChanges && existing.pendingChanges) merged = { ...merged, ...existing.pendingChanges };
        merged = { ...merged, ...fields };
        if (req.body.status === "approved" || approveChanges) merged.status = "approved";
        if (approveChanges || rejectChanges) for (const f of PENDING_META) delete merged[f];
        merged.updatedByName = auth.name;
        // "Last checked": an admin confirmed the details are still right (saved the
        // whole form, approved it, or clicked "Mark checked today").
        if (markChecked || req.body.status === "approved" || approveChanges) merged.lastCheckedAt = today();
        if (approveChanges || rejectChanges || (merged.status === "approved" && isUnapproved(existing.status))) clearReview(merged);
        updated = finalize(merged, card);
      }
      await store.put(updated);
      res.status(200).json({ listing: { ...updated, live: isLive(updated) } });
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
      await store.remove(String(id));
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Storage error" });
  }
};

module.exports.isLive = isLive;
