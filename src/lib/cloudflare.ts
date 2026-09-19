import type { APIContext } from "astro";
import { env as cloudflareEnv } from "cloudflare:workers";

export interface AppEnv {
  A?: string;
  B?: string;
  C?: string;
  N?: string;
  P?: string;
  T?: string;
  US?: string;
  UI?: string;
  UH?: string;
  UD?: string;
  DB?: D1Database;
}

const persistedKeys = ["A", "B", "C", "N", "P", "US", "UI", "UH", "UD"] as const;
type PersistedKey = (typeof persistedKeys)[number];
const settingsCache = new WeakMap<object, Partial<Record<PersistedKey, string>>>();

async function loadPersistedEnv(env: AppEnv) {
  if (!env.DB) return {};
  const cached = settingsCache.get(env.DB as object);
  if (cached) return cached;

  try {
    await env.DB!.prepare(`
      CREATE TABLE IF NOT EXISTS rp_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();

    const bound = persistedKeys.flatMap((key) => {
      const value = env[key];
      return typeof value === "string" && value.trim() ? [[key, value] as const] : [];
    });
    if (bound.length) {
      await env.DB!.batch(bound.map(([key, value]) => env.DB!.prepare(`
        INSERT OR IGNORE INTO rp_settings (key, value, updated_at)
        VALUES (?, ?, ?)
      `).bind(`env:${key}`, value, Date.now())));
    }

    const result = await env.DB!.prepare(
      "SELECT key, value FROM rp_settings WHERE key LIKE 'env:%'"
    ).all<{ key: string; value: string }>();
    const stored: Partial<Record<PersistedKey, string>> = {};
    for (const row of result.results ?? []) {
      const key = row.key.slice(4) as PersistedKey;
      if (persistedKeys.includes(key) && row.value.trim()) stored[key] = row.value;
    }
    settingsCache.set(env.DB as object, stored);
    return stored;
  } catch {
    return {};
  }
}

export async function getEnv(context: APIContext): Promise<AppEnv> {
  void context;
  const runtimeEnv = cloudflareEnv as AppEnv;
  const env = {
    ...(import.meta.env as AppEnv),
    ...runtimeEnv
  };
  return {
    ...env,
    ...(await loadPersistedEnv(env))
  };
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), {
    ...init,
    headers
  });
}

export function jsonError(message: string, status = 400, details?: unknown) {
  return json(
    {
      ok: false,
      error: message,
      details
    },
    { status }
  );
}

export function safeName(input: string) {
  return input
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function safeFolder(input: FormDataEntryValue | null) {
  if (typeof input !== "string" || !input.trim()) return "uploads";
  return input
    .split("/")
    .map((part) => safeName(part))
    .filter(Boolean)
    .join("/")
    .slice(0, 220) || "uploads";
}
