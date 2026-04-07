import { Hono } from "hono";
import { createUser, authenticateUser, refreshSession, revokeSession, getUserById, updateUserPassword } from "../auth/users";

const auth = new Hono();

auth.post("/signin", async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) {
    return c.json({ user: null, session: null, error: { message: "Email and password required" } });
  }

  const result = await authenticateUser(email, password);
  if (!result) {
    return c.json({ user: null, session: null, error: { message: "Invalid credentials" } });
  }

  return c.json({ ...result, error: null });
});

auth.post("/signup", async (c) => {
  const { email, password, metadata } = await c.req.json();
  if (!email || !password) {
    return c.json({ user: null, session: null, error: { message: "Email and password required" } });
  }

  try {
    const result = await createUser(email, password, metadata ?? {});
    return c.json({ ...result, error: null });
  } catch (err: any) {
    const msg = err.message?.includes("duplicate") ? "Email already registered" : err.message;
    return c.json({ user: null, session: null, error: { message: msg } });
  }
});

auth.post("/signout", async (c) => {
  const { refresh_token } = await c.req.json();
  if (refresh_token) await revokeSession(refresh_token);
  return c.json({ error: null });
});

auth.post("/refresh", async (c) => {
  const { refresh_token } = await c.req.json();
  if (!refresh_token) {
    return c.json({ user: null, session: null, error: { message: "Refresh token required" } });
  }

  const result = await refreshSession(refresh_token);
  if (!result) {
    return c.json({ user: null, session: null, error: { message: "Invalid or expired refresh token" } });
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
  const { password } = await c.req.json();
  if (password) {
    await updateUserPassword(userId, password);
  }
  const user = await getUserById(userId);
  return c.json({ user, error: null });
});

export default auth;
