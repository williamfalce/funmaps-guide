// Vercel serverless function — manages Banner Ad partners (separate product from
// Featured Partners). These are commission-based: a promo code + click tracking
// support the 15%-of-sale verification model, rather than a flat listing fee.
//
// Approval workflow: two passwords, two roles.
// Sign-in is handled by ./_auth (individual team accounts, plus the owner's
// ADMIN_PASSWORD and the legacy shared SALES_PASSWORD).
//   admin -> role "admin"  -> entries go live immediately, can approve/reject/delete
//   sales -> role "sales"  -> entries always saved as "pending", invisible to travelers until approved
//
// GET    /api/banners?city=Miami   -> list APPROVED+active banners for a city, no auth needed
//                                      (with a valid admin/sales key, returns everything instead, for the admin panel)
// POST   /api/banners              -> add a banner (requires x-admin-key header)
// PUT    /api/banners              -> update a banner by id (requires x-admin-key header)
// DELETE /api/banners?id=...       -> remove a banner (admin role only)

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const STORE_NAME = "banners"; // see api/_store.js

// Fields that are private business terms or internal metadata. Travelers never
// need them, so they are stripped from public (unauthenticated) GET responses.
// Signed-in admin and sales requests still receive the full records.
const PRIVATE_FIELDS = ["commissionRate", "annualPrice", "clicks", "createdBy", "pendingChanges", "pendingChangesAt", "pendingChangesBy", "createdByName", "createdByUserId", "updatedByName", "reviewNote", "reviewNoteBy", "reviewNoteAt", "changesSentBack"];
// Fields no PUT may overwrite: identity and system-tracked values.
const SYSTEM_FIELDS = ["id", "clicks", "createdBy", "createdAt", "pendingChanges", "pendingChangesAt", "pendingChangesBy", "createdByName", "createdByUserId", "updatedByName", "reviewNote", "reviewNoteBy", "reviewNoteAt", "changesSentBack"];
// Sales reps may negotiate and set the commission rate; a sales edit always
// returns the entry to "pending", so an admin approves the final rate.
function validRate(v) {
  const n = Number(v);
  return v !== "" && v !== null && v !== undefined && Number.isFinite(n) && n >= 0 && n <= 100;
}
function sanitizeUpdates(updates, role) {
  for (const f of SYSTEM_FIELDS) delete updates[f];
  if ("commissionRate" in updates) {
    if (validRate(updates.commissionRate)) updates.commissionRate = Number(updates.commissionRate);
    else delete updates.commissionRate;
  }
  return updates;
}

function toPublic(record) {
  const copy = { ...record };
  for (const f of PRIVATE_FIELDS) delete copy[f];
  return copy;
}

const { getRedis, getAuth } = require("./_auth");
const { makeStore } = require("./_store");
const { isUnapproved, sendBack, clearReview } = require("./_review");


