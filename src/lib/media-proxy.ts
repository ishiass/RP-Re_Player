import type { APIContext } from "astro";
import { getEnv } from "./cloudflare";
import { getItem, normalizeRootPath, publicDownloadPath, publicMediaPath, type PseudoKind } from "./pseudo";

const forwardedHeaders = ["range", "if-range", "if-none-match", "if-modified-since"];
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const mediaPrefix = "/api/public/media";
const downloadPrefix = "/api/public/download";
const maxProxyDepth = 5;
const maxRedirects = 5;

function mediaType(name: string) {
  const extension = name.toLowerCase().split(".").pop();
  const types: Record<string, string> = {
    mp4: "video/mp4",
    m4v: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
    ogg: "audio/ogg",
    wav: "audio/wav",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    pdf: "application/pdf",
    txt: "text/plain; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    json: "application/json",
    zip: "application/zip",
    "7z": "application/x-7z-compressed",
    rar: "application/vnd.rar"
  };
  return extension ? types[extension] : undefined;
}

export function pseudoPathFromUrl(url: URL, prefix = "/") {
  const base = prefix === "/" ? "" : prefix.replace(/\/+$/, "");
  if (base && url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return null;

  const relative = url.pathname.slice(base.length).replace(/^\/+/, "");
  if (!relative) return "/root";
  const encodedParts = relative.split("/");
  if (encodedParts.some((part) => !part)) return null;
  try {
    const parts = encodedParts.map((part) => decodeURIComponent(part));
    if (parts.some((part) =>
      !part || part === "." || part === ".." || /[\\/\u0000-\u001f\u007f]/.test(part)
    )) return null;
    return normalizeRootPath(`/root/${parts.join("/")}`);
  } catch {
    return null;
  }
}

function contentDispositionName(name: string) {
  try {
    return encodeURIComponent(name).replace(/['()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
  } catch {
    return "media";
  }
}

export async function serveMedia(
  context: APIContext,
  path: string | null,
  method: "GET" | "HEAD",
  options: { disposition?: "inline" | "attachment"; kind?: PseudoKind } = {}
) {
  if (!path || path === "/root") return new Response("Not found.", { status: 404 });

  const proxyDepth = Number(context.request.headers.get("x-rp-media-depth") || "0");
  if (!Number.isFinite(proxyDepth) || proxyDepth < 0 || proxyDepth >= maxProxyDepth) {
    return new Response("Media proxy loop detected.", { status: 508 });
  }

  const item = await getItem(await getEnv(context), path);
  if (!item) return new Response("Not found.", { status: 404 });
  if (options.kind && item.kind !== options.kind) return new Response("Not found.", { status: 404 });
  if (!options.kind && item.kind === "file") return new Response("Not found.", { status: 404 });

  let source: URL;
  try {
    source = new URL(item.url);
  } catch {
    return new Response("Invalid media source.", { status: 502 });
  }

  const requestHeaders = new Headers();
  for (const name of forwardedHeaders) {
    const value = context.request.headers.get(name);
    if (value) requestHeaders.set(name, value);
  }
  requestHeaders.set("x-rp-media-depth", String(proxyDepth + 1));

  let upstream: Response | undefined;
  let currentSource = source;
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const selfPath = publicMediaPath(item.path);
    const selfDownloadPath = publicDownloadPath(item.path);
    const isInternalProxy = currentSource.origin === context.url.origin &&
      (currentSource.pathname === context.url.pathname ||
        currentSource.pathname === selfPath ||
        currentSource.pathname === selfDownloadPath ||
        currentSource.pathname === mediaPrefix ||
        currentSource.pathname.startsWith(`${mediaPrefix}/`) ||
        currentSource.pathname === downloadPrefix ||
        currentSource.pathname.startsWith(`${downloadPrefix}/`));
    if ((currentSource.protocol !== "http:" && currentSource.protocol !== "https:") || isInternalProxy) {
      return new Response("Invalid media source.", { status: 502 });
    }

    try {
      upstream = await fetch(currentSource, { method, headers: requestHeaders, redirect: "manual" });
    } catch {
      return new Response("Media source is unavailable.", { status: 502 });
    }

    const location = upstream.headers.get("location");
    if (!redirectStatuses.has(upstream.status) || !location) break;
    if (redirects === maxRedirects) return new Response("Media source redirected too many times.", { status: 502 });
    try {
      currentSource = new URL(location, currentSource);
    } catch {
      return new Response("Invalid media redirect.", { status: 502 });
    }
  }
  if (!upstream) return new Response("Media source is unavailable.", { status: 502 });

  const headers = new Headers(upstream.headers);
  headers.delete("set-cookie");
  headers.delete("set-cookie2");
  const contentType = headers.get("content-type")?.toLowerCase() || "";
  if (!contentType || contentType.startsWith("application/octet-stream")) {
    const inferredType = mediaType(item.name);
    if (inferredType) headers.set("content-type", inferredType);
  }
  headers.set("content-disposition", `${options.disposition || "inline"}; filename*=UTF-8''${contentDispositionName(item.name)}`);

  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
}
