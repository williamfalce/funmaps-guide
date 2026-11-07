// Vercel serverless function — manages Sponsorship banners. A third, distinct
// partner product: flat $3,000/year fee (not commission-based), one slot per
// destination that rotates among however many sponsors exist for that city.
//
// Approval workflow: two passwords, two roles.
// Sign-in is handled by ./_auth (individual team accounts, plus the owner's
// ADMIN_PASSWORD and the legacy shared SALES_PASSWORD).
//   admin -> role "admin"  -> entries go live immediately, can approve/reject/delete
//   sales -> role "sales"  -> entries always saved as "pending", invisible to travelers until approved
//
// GET    /api/sponsorships?city=Miami   -> list APPROVED+active sponsors, no auth needed
//                                          (with a valid admin/sales key, returns everything, for the admin panel)
// POST   /api/sponsorships              -> add a sponsor (requires x-admin-key header)
// PUT    /api/sponsorships              -> update a sponsor by id (requires x-admin-key header)
// DELETE /api/sponsorships?id=...       -> remove a sponsor (admin role only)

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const STORE_KEY = "sponsorships-v1";

// Fields that are private business terms or internal metadata. Travelers never
// need them, so they are stripped from public (unauthenticated) GET responses.
// Signed-in admin and sales requests still receive the full records.
const PRIVATE_FIELDS = ["commissionRate", "annualPrice", "clicks", "createdBy", "pendingChanges", "pendingChangesAt", "pendingChangesBy", "createdByName", "createdByUserId", "updatedByName"];
// Fields no PUT may overwrite: identity and system-tracked values.
const SYSTEM_FIELDS = ["id", "clicks", "createdBy", "createdAt", "pendingChanges", "pendingChangesAt", "pendingChangesBy", "createdByName", "createdByUserId", "updatedByName"];
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

async function readAll(db) {
  const raw = await db.get(STORE_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function writeAll(db, sponsorships) {
  await db.set(STORE_KEY, JSON.stringify(sponsorships));
}

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

    if (req.method === "GET") {
      const all = await readAll(db);
      const city = req.query.city;
      const visible = role ? all : all.filter((s) => s.active !== false && s.status !== "pending");
      const filtered = city ? visible.filter((s) => normalizeCityName(s.city) === normalizeCityName(city)) : visible;
      res.status(200).json({ sponsorships: role ? filtered : filtered.map(toPublic), role: role || undefined });
      return;
    }

    if (!role) {
      res.status(401).json({ error: "Invalid admin key" });
      return;
    }

    if (req.method === "POST") {
      const { city, businessName, tagline, address, phone, imageUrl, ctaText, ctaLink, annualPrice, startDate, endDate } = req.body || {};
      if (!city || !businessName || !imageUrl) {
        res.status(400).json({ error: "City, business name, and image are required" });
        return;
      }
      const all = await readAll(db);
      const sponsorship = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        city: city.trim(),
        businessName: businessName.trim(),
        tagline: tagline || "",
        address: address || "",
        phone: phone || "",
        imageUrl,
        ctaText: ctaText || "Learn More",
        ctaLink: ctaLink || "",
        annualPrice: annualPrice || 3000,
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
      all.push(sponsorship);
      await writeAll(db, all);
      res.status(200).json({ sponsorship });
      return;
    }

    if (req.method === "PUT") {
      const { id, ...updates } = req.body || {};
      sanitizeUpdates(updates, role);
      if (!id) {
        res.status(400).json({ error: "id is required" });
        return;
      }
      const all = await readAll(db);
      const idx = all.findIndex((s) => s.id === id);
      if (idx === -1) {
        res.status(404).json({ error: "Sponsorship not found" });
        return;
      }

      const existing = all[idx];
      const PENDING_META = ["pendingChanges", "pendingChangesAt", "pendingChangesBy"];
      if (role !== "admin") {
        // Sales never sets status or review decisions directly.
        delete updates.status;
        delete updates.approveChanges;
        delete updates.rejectChanges;
        if (existing.status !== "pending") {
          // Live (already approved) entry: keep the approved version visible to
          // travelers and stage the edit as proposed changes for an admin to review.
          all[idx] = {
            ...existing,
            pendingChanges: { ...(existing.pendingChanges || {}), ...updates },
            pendingChangesAt: Date.now(),
            pendingChangesBy: auth.name,
          };
        } else {
          // Not yet approved: edit the pending entry in place; it stays pending.
          all[idx] = { ...existing, ...updates, status: "pending", updatedByName: auth.name };
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
        all[idx] = merged;
      }
      await writeAll(db, all);
      res.status(200).json({ sponsorship: all[idx] });
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
      const all = await readAll(db);
      const filtered = all.filter((s) => s.id !== id);
      await writeAll(db, filtered);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Storage error" });
  }
};