function normalizeCityName(name) {
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
    const store = makeStore(db, STORE_NAME);

    if (req.method === "GET") {
      const all = await store.all();
      const city = req.query.city;
      // Public (traveler-facing) requests only ever see approved + active entries.
      // Any authenticated admin-panel request (either role) sees everything, so
      // the panel can show pending items for review.
      const visible = role ? all : all.filter((b) => b.active !== false && !isUnapproved(b.status));
      const filtered = city ? visible.filter((b) => normalizeCityName(b.city) === normalizeCityName(city)) : visible;
      res.status(200).json({ banners: role ? filtered : filtered.map(toPublic), role: role || undefined });
      return;
    }

    if (!role) {
      res.status(401).json({ error: "Invalid admin key" });
      return;
    }

    if (req.method === "POST") {
      const { city, businessName, category, tier, priceTier, tagline, address, phone, imageUrl, ctaText, ctaLink, bookingLink, promoCode, promoIncentive, commissionRate } = req.body || {};
      if (!city || !businessName) {
        res.status(400).json({ error: "City and business name are required" });
        return;
      }
      const resolvedTier = tier === "premium" ? "premium" : "basic";
      if (resolvedTier === "premium" && !imageUrl) {
        res.status(400).json({ error: "Premium tier requires an uploaded image or logo" });
        return;
      }
      const banner = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        city: city.trim(),
        businessName: businessName.trim(),
        category: category || "Attractions",
        tier: resolvedTier,
        priceTier: ["$", "$$", "$$$"].includes(priceTier) ? priceTier : "$$",
        tagline: tagline || "",
        address: address || "",
        phone: phone || "",
        imageUrl: imageUrl || "",
        ctaText: ctaText || "Learn More",
        ctaLink: ctaLink || "",
        bookingLink: bookingLink || "",
        promoCode: promoCode || "",
        promoIncentive: promoIncentive || "",
        // The rate negotiated by the rep or admin; falls back to the tier default if
        // left blank. Sales entries are saved as "pending" for an admin to approve.
        commissionRate: validRate(commissionRate) ? Number(commissionRate) : resolvedTier === "premium" ? 22 : 15,
        active: true,
        status: role === "admin" ? "approved" : "pending",
        createdBy: role,
        createdByName: auth.name,
        createdByUserId: auth.userId,
        clicks: 0,
        createdAt: Date.now(),
      };
      await store.put(banner);
      res.status(200).json({ banner });
      return;
    }

    if (req.method === "PUT") {
      const { id, ...updates } = req.body || {};
      sanitizeUpdates(updates, role);
      if (!id) {
        res.status(400).json({ error: "id is required" });
        return;
      }
      const existing = await store.get(id);
      if (!existing) {
        res.status(404).json({ error: "Banner not found" });
        return;
      }

      // Admin "Send back to rep" with a required note (see api/_review.js).
      if (updates.sendBack) {
        if (role !== "admin") {
          res.status(403).json({ error: "Only an admin can send entries back" });
          return;
        }
        const result = sendBack(existing, updates.note, auth);
        if (result.error) {
          res.status(400).json({ error: result.error });
          return;
        }
        await store.put(result.record);
        res.status(200).json({ banner: result.record });
        return;
      }
      delete updates.sendBack;
      delete updates.note;

      let updated;
      const PENDING_META = ["pendingChanges", "pendingChangesAt", "pendingChangesBy"];
      if (role !== "admin") {
        // Sales never sets status or review decisions directly.
        delete updates.status;
        delete updates.approveChanges;
        delete updates.rejectChanges;
        if (!isUnapproved(existing.status)) {
          // Live (already approved) entry: keep the approved version visible to
          // travelers and stage the edit as proposed changes for an admin to review.
          updated = {
            ...existing,
            pendingChanges: { ...(existing.pendingChanges || {}), ...updates },
            pendingChangesAt: Date.now(),
            pendingChangesBy: auth.name,
            changesSentBack: false, // resubmitted after being sent back, if it was
          };
        } else {
          // Not yet approved: edit the pending entry in place; it stays pending.
          updated = { ...existing, ...updates, status: "pending", updatedByName: auth.name };
        }
      } else {
        // Admin: { approveChanges: true } applies staged changes first,
        // { rejectChanges: true } discards them; any other fields are saved directly.
        const { approveChanges, rejectChanges, ...rest } = updates;
        let merged = { ...existing };
        if (approveChanges && existing.pendingChanges) merged = { ...merged, ...existing.pendingChanges };
        merged = { ...merged, ...rest };
        if (approveChanges || rejectChanges) for (const f of PENDING_META) delete merged[f];
        merged.updatedByName = auth.name;
        if (approveChanges || rejectChanges || (merged.status === "approved" && isUnapproved(existing.status))) clearReview(merged);
        updated = merged;
      }
      await store.put(updated);
      res.status(200).json({ banner: updated });
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
      await store.remove(id);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Storage error" });
  }
};
