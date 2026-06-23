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

app.get("/api/live", (_request, response) => {
  response.json({ status: "ok" });
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

const adminModelUpdateSchema = z.object({
  id: z.string().min(1).max(200),
  enabled: z.boolean(),
});


const PLAN_CREDITS = { free: 100, pro: 2000, studio: 10000 };
const PLAN_LABELS = { free: "Free", pro: "Pro", studio: "Studio" };
const STATUS_LABELS = {
  completed: "\u6210\u529f",
  failed: "\u5931\u8d25",
  processing: "\u5904\u7406\u4e2d",
  reserved: "\u6392\u961f\u4e2d",
  active: "\u6b63\u5e38",
  suspended: "\u5df2\u6682\u505c",
};

function startOfLocalDay(offset = 0) {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() + offset);
  return value;
}

function asDate(value) {
  return value ? new Date(value) : null;
}

function dayKey(value) {
  const date = asDate(value);
  return date && !Number.isNaN(date.valueOf()) ? date.toISOString().slice(0, 10) : "";
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trendPercent(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function durationSeconds(start, end) {
  const started = asDate(start);
  const finished = asDate(end);
  if (!started || !finished || Number.isNaN(started.valueOf()) || Number.isNaN(finished.valueOf())) return null;
  return Math.max(0, Math.round((finished - started) / 100) / 10);
}

async function loadAdminData() {
  const [profilesResult, tasksResult, modelsResult] = await Promise.all([
    supabaseAdmin.from("profiles").select("id,email,full_name,role,plan,credits,status,created_at").limit(10000),
    supabaseAdmin.from("generation_tasks").select("id,user_id,model_id,prompt,image_count,status,credit_cost,provider_cost,error_message,created_at,completed_at").order("created_at", { ascending: false }).limit(10000),
    supabaseAdmin.from("ai_models").select("id,name,provider,enabled,credit_cost").limit(10000),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (modelsResult.error) throw modelsResult.error;
  return { profiles: profilesResult.data || [], tasks: tasksResult.data || [], models: modelsResult.data || [] };
}

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

app.patch("/api/admin/models", authenticate, requireAdmin, async (request, response, next) => {
  try {
    const changes = adminModelUpdateSchema.parse(request.body);
    const { data, error } = await supabaseAdmin
      .from("ai_models")
      .update({ enabled: changes.enabled })
      .eq("id", changes.id)
      .select("id,name,provider,badge,enabled,ratios,sizes,qualities,credit_cost")
      .single();
    if (error) throw error;
    response.json({ model: data });
  } catch (error) { next(error); }
});

app.get("/api/admin/overview", authenticate, requireAdmin, async (_request, response, next) => {
  try {
    const { profiles, tasks, models } = await loadAdminData();
    const todayStart = startOfLocalDay(0);
    const yesterdayStart = startOfLocalDay(-1);
    const todayTasks = tasks.filter((task) => asDate(task.created_at) >= todayStart);
    const yesterdayTasks = tasks.filter((task) => asDate(task.created_at) >= yesterdayStart && asDate(task.created_at) < todayStart);
    const settledTasks = tasks.filter((task) => task.status === "completed" || task.status === "failed");
    const completedTasks = settledTasks.filter((task) => task.status === "completed");
    const successRate = settledTasks.length ? Math.round((completedTasks.length / settledTasks.length) * 1000) / 10 : 0;
    const spendToday = todayTasks.reduce((sum, task) => sum + numberValue(task.provider_cost), 0);
    const modelMap = new Map(models.map((model) => [model.id, model]));
    const dayBuckets = new Map();
    for (let index = 6; index >= 0; index -= 1) {
      const date = startOfLocalDay(-index);
      dayBuckets.set(date.toISOString().slice(0, 10), 0);
    }
    for (const task of tasks) {
      const key = dayKey(task.created_at);
      if (dayBuckets.has(key)) dayBuckets.set(key, dayBuckets.get(key) + 1);
    }
    const usageCounts = new Map();
    for (const task of todayTasks) usageCounts.set(task.model_id, (usageCounts.get(task.model_id) || 0) + 1);
    const usageTotal = Array.from(usageCounts.values()).reduce((sum, count) => sum + count, 0);
    const modelUsage = Array.from(usageCounts.entries())
      .map(([modelId, count]) => ({ modelId, name: modelMap.get(modelId)?.name || modelId, count, percent: usageTotal ? Math.round((count / usageTotal) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
    const queueCount = tasks.filter((task) => task.status === "processing" || task.status === "reserved").length;
    response.json({
      stats: {
        generatedToday: todayTasks.length,
        generatedTrend: trendPercent(todayTasks.length, yesterdayTasks.length),
        activeUsers: profiles.filter((profile) => profile.status === "active").length,
        totalUsers: profiles.length,
        successRate,
        spendToday,
      },
      chart: Array.from(dayBuckets.entries()).map(([date, count]) => ({ date, count })),
      modelUsage,
      services: [
        { id: "openrouter", ok: Boolean(config.OPENROUTER_API_KEY), detail: config.OPENROUTER_API_KEY ? "configured" : "missing_key" },
        { id: "queue", ok: true, detail: String(queueCount) },
        { id: "database", ok: true, detail: String(profiles.length) },
      ],
    });
  } catch (error) { next(error); }
});

app.get("/api/admin/data/:type", authenticate, requireAdmin, async (request, response, next) => {
  try {
    const { profiles, tasks, models } = await loadAdminData();
    const modelMap = new Map(models.map((model) => [model.id, model]));
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    if (request.params.type === "billing") {
      const rows = Object.keys(PLAN_CREDITS).map((plan) => {
        const planUsers = profiles.filter((profile) => (profile.plan || "free") === plan);
        const remainingCredits = planUsers.reduce((sum, profile) => sum + numberValue(profile.credits), 0);
        return {
          id: plan,
          tone: "ok",
          cells: [PLAN_LABELS[plan], String(PLAN_CREDITS[plan]), String(planUsers.length), String(remainingCredits), "\u542f\u7528"],
        };
      });
      return response.json({ headers: ["\u5957\u9910", "\u6708\u5ea6\u79ef\u5206", "\u7528\u6237\u6570", "\u5269\u4f59\u79ef\u5206", "\u72b6\u6001"], rows });
    }
    if (request.params.type === "logs") {
      const rows = tasks.slice(0, 100).map((task) => {
        const seconds = durationSeconds(task.created_at, task.completed_at);
        const status = STATUS_LABELS[task.status] || task.status;
        return {
          id: task.id,
          tone: task.status === "failed" ? "bad" : task.status === "processing" || task.status === "reserved" ? "warn" : "ok",
          cells: [
            task.id.slice(0, 8),
            profileMap.get(task.user_id)?.full_name || profileMap.get(task.user_id)?.email || "-",
            modelMap.get(task.model_id)?.name || task.model_id,
            seconds == null ? "-" : String(seconds) + "s",
            status,
          ],
        };
      });
      return response.json({ headers: ["\u8bf7\u6c42 ID", "\u7528\u6237", "\u6a21\u578b", "\u8017\u65f6", "\u72b6\u6001"], rows });
    }
    return response.status(404).json({ error: "Unknown data page" });
  } catch (error) { next(error); }
});

app.get("/api/generations", authenticate, async (request, response, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("generation_tasks")
      .select("id,user_id,model_id,prompt,parameters,image_count,status,credit_cost,error_message,created_at,completed_at,generation_assets(storage_path,mime_type,byte_size)")
      .eq("user_id", request.user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const tasks = await Promise.all((data || []).map(async (task) => {
      const assets = await Promise.all((task.generation_assets || []).map(async (asset) => {
        const { data: signed } = await supabaseAdmin.storage.from("generated-images").createSignedUrl(asset.storage_path, 3600);
        return { url: signed?.signedUrl, mimeType: asset.mime_type, byteSize: asset.byte_size };
      }));
      return { ...task, generation_assets: undefined, assets: assets.filter((asset) => asset.url) };
    }));
    response.json({ tasks });
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