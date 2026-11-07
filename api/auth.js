// Vercel serverless function — sign-in and team accounts for the admin panel.
//
// POST /api/auth?action=login   { email, password }   -> { token, role, name }
// POST /api/auth?action=logout                         -> ends the current session
// GET  /api/auth?action=me                             -> { role, name, userId } for the current sign-in
// GET  /api/auth?action=users                          -> list team members (admin only)
// POST /api/auth?action=users   { name, email, role, password }            -> add a member (admin only)
// PUT  /api/auth?action=users   { id, name?, email?, role?, active?, password? } -> update (admin only)
// POST /api/auth?action=forgot  { email }              -> emails a reset link (if email is configured)
// POST /api/auth?action=reset   { token, password }    -> sets a new password from a reset link
// POST /api/auth?action=change-password { currentPassword, newPassword } -> signed-in member changes own password
//
// Reset emails are sent through Resend (resend.com) when these Vercel env vars are set:
//   RESEND_API_KEY        - API key from resend.com
//   PASSWORD_RESET_FROM   - sender, e.g. "FunMaps Compass <no-reply@funmaps.com>" (domain verified in Resend)
//   PUBLIC_BASE_URL       - optional, defaults to https://compass.funmaps.com
// Without them, "Forgot password?" tells the person to ask an admin.
//
// Team members are stored in Upstash Redis. Passwords are stored only as salted
// scrypt hashes. Sessions last 30 days; deactivating a member ends access at once.

const crypto = require("crypto");
const {
  getRedis,
  getAuth,
  hashPassword,
  verifyPassword,
  readUsers,
  writeUsers,
  publicUser,
  createSession,
  deleteSession,
} = require("./_auth");

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const MAX_LOGIN_ATTEMPTS = 10; // per email, per 15 minutes
const MIN_PASSWORD_LENGTH = 10;
const RESET_TTL_SECONDS = 60 * 60; // reset links work for 1 hour, once
const MAX_RESET_REQUESTS = 3; // per email, per hour

function sha256(t) {
  return crypto.createHash("sha256").update(String(t)).digest("hex");
}

function resetEmailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.PASSWORD_RESET_FROM);
}

async function sendResetEmail(to, name, link) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.PASSWORD_RESET_FROM,
      to: [to],
      subject: "Reset your FunMaps Compass password",
      text:
        `Hi ${name},\n\nSomeone asked to reset the password for your FunMaps Compass admin account.\n` +
        `To choose a new password, open this link within 1 hour:\n\n${link}\n\n` +
        `If you didn't ask for this, you can ignore this email; your password won't change.\n\nFunMaps`,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

function normEmail(e) {
  return String(e || "").trim().toLowerCase();
}

