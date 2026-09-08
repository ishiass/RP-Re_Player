import type { APIRoute } from "astro";
import { getEnv, json, jsonError } from "@lib/cloudflare";
import { isAdmin } from "@lib/admin";
import { allRedirectMounts, createRedirectMount, publicSourceUrl, publicTargetUrl } from "@lib/redirect-mounts";

export const GET: APIRoute = async (context) => {
  const env = await getEnv(context);
  if (!(await isAdmin(context.request, env))) return jsonError("Admin login is required.", 401);
  const items = await allRedirectMounts(env);
  return json({ ok: true, items: items.map((item) => ({ ...item, sourceUrl: publicSourceUrl(item.sourcePath), targetUrl: publicTargetUrl(item.targetPath) })) });
};

export const POST: APIRoute = async (context) => {
  const env = await getEnv(context);
  if (!(await isAdmin(context.request, env))) return jsonError("Admin login is required.", 401);
  const body = await context.request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const item = await createRedirectMount(env, String(body.sourcePath || ""), String(body.targetPath || ""));
    return json({ ok: true, item: { ...item, sourceUrl: publicSourceUrl(item.sourcePath), targetUrl: publicTargetUrl(item.targetPath) } });
  } catch (error) {
    return jsonError("Create failed.", 400, error instanceof Error ? error.message : String(error));
  }
};
