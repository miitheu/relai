import { Hono } from "hono";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const storage = new Hono();

const STORAGE_DIR = process.env.STORAGE_DIR || "./uploads";

async function ensureDir(dir: string) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch { /* already exists */ }
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

  const dir = path.join(STORAGE_DIR, bucket, path.dirname(filePath));
  await ensureDir(dir);

  const fullPath = path.join(STORAGE_DIR, bucket, filePath);
  const buffer = Buffer.from(await file.arrayBuffer());
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
  // Return a URL that serves the file from this API server
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

  const expires = Date.now() + expiresIn * 1000;
  const token = crypto.createHash("sha256").update(`${bucket}/${filePath}:${expires}:${process.env.AUTH_SECRET || "secret"}`).digest("hex").slice(0, 32);

  return c.json({ url: `/api/storage/serve/${bucket}/${filePath}?token=${token}&expires=${expires}` });
});

// GET /api/storage/serve/:bucket/*
storage.get("/serve/:bucket/*", async (c) => {
  const bucket = c.req.param("bucket");
  const filePath = c.req.path.replace(`/api/storage/serve/${bucket}/`, "");
  const fullPath = path.join(STORAGE_DIR, bucket, filePath);

  try {
    const data = await fs.readFile(fullPath);
    return new Response(data);
  } catch {
    return c.json({ error: { message: "File not found" } }, 404);
  }
});

// DELETE /api/storage/remove
storage.post("/remove", async (c) => {
  const { bucket, paths } = await c.req.json();
  if (!bucket || !paths) {
    return c.json({ error: { message: "bucket and paths required" } }, 400);
  }

  for (const filePath of paths) {
    const fullPath = path.join(STORAGE_DIR, bucket, filePath);
    try {
      await fs.unlink(fullPath);
    } catch { /* file may not exist */ }
  }

  return c.json({ error: null });
});

export default storage;
