import type { APIContext, APIRoute } from "astro";
import { getEnv } from "@lib/cloudflare";
import { getItem } from "@lib/pseudo";
import { getEmbeddedAudioCover } from "@lib/audio-cover";
import { pseudoPathFromUrl } from "@lib/media-proxy";

export const prerender = false;

const prefix = "/api/public/cover";

async function serveCover(context: APIContext, method: "GET" | "HEAD") {
  const path = pseudoPathFromUrl(context.url, prefix);
  if (!path) return new Response("Not found.", { status: 404 });
  const item = await getItem(await getEnv(context), path);
  if (!item || item.kind !== "audio") return new Response("Not found.", { status: 404 });

  const cover = await getEmbeddedAudioCover(context, item);
  if (!cover) return new Response("Cover art was not found.", { status: 404 });
  return new Response(method === "HEAD" ? null : cover.data.buffer as ArrayBuffer, {
    headers: {
      "content-type": cover.mimeType,
      "cache-control": "public, max-age=3600"
    }
  });
}

export const GET: APIRoute = (context) => serveCover(context, "GET");
export const HEAD: APIRoute = (context) => serveCover(context, "HEAD");
