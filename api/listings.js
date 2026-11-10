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
//
// Approval works like Compass partners: admin saves go live; sales saves are
// "pending"; a sales edit to an approved listing is kept as proposed changes
// (pendingChanges) while the approved version stays live, until an admin
// approves ({ approveChanges: true }) or rejects ({ rejectChanges: true }) it.
//
// Until DocuSign is connected, an admin marks the contract signed by hand.

const { getRedis, getAuth } = require("./_auth");
const { makeStore } = require("./_store");
const { getRateCard, validMoney } = require("./_rateCard");

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// Never set through POST/PUT bodies.
const SYSTEM_FIELDS = ["id", "clicks", "createdBy", "createdByName", "createdByUserId", "createdAt", "updatedByName", "pendingChanges", "pendingChangesAt", "pendingChangesBy"];
// Only admins may change these; sales values are dropped.
const ADMIN_ONLY_FIELDS = ["contractSigned", "repCommissionRate"];
// Fields travelers (and the public website) may see.
const PUBLIC_FIELDS = ["id", "city", "businessName", "category", "address", "phone", "website", "googleUrl", "description", "imageUrl", "product"];
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

// A listing shows on the website only when all of these are true.
function isLive(l, onDate = today()) {
  return (
    l.status === "approved" &&
    l.active !== false &&
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
    out.label = p.label; // "Recommended" or "Featured" — the paid-placement label shown on the site
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
      const ordered = Object.keys(byRank).map(Number).sort((a, b) => a - b).flatMap((r) => shuffle(byRank[r]));
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
          repCommissionRate: card.digitalCommissionRate,
          ...fields,
          active: true,
          status: role === "admin" ? "approved" : "pending",
          createdBy: role,
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
      const { id, approveChanges, rejectChanges, ...body } = req.body || {};
      if (!id) {
        res.status(400).json({ error: "id is required" });
        return;
      }
      const existing = await store.get(String(id));
      if (!existing) {
        res.status(404).json({ error: "Listing not found" });
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
        if (existing.status !== "pending") {
          // Live listing: keep the approved version up; stage the edit for review.
          updated = {
            ...existing,
            pendingChanges: { ...(existing.pendingChanges || {}), ...fields },
            pendingChangesAt: Date.now(),
            pendingChangesBy: auth.name,
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
