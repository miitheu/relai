import { Hono } from "hono";
import { createUser, authenticateUser, refreshSession, revokeSession, getUserById, updateUserPassword } from "../auth/users";

const auth = new Hono();

// Simple in-memory rate limiter
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 10; // max attempts per window

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(key);
  }
}, 60_000);

auth.post("/signin", async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) {
    return c.json({ user: null, session: null, error: { message: "Email and password required" } }, 400);
  }
  if (typeof email !== "string" || email.length > 255) {
    return c.json({ user: null, session: null, error: { message: "Invalid email" } }, 400);
  }
  if (typeof password !== "string" || password.length > 256) {
    return c.json({ user: null, session: null, error: { message: "Invalid password" } }, 400);
  }

  // Rate limit by email
  if (!checkRateLimit(email.toLowerCase())) {
    return c.json({ user: null, session: null, error: { message: "Too many login attempts. Try again later." } }, 429);
  }

  const result = await authenticateUser(email, password);
  if (!result) {
    // Generic message — don't reveal whether email exists
    return c.json({ user: null, session: null, error: { message: "Invalid credentials" } });
  }

  return c.json({ ...result, error: null });
});

auth.post("/signup", async (c) => {
  const { email, password, metadata } = await c.req.json();
  if (!email || !password) {
    return c.json({ user: null, session: null, error: { message: "Email and password required" } }, 400);
  }
  if (typeof email !== "string" || email.length > 255 || !email.includes("@")) {
    return c.json({ user: null, session: null, error: { message: "Invalid email" } }, 400);
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 256) {
    return c.json({ user: null, session: null, error: { message: "Password must be 8-256 characters" } }, 400);
  }

  if (!checkRateLimit(`signup:${email.toLowerCase()}`)) {
    return c.json({ user: null, session: null, error: { message: "Too many signup attempts. Try again later." } }, 429);
  }

  try {
    const result = await createUser(email, password, metadata ?? {});
    return c.json({ ...result, error: null });
  } catch (err: any) {
    // Generic message — don't reveal whether email exists
    return c.json({ user: null, session: null, error: { message: "Unable to create account" } });
  }
});

auth.post("/signout", async (c) => {
  const { refresh_token } = await c.req.json();
  if (refresh_token && typeof refresh_token === "string") {
    await revokeSession(refresh_token);
  }
  return c.json({ error: null });
});

auth.post("/refresh", async (c) => {
  const { refresh_token } = await c.req.json();
  if (!refresh_token || typeof refresh_token !== "string") {
    return c.json({ user: null, session: null, error: { message: "Refresh token required" } }, 400);
  }

  const result = await refreshSession(refresh_token);
  if (!result) {
    return c.json({ user: null, session: null, error: { message: "Invalid or expired session" } }, 401);
  }

  return c.json({ ...result, error: null });
});

auth.get("/me", async (c) => {
  const userId = c.get("userId") as string;
  if (!userId) return c.json({ user: null });

  const user = await getUserById(userId);
  return c.json({ user });
});

auth.post("/update", async (c) => {
  const userId = c.get("userId") as string;
  if (!userId) return c.json({ user: null, error: { message: "Not authenticated" } }, 401);

  const { password } = await c.req.json();
  if (password) {
    if (typeof password !== "string" || password.length < 8 || password.length > 256) {
      return c.json({ user: null, error: { message: "Password must be 8-256 characters" } }, 400);
    }
    await updateUserPassword(userId, password);
  }
  const user = await getUserById(userId);
  return c.json({ user, error: null });
});

export default auth;
