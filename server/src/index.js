import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import express from "express";
import helmet from "helmet";
import pino from "pino";
import pinoHttp from "pino-http";
import { z } from "zod";
import { config } from "./config.js";
import { generateForUser, generationSchema } from "./generation.js";
import { authenticate, supabaseAdmin } from "./supabase.js";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const app = express();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "app", "dist");

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(pinoHttp({ logger }));
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_request, response) => {
  const { error } = await supabaseAdmin.from("ai_models").select("id", { head: true, count: "exact" });
  response.status(error ? 503 : 200).json({ status: error ? "degraded" : "ok", database: error ? "unavailable" : "ok" });
});

app.get("/api/models", authenticate, async (_request, response, next) => {
  try {
    const { data, error } = await supabaseAdmin.from("ai_models").select("id,name,provider,badge,enabled,ratios,sizes,qualities,credit_cost").eq("enabled", true).order("credit_cost");
    if (error) throw error;
    response.json({ models: data });
  } catch (error) { next(error); }
});

const adminUpdateSchema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  plan: z.enum(["free", "pro", "studio"]).optional(),
  credits: z.number().int().min(0).max(100000000).optional(),
  status: z.enum(["active", "suspended"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

async function requireAdmin(request, response, next) {
  const { data, error } = await supabaseAdmin.from("profiles").select("role,status").eq("id", request.user.id).maybeSingle();
  if (error) return next(error);
  if (data?.role !== "admin" || data?.status !== "active") return response.status(403).json({ error: "Administrator access required" });
  return next();
}

app.patch("/api/admin/users/:id", authenticate, requireAdmin, async (request, response, next) => {
  try {
    const changes = adminUpdateSchema.parse(request.body);
    const { data, error } = await supabaseAdmin.from("profiles").update(changes).eq("id", request.params.id).select("id,email,full_name,role,plan,credits,status,created_at").single();
    if (error) throw error;
    response.json({ user: data });
  } catch (error) { next(error); }
});

app.post("/api/generations", authenticate, async (request, response, next) => {
  try {
    const result = await generateForUser(request.user.id, generationSchema.parse(request.body));
    response.status(201).json(result);
  } catch (error) { next(error); }
});

app.get("/api/generations/:id", authenticate, async (request, response, next) => {
  try {
    const { data: task, error } = await supabaseAdmin.from("generation_tasks").select("id,user_id,model_id,prompt,parameters,image_count,status,credit_cost,error_message,created_at,completed_at,generation_assets(storage_path,mime_type)").eq("id", request.params.id).eq("user_id", request.user.id).maybeSingle();
    if (error) throw error;
    if (!task) return response.status(404).json({ error: "Generation not found" });
    const assets = await Promise.all((task.generation_assets || []).map(async (asset) => {
      const { data } = await supabaseAdmin.storage.from("generated-images").createSignedUrl(asset.storage_path, 3600);
      return { url: data?.signedUrl, mimeType: asset.mime_type };
    }));
    return response.json({ ...task, generation_assets: undefined, assets });
  } catch (error) { return next(error); }
});

app.use(express.static(dist, { maxAge: config.NODE_ENV === "production" ? "1y" : 0, index: false }));
app.get("/{*path}", (_request, response) => response.sendFile(path.join(dist, "index.html")));

app.use((error, request, response, _next) => {
  request.log.error({ err: error }, "request failed");
  if (error?.name === "ZodError") return response.status(400).json({ error: "Invalid generation parameters", details: error.issues });
  const message = error?.name === "AbortError" ? "Generation timed out" : error?.message || "Internal server error";
  const status = /INSUFFICIENT_CREDITS/.test(message) ? 402 : /MODEL_UNAVAILABLE/.test(message) ? 400 : 500;
  return response.status(status).json({ error: message });
});

const server = app.listen(config.PORT, "0.0.0.0", () => logger.info({ port: config.PORT }, "Prism server listening"));
function shutdown(signal) {
  logger.info({ signal }, "shutting down");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));