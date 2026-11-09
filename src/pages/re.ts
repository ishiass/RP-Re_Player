import type { APIRoute } from "astro";
import { isAdmin } from "@lib/admin";
import { getEnv, json } from "@lib/cloudflare";
import { migrateD1PseudoAndTheme } from "@lib/kv-migration";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const env = await getEnv(context);
  const headers = { "cache-control": "no-store, max-age=0" };
  if (!(await isAdmin(context.request, env))) {
    return json({ ok: false, error: "Admin login is required." }, { status: 401, headers });
  }

  try {
    return json({ ok: true, ...(await migrateD1PseudoAndTheme(env)) }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: "Migration batch failed.", details: message }, { status: 500, headers });
  }
};
