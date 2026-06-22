import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  OPENROUTER_API_KEY: z.string().startsWith("sk-or-"),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  APP_URL: z.string().url().optional(),
  APP_NAME: z.string().min(1).default("Prism Image Studio"),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(10000).max(600000).default(180000),
  MAX_CONCURRENT_GENERATIONS: z.coerce.number().int().min(1).max(50).default(4),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid server configuration: ${fields}`);
}
export const config = parsed.data;