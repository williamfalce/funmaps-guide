// Shared sign-in helpers for the admin API. Files in /api that start with "_"
// are not deployed as their own endpoints on Vercel; they are only required by
// the real endpoints (banners.js, sponsorships.js, deals.js, auth.js, ...).
//
// Who can sign in:
//   1. Individual team members (admins and sales reps) with their own email and
//      password, created in the admin panel's Team tab. Signing in returns a
//      session token, sent on every request in the x-admin-key header.
//   2. ADMIN_PASSWORD (Vercel env var) — the owner's master password. Always an
//      admin, so the owner can never be locked out.
//   3. SALES_PASSWORD (Vercel env var) — the old shared sales login. Still
//      accepted during the switch-over, but entries are labeled "Sales (shared
//      login)" so commissions can't be credited to a rep. Remove the env var in
//      Vercel once every rep has their own account.

const crypto = require("crypto");

const USERS_KEY = "team-users-v1";
const SESSION_PREFIX = "session:";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

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

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const [, salt, hash] = stored.split("$");
  const test = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return safeEqual(test, hash);
}

async function readUsers(db) {
  const raw = await db.get(USERS_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function writeUsers(db, users) {
  await db.set(USERS_KEY, JSON.stringify(users));
}

function publicUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

async function createSession(db, user) {
  const token = "sess_" + crypto.randomBytes(32).toString("hex");
  await db.set(SESSION_PREFIX + token, JSON.stringify({ userId: user.id, createdAt: Date.now() }), { ex: SESSION_TTL_SECONDS });
  return token;
}

async function deleteSession(db, token) {
  if (token && token.startsWith("sess_")) await db.del(SESSION_PREFIX + token);
}

// Returns { role, userId, name } for a signed-in request, or null.
async function getAuth(req, db) {
  const key = req.headers["x-admin-key"];
  if (!key) return null;
  if (process.env.ADMIN_PASSWORD && safeEqual(key, process.env.ADMIN_PASSWORD)) {
    return { role: "admin", userId: "owner", name: "Admin (owner)" };
  }
  if (process.env.SALES_PASSWORD && safeEqual(key, process.env.SALES_PASSWORD)) {
    return { role: "sales", userId: "shared-sales", name: "Sales (shared login)" };
  }
  if (!db || !String(key).startsWith("sess_")) return null;
  const raw = await db.get(SESSION_PREFIX + key);
  if (!raw) return null;
  const session = typeof raw === "string" ? JSON.parse(raw) : raw;
  const users = await readUsers(db);
  const user = users.find((u) => u.id === session.userId);
  // Deactivated users lose access immediately, even with an unexpired session.
  if (!user || user.active === false) return null;
  return { role: user.role === "admin" ? "admin" : "sales", userId: user.id, name: user.name };
}

module.exports = {
  getRedis,
  getAuth,
  hashPassword,
  verifyPassword,
  readUsers,
  writeUsers,
  publicUser,
  createSession,
  deleteSession,
  SESSION_PREFIX,
};
