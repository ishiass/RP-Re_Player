import type { AppEnv } from "./cloudflare";
import { normalizeRootPath } from "./pseudo";
import { visitorUrl } from "./visitor-route";

export interface RedirectMount {
  id: string;
  sourcePath: string;
  targetPath: string;
  createdAt: string;
  updatedAt: string;
}

type MemoryState = { items: RedirectMount[] };

declare global {
  var __RP_REDIRECT_MOUNTS__: MemoryState | undefined;
}

function memory() {
  globalThis.__RP_REDIRECT_MOUNTS__ ??= { items: [] };
  return globalThis.__RP_REDIRECT_MOUNTS__;
}

async function ensureDb(env: AppEnv) {
  if (!env.DB) return false;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS rp_redirect_mounts (
      id TEXT PRIMARY KEY,
      source_path TEXT NOT NULL UNIQUE,
      target_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  return true;
}

function mapRow(row: any): RedirectMount {
  return {
    id: String(row.id),
    sourcePath: String(row.source_path),
    targetPath: String(row.target_path),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function routablePath(path: string, label: string) {
  const normalizedParts = normalizeRootPath(path).split("/").filter(Boolean);
  if (normalizedParts[1]?.toLocaleLowerCase() === "tree") normalizedParts[1] = "tree";
  const normalized = `/${normalizedParts.join("/")}`;
  const parts = normalized.split("/").filter(Boolean).slice(1);
  if (!parts.length) throw new Error(`${label} must point to a mounted item.`);
  if (parts.some((part) => part === "." || part === ".." || /[\\/\u0000-\u001f\u007f]/.test(part))) {
    throw new Error(`${label} contains an invalid path segment.`);
  }
  return normalized;
}

export function normalizeRedirectPath(path: string, label = "Path") {
  return routablePath(path, label);
}

export async function allRedirectMounts(env: AppEnv) {
  if (await ensureDb(env)) {
    const result = await env.DB!.prepare(
      "SELECT id, source_path, target_path, created_at, updated_at FROM rp_redirect_mounts ORDER BY source_path ASC"
    ).all<any>();
    return (result.results ?? []).map(mapRow);
  }
  return [...memory().items].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath, "zh-CN"));
}

export async function createRedirectMount(env: AppEnv, sourceInput: string, targetInput: string) {
  const sourcePath = normalizeRedirectPath(sourceInput, "Source path");
  const targetPath = normalizeRedirectPath(targetInput, "Target path");
  if (sourcePath === targetPath) throw new Error("Source and target paths must be different.");
  const now = new Date().toISOString();
  const item: RedirectMount = {
    id: crypto.randomUUID(),
    sourcePath,
    targetPath,
    createdAt: now,
    updatedAt: now
  };

  if (await ensureDb(env)) {
    await env.DB!.prepare(
      `INSERT INTO rp_redirect_mounts (id, source_path, target_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(source_path) DO UPDATE SET target_path = excluded.target_path, updated_at = excluded.updated_at`
    ).bind(item.id, item.sourcePath, item.targetPath, now, now).run();
  } else {
    const state = memory();
    state.items = [item, ...state.items.filter((existing) => existing.sourcePath !== sourcePath)];
  }
  return item;
}

export async function deleteRedirectMount(env: AppEnv, idOrSource: string) {
  if (await ensureDb(env)) {
    await env.DB!.prepare("DELETE FROM rp_redirect_mounts WHERE id = ? OR source_path = ?")
      .bind(idOrSource, normalizeRootPath(idOrSource))
      .run();
  } else {
    const normalized = normalizeRootPath(idOrSource);
    const state = memory();
    state.items = state.items.filter((item) => item.id !== idOrSource && item.sourcePath !== normalized);
  }
  return true;
}

export async function redirectTargetForPublicPath(env: AppEnv, pathname: string) {
  const sourcePath = pseudoPathFromPublicUrl(pathname);
  if (!sourcePath) return null;
  const items = await allRedirectMounts(env);
  const match = items.find((item) => item.sourcePath === sourcePath);
  return match ? visitorUrl(match.targetPath) : null;
}

export function publicSourceUrl(path: string) {
  return visitorUrl(normalizeRootPath(path));
}

export function publicTargetUrl(path: string) {
  return visitorUrl(normalizeRootPath(path));
}

function decodeParts(relative: string) {
  const pieces = relative.replace(/^\/+|\/+$/g, "").split("/");
  if (!pieces.length || pieces.some((piece) => !piece)) return null;
  try {
    const decoded = pieces.map((piece) => decodeURIComponent(piece));
    if (decoded.some((part) => !part || part === "." || part === ".." || /[\\/\u0000-\u001f\u007f]/.test(part))) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function pseudoPathFromPublicUrl(pathname: string) {
  const value = String(pathname || "").replace(/\/$/, "") || "/";
  const lower = value.toLocaleLowerCase();
  const pashPrefix = lower.startsWith("/local/pash/") ? "/local/pash/" : lower.startsWith("/loacl/pash/") ? "/loacl/pash/" : null;
  if (pashPrefix) {
    const parts = decodeParts(value.slice(pashPrefix.length));
    return parts ? `/root/${parts.join("/")}` : null;
  }
  if (lower.startsWith("/tree/")) {
    const parts = decodeParts(value.slice("/tree/".length));
    return parts ? `/root/tree/${parts.join("/")}` : null;
  }
  return null;
}