function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
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

  const action = req.query.action;

  try {
    if (action === "login" && req.method === "POST") {
      const email = normEmail(req.body && req.body.email);
      const password = (req.body && req.body.password) || "";
      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }
      const attemptsKey = `login-attempts:${email}`;
      const attempts = await db.incr(attemptsKey);
      if (attempts === 1) await db.expire(attemptsKey, 15 * 60);
      if (attempts > MAX_LOGIN_ATTEMPTS) {
        res.status(429).json({ error: "Too many sign-in attempts. Wait 15 minutes and try again." });
        return;
      }
      const users = await readUsers(db);
      const user = users.find((u) => u.email === email);
      if (!user || user.active === false || !verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: "Incorrect email or password" });
        return;
      }
      await db.del(attemptsKey);
      const token = await createSession(db, user);
      const idx = users.findIndex((u) => u.id === user.id);
      users[idx] = { ...users[idx], lastLoginAt: Date.now() };
      await writeUsers(db, users);
      res.status(200).json({ token, role: user.role, name: user.name });
      return;
    }

    if (action === "forgot" && req.method === "POST") {
      if (!resetEmailConfigured()) {
        res.status(501).json({ error: "Password reset by email isn't set up yet. Ask an admin to reset your password." });
        return;
      }
      const email = normEmail(req.body && req.body.email);
      // Same answer whether or not the email is on the team, so this can't be
      // used to find out who has an account.
      const generic = { ok: true, message: "If that email belongs to a team member, a reset link is on its way. It works for 1 hour." };
      if (!validEmail(email)) {
        res.status(200).json(generic);
        return;
      }
      const limitKey = `reset-requests:${email}`;
      const count = await db.incr(limitKey);
      if (count === 1) await db.expire(limitKey, 60 * 60);
      if (count > MAX_RESET_REQUESTS) {
        res.status(200).json(generic);
        return;
      }
      const users = await readUsers(db);
      const user = users.find((u) => u.email === email && u.active !== false);
      if (user) {
        const token = crypto.randomBytes(32).toString("hex");
        await db.set(`reset:${sha256(token)}`, JSON.stringify({ userId: user.id }), { ex: RESET_TTL_SECONDS });
        const base = (process.env.PUBLIC_BASE_URL || "https://compass.funmaps.com").replace(/\/+$/, "");
        await sendResetEmail(user.email, user.name, `${base}/admin?reset=${token}`);
      }
      res.status(200).json(generic);
      return;
    }

    if (action === "reset" && req.method === "POST") {
      const token = String((req.body && req.body.token) || "");
      const password = String((req.body && req.body.password) || "");
      if (password.length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
        return;
      }
      const key = `reset:${sha256(token)}`;
      const raw = token ? await db.get(key) : null;
      if (!raw) {
        res.status(400).json({ error: "This reset link has expired or was already used. Request a new one." });
        return;
      }
      await db.del(key); // one use only
      const { userId } = typeof raw === "string" ? JSON.parse(raw) : raw;
      const users = await readUsers(db);
      const idx = users.findIndex((u) => u.id === userId && u.active !== false);
      if (idx === -1) {
        res.status(400).json({ error: "This reset link is no longer valid." });
        return;
      }
      users[idx] = { ...users[idx], passwordHash: hashPassword(password), sessionVersion: (users[idx].sessionVersion || 0) + 1, passwordChangedAt: Date.now() };
      await writeUsers(db, users);
      await db.del(`login-attempts:${users[idx].email}`);
      res.status(200).json({ ok: true, email: users[idx].email });
      return;
    }

    if (action === "logout" && req.method === "POST") {
      await deleteSession(db, req.headers["x-admin-key"]);
      res.status(200).json({ ok: true });
      return;
    }

    const auth = await getAuth(req, db);
    if (!auth) {
      res.status(401).json({ error: "Invalid admin key" });
      return;
    }

    if (action === "me" && req.method === "GET") {
      res.status(200).json(auth);
      return;
    }

    if (action === "change-password" && req.method === "POST") {
      const users = await readUsers(db);
      const idx = users.findIndex((u) => u.id === auth.userId);
      if (idx === -1) {
        res.status(400).json({ error: "The owner password is changed in Vercel (ADMIN_PASSWORD), not here." });
        return;
      }
      const { currentPassword, newPassword } = req.body || {};
      if (!verifyPassword(currentPassword || "", users[idx].passwordHash)) {
        res.status(401).json({ error: "Your current password is incorrect" });
        return;
      }
      if (String(newPassword || "").length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
        return;
      }
      const v = (users[idx].sessionVersion || 0) + 1;
      users[idx] = { ...users[idx], passwordHash: hashPassword(newPassword), sessionVersion: v, passwordChangedAt: Date.now() };
      await writeUsers(db, users);
      // Sign out every other device, keep this one signed in with a fresh session.
      await deleteSession(db, req.headers["x-admin-key"]);
      const token = await createSession(db, users[idx]);
      res.status(200).json({ ok: true, token });
      return;
    }

    if (action === "users") {
      if (auth.role !== "admin") {
        res.status(403).json({ error: "Only an admin can manage the team" });
        return;
      }
      const users = await readUsers(db);

      if (req.method === "GET") {
        res.status(200).json({ users: users.map(publicUser) });
        return;
      }

      if (req.method === "POST") {
        const name = String((req.body && req.body.name) || "").trim();
        const email = normEmail(req.body && req.body.email);
        const role = req.body && req.body.role === "admin" ? "admin" : "sales";
        const password = (req.body && req.body.password) || "";
        if (!name || !validEmail(email)) {
          res.status(400).json({ error: "A name and a valid email are required" });
          return;
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
          res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
          return;
        }
        if (users.some((u) => u.email === email)) {
          res.status(409).json({ error: "Someone with that email is already on the team" });
          return;
        }
        const user = {
          id: `user-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
          name,
          email,
          role,
          active: true,
          passwordHash: hashPassword(password),
          createdAt: Date.now(),
          createdBy: auth.name,
        };
        users.push(user);
        await writeUsers(db, users);
        res.status(200).json({ user: publicUser(user) });
        return;
      }

      if (req.method === "PUT") {
        const { id, name, email, role, active, password } = req.body || {};
        const idx = users.findIndex((u) => u.id === id);
        if (idx === -1) {
          res.status(404).json({ error: "Team member not found" });
          return;
        }
        const u = { ...users[idx] };
        if (name !== undefined) u.name = String(name).trim() || u.name;
        if (email !== undefined) {
          const e = normEmail(email);
          if (!validEmail(e)) {
            res.status(400).json({ error: "Enter a valid email" });
            return;
          }
          if (users.some((x) => x.email === e && x.id !== id)) {
            res.status(409).json({ error: "Someone with that email is already on the team" });
            return;
          }
          u.email = e;
        }
        if (role !== undefined) u.role = role === "admin" ? "admin" : "sales";
        if (active !== undefined) u.active = !!active;
        if (password !== undefined && password !== "") {
          if (String(password).length < MIN_PASSWORD_LENGTH) {
            res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
            return;
          }
          u.passwordHash = hashPassword(password);
          u.sessionVersion = (u.sessionVersion || 0) + 1;
          u.passwordChangedAt = Date.now();
        }
        users[idx] = u;
        await writeUsers(db, users);
        res.status(200).json({ user: publicUser(u) });
        return;
      }
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
