import type { APIRoute } from "astro";
import { getEnv, json, jsonError } from "@lib/cloudflare";
import { recordVisitorEvent, type VisitorEvent } from "@lib/visitor-events";

const events = new Set<VisitorEvent>(["visit", "directory", "media", "play"]);

export const POST: APIRoute = async (context) => {
  const env = await getEnv(context);
  const body = (await context.request.json().catch(() => ({}))) as Record<string, any>;
  const event = String(body.event || "") as VisitorEvent;
  if (!events.has(event)) return jsonError("Event is invalid.", 400);
  if (typeof body.path !== "string" || !body.path.trim()) return jsonError("Path is required.", 400);
  const row = await recordVisitorEvent(env, context.request, event, body.path, context.locals.cfContext?.waitUntil.bind(context.locals.cfContext));
  return json({ ok: true, id: row.id });
};
