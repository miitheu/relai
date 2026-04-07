import type { Context, Next } from "hono";
import { verifyToken } from "../auth/jwt";

export async function authMiddleware(c: Context, next: Next) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: { message: "Missing or invalid Authorization header" } }, 401);
  }

  const token = header.slice(7);
  const payload = await verifyToken(token);
  if (!payload || payload.type !== "access") {
    return c.json({ error: { message: "Invalid or expired token" } }, 401);
  }

  c.set("userId", payload.sub);
  c.set("userEmail", payload.email);
  await next();
}
