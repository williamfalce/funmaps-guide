// Vercel serverless function — manages time-limited Deals. Unlike Partners and
// Sponsorships, deals are inherently temporary: a discount code, a special
// offer, valid until a specific date. Rather than storing a price that goes
// stale, this stores the OFFER itself with an expiration date, and
// automatically stops showing it once that date passes — no manual cleanup.
//
// Approval workflow: two passwords, two roles — same as Partners/Sponsorships.
//   ADMIN_PASSWORD -> role "admin"  -> entries go live immediately, can approve/reject/delete
//   SALES_PASSWORD -> role "sales"  -> entries always saved as "pending", invisible until approved
//
// GET    /api/deals?city=Miami   -> list APPROVED+active+NOT-YET-EXPIRED deals, no auth needed
//                                    (with a valid admin/sales key, returns everything, for the admin panel)
// POST   /api/deals              -> add a deal (requires x-admin-key header)
// PUT    /api/deals              -> update a deal by id (requires x-admin-key header)
// DELETE /api/deals?id=...       -> remove a deal (admin role only)

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const STORE_KEY = "deals-v1";

let redis = null;
function getRedis() {
  if (redis) return redis;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const { Redis } = require("@upstash/redis");
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redis;
}

function getRole(req) {
  const key = req.headers["x-admin-key"];
  if (!key) return null;
  if (process.env.ADMIN_PASSWORD && key === process.env.ADMIN_PASSWORD) return "admin";
  if (process.env.SALES_PASSWORD && key === process.env.SALES_PASSWORD) return "sales";
  return null;
}

async function readAll(db) {
  const raw = await db.get(STORE_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function writeAll(db, deals) {
  await db.set(STORE_KEY, JSON.stringify(deals));
}

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
    const role = getRole(req);

    if (req.method === "GET") {
      const all = await readAll(db);
      const city = req.query.city;
      // Public (traveler-facing) requests only see approved + active + not-yet-expired
      // deals. Admin panel requests (either role) see everything, including expired
      // ones, so staff can review history rather than have deals just vanish.
      const visible = role ? all : all.filter((d) => d.active !== false && d.status !== "pending" && isVisible(d));
      const filtered = city ? visible.filter((d) => normalizeCityName(d.city) === normalizeCityName(city)) : visible;
      // Sort soonest-ending first for the public feed — creates natural urgency
      // and surfaces the most time-sensitive offers at the top.
      filtered.sort((a, b) => {
        if (!a.endDate) return 1;
        if (!b.endDate) return -1;
        return new Date(a.endDate) - new Date(b.endDate);
      });
      res.status(200).json({ deals: filtered, role: role || undefined });
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
      const all = await readAll(db);
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
        clicks: 0,
        createdAt: Date.now(),
      };
      all.push(deal);
      await writeAll(db, all);
      res.status(200).json({ deal });
      return;
    }

    if (req.method === "PUT") {
      const { id, ...updates } = req.body || {};
      if (!id) {
        res.status(400).json({ error: "id is required" });
        return;
      }
      const all = await readAll(db);
      const idx = all.findIndex((d) => d.id === id);
      if (idx === -1) {
        res.status(404).json({ error: "Deal not found" });
        return;
      }
      if (role !== "admin") {
        delete updates.status;
        updates.status = "pending";
      }
      all[idx] = { ...all[idx], ...updates };
      await writeAll(db, all);
      res.status(200).json({ deal: all[idx] });
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
      const filtered = all.filter((d) => d.id !== id);
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
