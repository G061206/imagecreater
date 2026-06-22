import crypto from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";
import { supabaseAdmin } from "./supabase.js";

export const generationSchema = z.object({
  modelId: z.string().min(1).max(200),
  prompt: z.string().trim().min(1).max(2000),
  ratio: z.enum(["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]),
  size: z.enum(["1K", "2K", "4K", "1024", "1536", "2048"]),
  quality: z.enum(["标准", "高清", "超高清"]),
  count: z.number().int().min(1).max(4),
  negativePrompt: z.string().trim().max(1000).optional().default(""),
  seed: z.number().int().min(0).max(2147483647).optional(),
});

class Semaphore {
  constructor(limit) { this.limit = limit; this.active = 0; this.queue = []; }
  async acquire() {
    if (this.active < this.limit) { this.active += 1; return; }
    await new Promise((resolve) => this.queue.push(resolve));
    this.active += 1;
  }
  release() { this.active -= 1; this.queue.shift()?.(); }
}
const slots = new Semaphore(config.MAX_CONCURRENT_GENERATIONS);

function providerPayload(input) {
  const prompt = [input.prompt, input.negativePrompt ? `Avoid: ${input.negativePrompt}` : "", input.seed !== undefined ? `Seed: ${input.seed}` : ""].filter(Boolean).join("\n");
  return {
    model: input.modelId,
    messages: [{ role: "user", content: prompt }],
    modalities: ["image", "text"],
    image_config: { aspect_ratio: input.ratio, image_size: input.size },
    quality: input.quality === "超高清" ? "high" : input.quality === "高清" ? "medium" : "standard",
    n: input.count,
  };
}

function collectImages(payload) {
  const message = payload?.choices?.[0]?.message;
  const candidates = [...(message?.images || []), ...(Array.isArray(message?.content) ? message.content : [])];
  return candidates.map((item) => typeof item === "string" ? item : item?.image_url?.url || item?.url || null).filter(Boolean);
}

function decodeDataUrl(value) {
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/);
  return match ? { mimeType: match[1], bytes: Buffer.from(match[2], "base64") } : null;
}

async function readImage(value, signal) {
  const inline = decodeDataUrl(value);
  if (inline) return inline;
  const response = await fetch(value, { signal, redirect: "follow" });
  if (!response.ok) throw new Error(`Generated image download failed (${response.status})`);
  const mimeType = response.headers.get("content-type")?.split(";")[0];
  if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(mimeType)) throw new Error("Provider returned an unsupported image format");
  return { mimeType, bytes: Buffer.from(await response.arrayBuffer()) };
}

const extensionFor = (mimeType) => ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" })[mimeType];

async function reserve(userId, input) {
  const { data, error } = await supabaseAdmin.rpc("reserve_generation_task", {
    p_user_id: userId,
    p_model_id: input.modelId,
    p_prompt: input.prompt,
    p_parameters: { ratio: input.ratio, size: input.size, quality: input.quality, negative_prompt: input.negativePrompt || null, seed: input.seed ?? null },
    p_image_count: input.count,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function generateForUser(userId, input) {
  await slots.acquire();
  let reservation;
  const uploaded = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT_MS);
  try {
    reservation = await reserve(userId, input);
    const response = await fetch(`${config.OPENROUTER_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": config.APP_URL || "http://localhost", "X-Title": config.APP_NAME },
      body: JSON.stringify(providerPayload(input)),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `OpenRouter request failed (${response.status})`);
    const images = collectImages(payload);
    if (!images.length) throw new Error("The model returned no image");

    for (const image of images.slice(0, input.count)) {
      const { mimeType, bytes } = await readImage(image, controller.signal);
      if (bytes.length > 20 * 1024 * 1024) throw new Error("Generated image exceeds 20 MB");
      const storagePath = `${userId}/${reservation.task_id}/${crypto.randomUUID()}.${extensionFor(mimeType)}`;
      const { error } = await supabaseAdmin.storage.from("generated-images").upload(storagePath, bytes, { contentType: mimeType, upsert: false });
      if (error) throw error;
      uploaded.push({ storagePath, mimeType, byteSize: bytes.length });
    }

    const { error: assetError } = await supabaseAdmin.from("generation_assets").insert(uploaded.map((asset) => ({ task_id: reservation.task_id, storage_path: asset.storagePath, mime_type: asset.mimeType, byte_size: asset.byteSize })));
    if (assetError) throw assetError;
    const { error: completeError } = await supabaseAdmin.rpc("complete_generation_task", { p_task_id: reservation.task_id, p_provider_request_ids: payload.id ? [String(payload.id)] : [], p_provider_cost: Number(payload?.usage?.cost ?? 0) || null });
    if (completeError) throw completeError;

    const assets = await Promise.all(uploaded.map(async (asset) => {
      const { data, error } = await supabaseAdmin.storage.from("generated-images").createSignedUrl(asset.storagePath, 3600);
      if (error) throw error;
      return { url: data.signedUrl, mimeType: asset.mimeType };
    }));
    return { taskId: reservation.task_id, creditCost: reservation.credit_cost, creditsRemaining: reservation.credits_remaining, assets };
  } catch (error) {
    if (uploaded.length) await supabaseAdmin.storage.from("generated-images").remove(uploaded.map((asset) => asset.storagePath));
    if (reservation?.task_id) await supabaseAdmin.rpc("fail_generation_task", { p_task_id: reservation.task_id, p_error_message: error.name === "AbortError" ? "Generation timed out" : error.message, p_refund: true });
    throw error;
  } finally {
    clearTimeout(timeout);
    slots.release();
  }
}