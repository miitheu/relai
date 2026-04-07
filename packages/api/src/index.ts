import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { serve } from "@hono/node-server";
import { authMiddleware } from "./middleware/auth";
import authRoutes from "./routes/auth";
import queryRoutes from "./routes/query";
import functionsRoutes from "./routes/functions";
import storageRoutes from "./routes/storage";

const app = new Hono();

// Security headers
app.use("*", secureHeaders({
  xContentTypeOptions: "nosniff",
  xFrameOptions: "DENY",
  referrerPolicy: "strict-origin-when-cross-origin",
}));

// CORS for frontend
app.use("*", cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:8080",
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
}));

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Auth routes (no auth middleware needed for signin/signup/signout/refresh)
app.route("/api/auth", authRoutes);

// Protected routes — require valid JWT
app.use("/api/query", authMiddleware);
app.use("/api/insert", authMiddleware);
app.use("/api/update", authMiddleware);
app.use("/api/delete", authMiddleware);
app.use("/api/upsert", authMiddleware);
app.use("/api/functions/*", authMiddleware);
app.use("/api/storage/upload", authMiddleware);
app.use("/api/storage/url", authMiddleware);
app.use("/api/storage/signed-url", authMiddleware);
app.use("/api/storage/remove", authMiddleware);
// Note: /api/storage/serve/* allows signed URL access without auth token

app.route("/api", queryRoutes);
app.route("/api/functions", functionsRoutes);
app.route("/api/storage", storageRoutes);

const port = parseInt(process.env.API_PORT || "3001", 10);
console.log(`Relai API server starting on port ${port}`);

serve({ fetch: app.fetch, port });
