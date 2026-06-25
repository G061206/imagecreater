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
  clientRequestId: z.string().min(1).max(100).regex(/^client-[A-Za-z0-9-]+$/).optional(),
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

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const QUALITY_MAP = { 标准: "standard", 高清: "medium", 超高清: "high" };
const LEGACY_MODEL_IDS = new Map([
  ["openai/gpt-5.4-image-2", "openai/gpt-image-2"],
]);

function normalizeInput(input) {
  return { ...input, modelId: LEGACY_MODEL_IDS.get(input.modelId) || input.modelId };
}

function openRouterBaseUrl() {
  return config.OPENROUTER_BASE_URL.replace(/\/$/, "");
}

function buildPrompt(input, { forceImageOutput = true } = {}) {
  return [
    input.prompt,
    forceImageOutput ? "Return the generated image as an image output. Do not return only a text description." : "",
    input.negativePrompt ? `Avoid: ${input.negativePrompt}` : "",
    input.seed !== undefined ? `Seed: ${input.seed}` : "",
  ].filter(Boolean).join("\n");
}

function chatContent(input) {
  const prompt = buildPrompt(input);
  return input.referenceImages?.length
    ? [{ type: "text", text: prompt }, ...input.referenceImages.map((url) => ({ type: "image_url", image_url: { url } }))]
    : prompt;
}

function chatImageConfig(input) {
  return { aspect_ratio: input.ratio, image_size: input.size };
}

function buildOpenAiGptImage2Request(input) {
  return {
    label: "openai-gpt-image-2",
    endpointPath: "/images",
    body: {
      model: "openai/gpt-image-2",
      prompt: buildPrompt(input, { forceImageOutput: false }),
      n: input.count,
    },
    extractImages: extractImagesEndpointImages,
  };
}

function buildGeminiFlashImageRequest(input) {
  return buildGeminiImageRequest(input, "gemini-flash-image");
}

function buildGeminiProImageRequest(input) {
  return buildGeminiImageRequest(input, "gemini-pro-image");
}

function buildGeminiPreviewImageRequest(input) {
  return buildGeminiImageRequest(input, "gemini-preview-image");
}

function buildGeminiImageRequest(input, label) {
  return {
    label,
    endpointPath: "/chat/completions",
    body: {
      model: input.modelId,
      messages: [{ role: "user", content: chatContent(input) }],
      modalities: ["image", "text"],
      max_tokens: config.OPENROUTER_MAX_TOKENS,
      image_config: chatImageConfig(input),
      quality: QUALITY_MAP[input.quality] || "standard",
      n: input.count,
    },
    extractImages: extractChatCompletionImages,
  };
}

function buildGrokImagineQualityRequest(input) {
  return {
    label: "grok-imagine-image-quality",
    endpointPath: "/chat/completions",
    body: {
      model: "x-ai/grok-imagine-image-quality",
      messages: [{ role: "user", content: chatContent(input) }],
      modalities: ["image"],
      image_config: chatImageConfig(input),
      quality: QUALITY_MAP[input.quality] || "standard",
      n: input.count,
    },
    extractImages: extractChatCompletionImages,
  };
}

function buildFluxKontextRequest(input) {
  return {
    label: "flux-kontext-max",
    endpointPath: "/chat/completions",
    body: {
      model: input.modelId,
      messages: [{ role: "user", content: chatContent(input) }],
      modalities: ["image", "text"],
      max_tokens: config.OPENROUTER_MAX_TOKENS,
      image_config: chatImageConfig(input),
      quality: QUALITY_MAP[input.quality] || "standard",
      n: input.count,
    },
    extractImages: extractChatCompletionImages,
  };
}

function buildFlux2KleinRequest(input) {
  return buildChatImageModelRequest(input, "flux-2-klein-4b");
}

function buildSeedream45Request(input) {
  return buildChatImageModelRequest(input, "seedream-4-5");
}

function buildFlux2MaxRequest(input) {
  return buildChatImageModelRequest(input, "flux-2-max");
}

function buildChatImageModelRequest(input, label) {
  return {
    label,
    endpointPath: "/chat/completions",
    body: {
      model: input.modelId,
      messages: [{ role: "user", content: chatContent(input) }],
      modalities: ["image", "text"],
      max_tokens: config.OPENROUTER_MAX_TOKENS,
      image_config: chatImageConfig(input),
      quality: QUALITY_MAP[input.quality] || "standard",
      n: input.count,
    },
    extractImages: extractChatCompletionImages,
  };
}

