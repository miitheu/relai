import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verifyToken } from "../auth/jwt";

export async function authMiddleware(c: Context, next: Next) {
  // Try httpOnly cookie first, then fall back to Authorization header
  let token = getCookie(c, "relai_access_token");

  if (!token) {
    const header = c.req.header("Authorization");
    if (header?.startsWith("Bearer ")) {
      token = header.slice(7);
    }
  }

  if (!token) {
    return c.json({ error: { message: "Authentication required" } }, 401);
  }

  const payload = await verifyToken(token);
  if (!payload || payload.type !== "access") {
    return c.json({ error: { message: "Invalid or expired token" } }, 401);
  }

  c.set("userId", payload.sub);
  c.set("userEmail", payload.email);
  await next();
}
