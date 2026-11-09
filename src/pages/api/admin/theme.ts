import type { APIRoute } from "astro";
import { isAdmin } from "@lib/admin";
import { getEnv, json, jsonError } from "@lib/cloudflare";
import { getVisitorTheme, nextVisitorTheme, setVisitorTheme } from "@lib/theme";
import { usesKvForPseudoAndTheme } from "@lib/storage";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const env = await getEnv(context);
    if (!(await isAdmin(context.request, env))) return jsonError("Admin login is required.", 401);
    const theme = await getVisitorTheme(env);
    return json({ ok: true, theme, persistent: Boolean(env.D1 || (usesKvForPseudoAndTheme(env) && env.KV)) });
  } catch (error) {
    return jsonError("Could not load the visitor theme.", 500, error instanceof Error ? error.message : String(error));
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const env = await getEnv(context);
    if (!(await isAdmin(context.request, env))) return jsonError("Admin login is required.", 401);
    const body = await context.request.json().catch(() => ({})) as { theme?: string };
    const current = await getVisitorTheme(env);
    const theme = await setVisitorTheme(env, body.theme || nextVisitorTheme(current));
    return json({ ok: true, theme, persistent: Boolean(env.D1 || (usesKvForPseudoAndTheme(env) && env.KV)) });
  } catch (error) {
    return jsonError("Could not switch the visitor theme.", 500, error instanceof Error ? error.message : String(error));
  }
};
