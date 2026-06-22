import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

export const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function authenticate(request, response, next) {
  const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return response.status(401).json({ error: "Authentication required" });
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return response.status(401).json({ error: "Invalid or expired session" });
  request.user = data.user;
  return next();
}