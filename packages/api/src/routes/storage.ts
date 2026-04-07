import { Hono } from "hono";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const storage = new Hono();

const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || "./uploads");
const HMAC_SECRET = process.env.AUTH_SECRET || "";

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
}

// Validate and resolve a file path, preventing traversal attacks
function safePath(bucket: string, filePath: string): string | null {
  // Reject obviously malicious patterns
  if (filePath.includes("..") || filePath.includes("\0") || bucket.includes("..") || bucket.includes("\0")) {
    return null;
  }
  // Only allow alphanumeric, dashes, underscores, dots, and forward slashes
  if (!/^[a-zA-Z0-9._\-/]+$/.test(filePath) || !/^[a-zA-Z0-9._\-]+$/.test(bucket)) {
    return null;
  }
  const resolved = path.resolve(STORAGE_DIR, bucket, filePath);
  // Ensure the resolved path is within STORAGE_DIR
  if (!resolved.startsWith(STORAGE_DIR + path.sep) && resolved !== STORAGE_DIR) {
    return null;
  }
  return resolved;
}

// Generate HMAC token for signed URLs
function generateSignedToken(bucket: string, filePath: string, expires: number): string {
  return crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(`${bucket}/${filePath}:${expires}`)
    .digest("hex");
}

// Verify HMAC token
function verifySignedToken(bucket: string, filePath: string, expires: number, token: string): boolean {
  if (!HMAC_SECRET) return false;
  if (Date.now() > expires) return false;
  const expected = generateSignedToken(bucket, filePath, expires);
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// POST /api/storage/upload
storage.post("/upload", async (c) => {
  const body = await c.req.parseBody();
  const bucket = body.bucket as string;
  const filePath = body.path as string;
  const file = body.file as File;

  if (!bucket || !filePath || !file) {
    return c.json({ error: { message: "bucket, path, and file are required" } }, 400);
  }

  const fullPath = safePath(bucket, filePath);
  if (!fullPath) {
    return c.json({ error: { message: "Invalid file path" } }, 400);
  }

  await ensureDir(path.dirname(fullPath));
  const buffer = Buffer.from(await file.arrayBuffer());

  // Limit file size to 50MB
  if (buffer.length > 50 * 1024 * 1024) {
    return c.json({ error: { message: "File too large (max 50MB)" } }, 400);
  }

  await fs.writeFile(fullPath, buffer);
  return c.json({ data: { path: filePath }, error: null });
});

// GET /api/storage/url
storage.get("/url", (c) => {
  const bucket = c.req.query("bucket");
  const filePath = c.req.query("path");
  if (!bucket || !filePath) {
    return c.json({ error: { message: "bucket and path required" } }, 400);
  }
  if (!safePath(bucket, filePath)) {
    return c.json({ error: { message: "Invalid file path" } }, 400);
  }
  return c.json({ url: `/api/storage/serve/${bucket}/${filePath}` });
});

// GET /api/storage/signed-url
storage.get("/signed-url", async (c) => {
  const bucket = c.req.query("bucket");
  const filePath = c.req.query("path");
  const expiresIn = parseInt(c.req.query("expiresIn") || "3600", 10);

  if (!bucket || !filePath) {
    return c.json({ url: null });
  }
  if (!safePath(bucket, filePath)) {
    return c.json({ url: null });
  }

  const expires = Date.now() + Math.min(expiresIn, 86400 * 365) * 1000;
  const token = generateSignedToken(bucket, filePath, expires);

  return c.json({
    url: `/api/storage/serve/${bucket}/${filePath}?token=${token}&expires=${expires}`,
  });
});

// GET /api/storage/serve/:bucket/* — serves files, verifies signed URLs
storage.get("/serve/:bucket/*", async (c) => {
  const bucket = c.req.param("bucket");
  const filePath = c.req.path.replace(`/api/storage/serve/${bucket}/`, "");

  const fullPath = safePath(bucket, filePath);
  if (!fullPath) {
    return c.json({ error: { message: "Invalid file path" } }, 400);
  }

  // Check for signed URL token
  const token = c.req.query("token");
  const expires = c.req.query("expires");

  if (token && expires) {
    // Signed URL access — verify token
    if (!verifySignedToken(bucket, filePath, parseInt(expires, 10), token)) {
      return c.json({ error: { message: "Invalid or expired signed URL" } }, 403);
    }
  } else {
    // Authenticated access — check auth header
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: { message: "Authentication required" } }, 401);
    }
  }

  try {
    const data = await fs.readFile(fullPath);
    // Set basic content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".csv": "text/csv",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
    };
    return new Response(data, {
      headers: {
        "Content-Type": contentTypes[ext] || "application/octet-stream",
        "Content-Disposition": `inline; filename="${path.basename(filePath)}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return c.json({ error: { message: "File not found" } }, 404);
  }
});

// DELETE /api/storage/remove
storage.post("/remove", async (c) => {
  const { bucket, paths } = await c.req.json();
  if (!bucket || !Array.isArray(paths)) {
    return c.json({ error: { message: "bucket and paths required" } }, 400);
  }

  for (const filePath of paths) {
    const fullPath = safePath(bucket, filePath);
    if (!fullPath) continue;
    await fs.unlink(fullPath).catch(() => {});
  }

  return c.json({ error: null });
});

export default storage;
