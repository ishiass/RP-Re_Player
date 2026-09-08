import type { APIRoute } from "astro";
import { getEnv, json, jsonError } from "@lib/cloudflare";
import { isAdmin } from "@lib/admin";
import { deleteRedirectMount } from "@lib/redirect-mounts";

export const POST: APIRoute = async (context) => {
  const env = await getEnv(context);
  if (!(await isAdmin(context.request, env))) return jsonError("Admin login is required.", 401);
  const body = await context.request.json().catch(() => ({})) as Record<string, unknown>;
  const id = String(body.id || body.sourcePath || "");
  if (!id) return jsonError("id or sourcePath is required.", 400);
  await deleteRedirectMount(env, id);
  return json({ ok: true });
};