function buildGenericChatImageRequest(input) {
  return buildChatImageModelRequest(input, "generic-chat-image");
}

const MODEL_CALLERS = new Map([
  ["openai/gpt-image-2", buildOpenAiGptImage2Request],
  ["google/gemini-3.1-flash-image", buildGeminiFlashImageRequest],
  ["google/gemini-3-pro-image", buildGeminiProImageRequest],
  ["google/gemini-2.5-flash-image-preview", buildGeminiPreviewImageRequest],
  ["x-ai/grok-imagine-image-quality", buildGrokImagineQualityRequest],
  ["black-forest-labs/flux.1-kontext-max", buildFluxKontextRequest],
  ["black-forest-labs/flux.2-klein-4b", buildFlux2KleinRequest],
  ["bytedance-seed/seedream-4.5", buildSeedream45Request],
  ["black-forest-labs/flux.2-max", buildFlux2MaxRequest],
]);

function buildModelRequest(input) {
  const build = MODEL_CALLERS.get(input.modelId) || buildGenericChatImageRequest;
  return build(input);
}

function dataUrlFromBase64(value, mimeType = "image/png") {
  const clean = typeof value === "string" ? value.replace(/\s/g, "") : "";
  return clean ? "data:" + mimeType + ";base64," + clean : null;
}

function isLikelyBase64Image(value) {
  return typeof value === "string" && value.length > 200 && /^[A-Za-z0-9+/=\r\n]+$/.test(value);
}

function mimeFromValue(value, fallback = "image/png") {
  return IMAGE_MIME_TYPES.has(value || "") ? value : fallback;
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

function uniqueImages(images) {
  return [...new Set(images.filter(Boolean))];
}

function extractImagesEndpointImages(payload) {
  const images = [];
  for (const item of Array.isArray(payload?.data) ? payload.data : []) {
    if (typeof item?.b64_json === "string") images.push(dataUrlFromBase64(item.b64_json, mimeFromValue(item.mime_type || item.mimeType)));
    if (typeof item?.url === "string") images.push(item.url);
  }
  collectImageCandidates(payload, images);
  return uniqueImages(images);
}

function extractChatCompletionImages(payload) {
  const images = [];
  for (const choice of Array.isArray(payload?.choices) ? payload.choices : []) {
    const message = choice?.message || {};
    collectImageCandidates(message.images, images);
    collectImageCandidates(message.content, images);
  }
  collectImageCandidates(payload, images);
  return uniqueImages(images);
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

async function callOpenRouter(modelRequest, signal) {
  const response = await fetch(`${openRouterBaseUrl()}${modelRequest.endpointPath}`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": config.APP_URL || "http://localhost",
      "X-Title": config.APP_NAME,
    },
    body: JSON.stringify(modelRequest.body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `OpenRouter ${modelRequest.label} request failed (${response.status})`);
  return payload;
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
  if (!IMAGE_MIME_TYPES.has(mimeType)) throw new Error("Provider returned an unsupported image format");
  return { mimeType, bytes: Buffer.from(await response.arrayBuffer()) };
}

const extensionFor = (mimeType) => ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" })[mimeType];

async function reserve(userId, input) {
  const { data, error } = await supabaseAdmin.rpc("reserve_generation_task", {
    p_user_id: userId,
    p_model_id: input.modelId,
    p_prompt: input.prompt,
    p_parameters: { ratio: input.ratio, size: input.size, quality: input.quality, reference_count: input.referenceImages?.length || 0, negative_prompt: input.negativePrompt || null, seed: input.seed ?? null, client_request_id: input.clientRequestId || null },
    p_image_count: input.count,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function generateForUser(userId, rawInput) {
  await slots.acquire();
  const input = normalizeInput(rawInput);
  let reservation;
  const uploaded = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT_MS);
  try {
    reservation = await reserve(userId, input);
    const modelRequest = buildModelRequest(input);
    const payload = await callOpenRouter(modelRequest, controller.signal);
    const images = modelRequest.extractImages(payload);
    if (!images.length) throw new Error(`The ${modelRequest.label} call returned no recognizable image. Endpoint: ${modelRequest.endpointPath}. Response shape: ${JSON.stringify(describeProviderShape(payload))}`);
    if (images.length < input.count) throw new Error(`The ${modelRequest.label} call returned ${images.length} image(s), but ${input.count} were requested`);

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
