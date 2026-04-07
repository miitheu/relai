import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { createUser, authenticateUser, refreshSession, revokeSession, getUserById, updateUserPassword } from "../auth/users";

const auth = new Hono();

const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? "Strict" as const : "Lax" as const,
  path: "/",
};

function setAuthCookies(c: any, accessToken: string, refreshToken: string) {
  setCookie(c, "relai_access_token", accessToken, {
    ...COOKIE_OPTS,
    maxAge: 3600, // 1 hour
  });
  setCookie(c, "relai_refresh_token", refreshToken, {
    ...COOKIE_OPTS,
    maxAge: 30 * 24 * 3600, // 30 days
    path: "/api/auth", // only sent to auth endpoints
  });
}

function clearAuthCookies(c: any) {
  deleteCookie(c, "relai_access_token", { path: "/" });
  deleteCookie(c, "relai_refresh_token", { path: "/api/auth" });
}

// Simple in-memory rate limiter
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 10;

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

  if (!checkRateLimit(email.toLowerCase())) {
    return c.json({ user: null, session: null, error: { message: "Too many login attempts. Try again later." } }, 429);
  }

  const result = await authenticateUser(email, password);
  if (!result) {
    return c.json({ user: null, session: null, error: { message: "Invalid credentials" } });
  }

  setAuthCookies(c, result.session.access_token, result.session.refresh_token);

  // Return user info but NOT the tokens in the body (they're in cookies now)
  return c.json({
    user: result.user,
    session: { expires_at: result.session.expires_at },
    error: null,
  });
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
    setAuthCookies(c, result.session.access_token, result.session.refresh_token);

    return c.json({
      user: result.user,
      session: { expires_at: result.session.expires_at },
      error: null,
    });
  } catch (err: any) {
    return c.json({ user: null, session: null, error: { message: "Unable to create account" } });
  }
});

auth.post("/signout", async (c) => {
  // Read refresh token from cookie (preferred) or body (fallback)
  const refreshToken = getCookie(c, "relai_refresh_token") || (await c.req.json().catch(() => ({}))).refresh_token;
  if (refreshToken && typeof refreshToken === "string") {
    await revokeSession(refreshToken);
  }
  clearAuthCookies(c);
  return c.json({ error: null });
});

auth.post("/refresh", async (c) => {
  // Read refresh token from cookie (preferred) or body (fallback)
  const refreshToken = getCookie(c, "relai_refresh_token") || (await c.req.json().catch(() => ({}))).refresh_token;
  if (!refreshToken || typeof refreshToken !== "string") {
    return c.json({ user: null, session: null, error: { message: "Refresh token required" } }, 400);
  }

  const result = await refreshSession(refreshToken);
  if (!result) {
    clearAuthCookies(c);
    return c.json({ user: null, session: null, error: { message: "Invalid or expired session" } }, 401);
  }

  setAuthCookies(c, result.session.access_token, result.session.refresh_token);

  return c.json({
    user: result.user,
    session: { expires_at: result.session.expires_at },
    error: null,
  });
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
