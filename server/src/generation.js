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
  referenceImages: z.array(z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,/)).max(4).optional().default([]),
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

function outputModalities(modelId) {
  return modelId.startsWith("x-ai/grok-imagine") ? ["image"] : ["image", "text"];
}

function usesImagesEndpoint(modelId) {
  return modelId.startsWith("openai/") && modelId.includes("image");
}

function imageEndpointPayload(input) {
  const prompt = [input.prompt, input.negativePrompt ? `Avoid: ${input.negativePrompt}` : "", input.seed !== undefined ? `Seed: ${input.seed}` : ""].filter(Boolean).join("\n");
  return {
    model: input.modelId,
    prompt,
    n: input.count,
  };
}

function providerPayload(input) {
  const prompt = [input.prompt, "Return the generated image as an image output in the response. Do not return only a text description.", input.negativePrompt ? `Avoid: ${input.negativePrompt}` : "", input.seed !== undefined ? `Seed: ${input.seed}` : ""].filter(Boolean).join("\n");
  const content = input.referenceImages?.length
    ? [{ type: "text", text: prompt }, ...input.referenceImages.map((url) => ({ type: "image_url", image_url: { url } }))]
    : prompt;
  return {
    model: input.modelId,
    messages: [{ role: "user", content }],
    modalities: outputModalities(input.modelId),
    max_tokens: config.OPENROUTER_MAX_TOKENS,
    image_config: { aspect_ratio: input.ratio, image_size: input.size },
    quality: input.quality === "超高清" ? "high" : input.quality === "高清" ? "medium" : "standard",
    n: input.count,
  };
}

function dataUrlFromBase64(value, mimeType = "image/png") {
  const clean = typeof value === "string" ? value.replace(/\s/g, "") : "";
  return clean ? "data:" + mimeType + ";base64," + clean : null;
}

function isLikelyBase64Image(value) {
  return typeof value === "string" && value.length > 200 && /^[A-Za-z0-9+/=\r\n]+$/.test(value);
}

function mimeFromValue(value, fallback = "image/png") {
  return /^image\/(?:png|jpeg|webp)$/.test(value || "") ? value : fallback;
}

function collectImageCandidates(value, output, seen = new Set()) {
  if (!value || output.length >= 16) return;
  if (typeof value === "string") {
    if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(value) || /^https?:\/\//i.test(value)) {
      output.push(value);
      return;
    }
    for (const match of value.matchAll(/data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+/gi)) output.push(match[0]);
    for (const match of value.matchAll(/https?:\/\/[^\s)'"<>]+/gi)) output.push(match[0]);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImageCandidates(item, output, seen);
    return;
  }
  if (typeof value !== "object" || seen.has(value)) return;
  seen.add(value);

  const mimeType = mimeFromValue(value.mime_type || value.mimeType || value.media_type || value.mediaType);
  for (const key of ["b64_json", "base64_json", "image_base64", "imageBase64", "base64", "b64"]) {
    if (typeof value[key] === "string") output.push(dataUrlFromBase64(value[key], mimeType));
  }
  for (const key of ["data", "result", "image"]) {
    if (isLikelyBase64Image(value[key])) output.push(dataUrlFromBase64(value[key], mimeType));
  }
  if (typeof value.data === "string" && /^image\//.test(value.type || value.media_type || value.mime_type || "")) output.push(dataUrlFromBase64(value.data, mimeFromValue(value.type || value.media_type || value.mime_type)));

  if (typeof value.url === "string") collectImageCandidates(value.url, output, seen);
  if (typeof value.image_url === "string") collectImageCandidates(value.image_url, output, seen);
  if (value.image_url?.url) collectImageCandidates(value.image_url.url, output, seen);
  if (value.source?.data && /^image\//.test(value.source?.media_type || "")) output.push(dataUrlFromBase64(value.source.data, value.source.media_type));

  for (const key of ["choices", "message", "data", "images", "content", "text", "image", "image_url", "output", "outputs", "output_image", "generated_image", "result", "results", "response"]) {
    if (value[key] && !(typeof value[key] === "string" && ["data", "image", "result"].includes(key))) collectImageCandidates(value[key], output, seen);
  }
}

function describeProviderShape(value, depth = 0, seen = new Set()) {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") return value.length > 80 ? "string(" + value.length + ")" : "string";
  if (typeof value !== "object") return typeof value;
  if (seen.has(value)) return "[circular]";
  if (depth >= 5) return Array.isArray(value) ? "array(" + value.length + ")" : "object";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 3).map((item) => describeProviderShape(item, depth + 1, seen));
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [key, describeProviderShape(item, depth + 1, seen)]));
}

function collectImages(payload) {
  const images = [];
  collectImageCandidates(payload, images);
  return [...new Set(images.filter(Boolean))];
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
    p_parameters: { ratio: input.ratio, size: input.size, quality: input.quality, reference_count: input.referenceImages?.length || 0, negative_prompt: input.negativePrompt || null, seed: input.seed ?? null },
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
    const baseUrl = config.OPENROUTER_BASE_URL.replace(/\/$/, "");
    const endpoint = usesImagesEndpoint(input.modelId) ? `${baseUrl}/images` : `${baseUrl}/chat/completions`;
    const requestBody = usesImagesEndpoint(input.modelId) ? imageEndpointPayload(input) : providerPayload(input);
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": config.APP_URL || "http://localhost", "X-Title": config.APP_NAME },
      body: JSON.stringify(requestBody),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `OpenRouter request failed (${response.status})`);
    const images = collectImages(payload);
    if (!images.length) throw new Error(`The model returned no recognizable image. Response shape: ${JSON.stringify(describeProviderShape(payload))}`);
    if (images.length < input.count) throw new Error(`The model returned ${images.length} image(s), but ${input.count} were requested`);

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