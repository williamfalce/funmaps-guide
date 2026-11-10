// Vercel serverless function — manages time-limited Deals. Unlike Partners and
// Sponsorships, deals are inherently temporary: a discount code, a special
// offer, valid until a specific date. Rather than storing a price that goes
// stale, this stores the OFFER itself with an expiration date, and
// automatically stops showing it once that date passes — no manual cleanup.
//
// Approval workflow: two passwords, two roles — same as Partners/Sponsorships.
// Sign-in is handled by ./_auth (individual team accounts, plus the owner's
// ADMIN_PASSWORD and the legacy shared SALES_PASSWORD).
//   admin -> role "admin"  -> entries go live immediately, can approve/reject/delete
//   sales -> role "sales"  -> entries always saved as "pending", invisible until approved
//
// GET    /api/deals?city=Miami   -> list APPROVED+active+NOT-YET-EXPIRED deals, no auth needed
//                                    (with a valid admin/sales key, returns everything, for the admin panel)
// POST   /api/deals              -> add a deal (requires x-admin-key header)
// PUT    /api/deals              -> update a deal by id (requires x-admin-key header)
// DELETE /api/deals?id=...       -> remove a deal (admin role only)

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const STORE_NAME = "deals"; // see api/_store.js

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

function isVisible(deal) {
  // Deals show as soon as they're approved, even before their "Valid From"
  // date — for a travel-planning business, letting travelers see an upcoming
  // deal in advance is more useful than hiding it until the exact start date,
  // since trips are often planned weeks ahead. "Valid From" is shown to
  // travelers as informational text (when the offer actually becomes
  // redeemable), not as a visibility gate. "Valid Until" still controls
  // actual visibility, since an expired deal genuinely shouldn't keep showing.
  const now = Date.now();
  if (deal.endDate) {
    const end = new Date(deal.endDate + "T23:59:59");
    if (end.getTime() < now) return false; // already ended
  }
  return true;
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
      // Public (traveler-facing) requests only see approved + active + not-yet-expired
      // deals. Admin panel requests (either role) see everything, including expired
      // ones, so staff can review history rather than have deals just vanish.
      const visible = role ? all : all.filter((d) => d.active !== false && !isUnapproved(d.status) && isVisible(d));
      const filtered = city ? visible.filter((d) => normalizeCityName(d.city) === normalizeCityName(city)) : visible;
      // Sort soonest-ending first for the public feed — creates natural urgency
      // and surfaces the most time-sensitive offers at the top.
      filtered.sort((a, b) => {
        if (!a.endDate) return 1;
        if (!b.endDate) return -1;
        return new Date(a.endDate) - new Date(b.endDate);
      });
      res.status(200).json({ deals: role ? filtered : filtered.map(toPublic), role: role || undefined });
      return;
    }

    if (!role) {
      res.status(401).json({ error: "Invalid admin key" });
      return;
    }

    if (req.method === "POST") {
      const { city, businessName, dealDescription, discountCode, dealLink, imageUrl, startDate, endDate } = req.body || {};
      if (!city || !businessName || !dealDescription) {
        res.status(400).json({ error: "City, business name, and deal description are required" });
        return;
      }
      const deal = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        city: city.trim(),
        businessName: businessName.trim(),
        dealDescription: dealDescription.trim(),
        discountCode: discountCode || "",
        dealLink: dealLink || "",
        imageUrl: imageUrl || "",
        startDate: startDate || "",
        endDate: endDate || "",
        active: true,
        status: role === "admin" ? "approved" : "pending",
        createdBy: role,
        createdByName: auth.name,
        createdByUserId: auth.userId,
        clicks: 0,
        createdAt: Date.now(),
      };
      await store.put(deal);
      res.status(200).json({ deal });
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
        res.status(404).json({ error: "Deal not found" });
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
        res.status(200).json({ deal: result.record });
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
      res.status(200).json({ deal: updated });
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
