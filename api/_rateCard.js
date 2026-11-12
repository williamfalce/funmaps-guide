// The rate card: defaults live in src/rateCard.json (shared with the admin
// panel and the future website); admins' price and on/off changes are saved in
// Redis under OVERRIDES_KEY and applied on top. Not an endpoint (leading "_").

const DEFAULTS = require("../src/rateCard.json");

const OVERRIDES_KEY = "rate-card:overrides";

function parse(v) {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? JSON.parse(v) : v;
}

function validMoney(v) {
  const n = Number(v);
  return v !== "" && v !== null && v !== undefined && Number.isFinite(n) && n >= 0 && n <= 1000000;
}

function applyOverrides(o) {
  o = o || {};
  const p = o.products || {};
  const a = o.addOns || {};
  return {
    digitalCommissionRate: validMoney(o.digitalCommissionRate) && Number(o.digitalCommissionRate) <= 100 ? Number(o.digitalCommissionRate) : DEFAULTS.digitalCommissionRate,
    products: DEFAULTS.products.map((x) => ({
      ...x,
      price: p[x.id] && validMoney(p[x.id].price) ? Number(p[x.id].price) : x.price,
      active: !(p[x.id] && p[x.id].active === false),
    })),
    addOns: DEFAULTS.addOns.map((x) => ({
      ...x,
      price: a[x.id] && validMoney(a[x.id].price) ? Number(a[x.id].price) : x.price,
      active: !(a[x.id] && a[x.id].active === false),
    })),
    categories: DEFAULTS.categories.slice(),
    tribeGroups: (DEFAULTS.tribeGroups || []).map((g) => ({ group: g.group, tribes: g.tribes.slice() })),
    tribes: (DEFAULTS.tribeGroups || []).flatMap((g) => g.tribes),
    updatedAt: o.updatedAt || null,
    updatedBy: o.updatedBy || null,
  };
}

async function getRateCard(db) {
  return applyOverrides(db ? parse(await db.get(OVERRIDES_KEY)) : null);
}

// Accepts { digitalCommissionRate?, products?: {id: {price?, active?}}, addOns?: {id: {price?, active?}} }.
// Unknown ids and invalid prices are ignored.
async function saveRateCard(db, input, byName) {
  const current = parse(await db.get(OVERRIDES_KEY)) || {};
  const next = { products: { ...(current.products || {}) }, addOns: { ...(current.addOns || {}) }, digitalCommissionRate: current.digitalCommissionRate };
  const merge = (target, defaults, changes) => {
    for (const [id, ch] of Object.entries(changes || {})) {
      if (!defaults.some((d) => d.id === id) || !ch) continue;
      const t = { ...(target[id] || {}) };
      if (validMoney(ch.price)) t.price = Number(ch.price);
      if (ch.active !== undefined) t.active = !!ch.active;
      target[id] = t;
    }
  };
  merge(next.products, DEFAULTS.products, input.products);
  merge(next.addOns, DEFAULTS.addOns, input.addOns);
  if (input.digitalCommissionRate !== undefined && validMoney(input.digitalCommissionRate) && Number(input.digitalCommissionRate) <= 100) {
    next.digitalCommissionRate = Number(input.digitalCommissionRate);
  }
  next.updatedAt = Date.now();
  next.updatedBy = byName;
  await db.set(OVERRIDES_KEY, JSON.stringify(next));
  return applyOverrides(next);
}

module.exports = { getRateCard, saveRateCard, validMoney };
