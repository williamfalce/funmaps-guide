// The FunMaps digital rate card endpoint. Not its own Vercel function: it is
// served by api/listings.js (vercel.json rewrites /api/rate-card to
// /api/listings?resource=rate-card) to stay under the Hobby plan's limit of
// 12 serverless functions per deployment.
//
// GET /api/rate-card   -> products, add-ons, categories and the digital commission rate.
//                         Public: these are published prices, used by the admin panel
//                         and the website's "Advertise with us" page.
// PUT /api/rate-card   -> admin only. { digitalCommissionRate?, products?: {id: {price?, active?}},
//                         addOns?: {id: {price?, active?}} }
//
// Changing a price here affects new listings only; existing listings keep the
// price they were sold at.

const { getRedis, getAuth } = require("./_auth");
const { getRateCard, saveRateCard } = require("./_rateCard");

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

async function handleRateCard(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const db = getRedis();
  try {
    if (req.method === "GET") {
      const card = await getRateCard(db);
      const auth = db ? await getAuth(req, db) : null;
      if (!auth) {
        // The public doesn't need to see products that are switched off or who edited prices.
        card.products = card.products.filter((p) => p.active);
        card.addOns = card.addOns.filter((a) => a.active);
        card.compass = card.compass.filter((x) => x.active);
        delete card.updatedBy;
        delete card.digitalCommissionRate;
      }
      res.status(200).json({ rateCard: card });
      return;
    }

    if (req.method === "PUT") {
      if (!db) {
        res.status(501).json({ error: "Storage not configured" });
        return;
      }
      const auth = await getAuth(req, db);
      if (!auth || auth.role !== "admin") {
        res.status(403).json({ error: "Only an admin can change the rate card" });
        return;
      }
      const card = await saveRateCard(db, req.body || {}, auth.name);
      res.status(200).json({ rateCard: card });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = { handleRateCard };
