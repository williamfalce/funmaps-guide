// Shared record storage for partners (banners), sponsorships and deals, in
// Upstash Redis. Files in /api that start with "_" are not endpoints.
//
// Each record is saved on its own (one Redis hash field per record), and click
// counts live in a separate hash updated with an atomic increment. So two
// people saving different records at the same moment, or a traveler's click
// landing while an admin saves, can no longer overwrite each other.
//
// The old format kept a whole collection as one JSON list under a single key
// (e.g. "banner-partners-v1"). The first request after deploying copies those
// records across once, without overwriting anything already in the new format.
// The old key is left untouched as a backup.

const STORES = {
  banners: { key: "banners", legacyKey: "banner-partners-v1" },
  sponsorships: { key: "sponsorships", legacyKey: "sponsorships-v1" },
  deals: { key: "deals", legacyKey: "deals-v1" },
  listings: { key: "listings", legacyKey: null }, // website listings: new, nothing to copy
};

function parse(v) {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? JSON.parse(v) : v;
}

function makeStore(db, name) {
  const cfg = STORES[name];
  if (!cfg) throw new Error(`Unknown store: ${name}`);
  const recordsKey = `${cfg.key}:records`;
  const clicksKey = `${cfg.key}:clicks`;
  const migratedKey = `${cfg.key}:migrated`;

  async function migrate() {
    if (!cfg.legacyKey) return;
    if (await db.get(migratedKey)) return;
    const legacy = parse(await db.get(cfg.legacyKey)) || [];
    for (const rec of legacy) {
      if (!rec || !rec.id) continue;
      const { clicks, ...rest } = rec;
      await db.hsetnx(recordsKey, rec.id, JSON.stringify(rest));
      if (clicks) await db.hsetnx(clicksKey, rec.id, Number(clicks) || 0);
    }
    await db.set(migratedKey, String(Date.now()));
  }

  function withClicks(rec, clicks) {
    return { ...rec, clicks: Number(clicks) || 0 };
  }

  return {
    // All records, oldest first, with click counts merged in.
    async all() {
      await migrate();
      const [records, clicks] = await Promise.all([db.hgetall(recordsKey), db.hgetall(clicksKey)]);
      const c = clicks || {};
      return Object.values(records || {})
        .map(parse)
        .filter(Boolean)
        .map((r) => withClicks(r, c[r.id]))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    },

    async get(id) {
      await migrate();
      const [raw, clicks] = await Promise.all([db.hget(recordsKey, id), db.hget(clicksKey, id)]);
      const rec = parse(raw);
      return rec ? withClicks(rec, clicks) : null;
    },

    // Saves one record. Click counts are never written here; only incrementClicks changes them.
    async put(rec) {
      await migrate();
      const { clicks, ...rest } = rec;
      await db.hset(recordsKey, { [rec.id]: JSON.stringify(rest) });
      return rec;
    },

    async remove(id) {
      await migrate();
      await Promise.all([db.hdel(recordsKey, id), db.hdel(clicksKey, id)]);
    },

    // Atomic +1; only counts clicks for records that exist.
    async incrementClicks(id) {
      await migrate();
      if (!(await db.hexists(recordsKey, id))) return false;
      await db.hincrby(clicksKey, id, 1);
      return true;
    },
  };
}

module.exports = { makeStore };
