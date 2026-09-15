import type { APIRoute } from "astro";
import { getEnv, json, jsonError } from "@lib/cloudflare";
import { isAdmin } from "@lib/admin";
import { allItems, createItem } from "@lib/pseudo";

export const GET: APIRoute = async (context) => {
  const env = await getEnv(context);
  if (!(await isAdmin(context.request, env))) return jsonError("Admin login is required.", 401);

  const items = await allItems(env);
  return json({ ok: true, items });
};

export const POST: APIRoute = async (context) => {
  const env = await getEnv(context);
  if (!(await isAdmin(context.request, env))) return jsonError("Admin login is required.", 401);

  const body = (await context.request.json().catch(() => ({}))) as Record<string, any>;
  try {
    const item = await createItem(env, {
      folder: body.folder || "/root",
      name: body.name,
      url: body.url,
      kind: body.kind,
      description: body.description,
      poster: body.poster,
      sub: body.sub,
      lrc: body.lrc,
      lrc2: body.lrc2
    });
    return json({ ok: true, item });
  } catch (error) {
    return jsonError("Create failed.", 400, error instanceof Error ? error.message : error);
  }
};
