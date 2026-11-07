// Vercel serverless function — sign-in and team accounts for the admin panel.
//
// POST /api/auth?action=login   { email, password }   -> { token, role, name }
// POST /api/auth?action=logout                         -> ends the current session
// GET  /api/auth?action=me                             -> { role, name, userId } for the current sign-in
// GET  /api/auth?action=users                          -> list team members (admin only)
// POST /api/auth?action=users   { name, email, role, password }            -> add a member (admin only)
// PUT  /api/auth?action=users   { id, name?, email?, role?, active?, password? } -> update (admin only)
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
