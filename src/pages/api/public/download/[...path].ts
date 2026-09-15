import type { APIRoute } from "astro";
import { pseudoPathFromUrl, serveMedia } from "@lib/media-proxy";

export const prerender = false;

const prefix = "/api/public/download";

export const GET: APIRoute = (context) =>
  serveMedia(context, pseudoPathFromUrl(context.url, prefix), "GET", { disposition: "attachment", kind: "file" });

export const HEAD: APIRoute = (context) =>
  serveMedia(context, pseudoPathFromUrl(context.url, prefix), "HEAD", { disposition: "attachment", kind: "file" });
