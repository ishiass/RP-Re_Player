import type { APIContext } from "astro";
import { env as cloudflareEnv } from "cloudflare:workers";

export interface AppEnv {
  A?: string;
  B?: string;
  C?: string;
  N?: string;
  P?: string;
  T?: string;
  WM?: string;
  PBN?: string;
  US?: string;
  UI?: string;
  UH?: string;
  UD?: string;
  DB?: string;
  D1?: D1Database;
  KV?: KVNamespace;
}

const persistedKeys = ["A", "B", "C", "N", "P", "US", "UI", "UH", "UD"] as const;
type PersistedKey = (typeof persistedKeys)[number];
const settingsCache = new WeakMap<object, Partial<Record<PersistedKey, string>>>();

async function loadPersistedEnv(env: AppEnv) {
  if (!env.D1) return {};
  const cached = settingsCache.get(env.D1 as object);
  if (cached) return cached;

  try {
    await env.D1.prepare(`
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
      await env.D1.batch(bound.map(([key, value]) => env.D1!.prepare(`
        INSERT OR IGNORE INTO rp_settings (key, value, updated_at)
        VALUES (?, ?, ?)
      `).bind(`env:${key}`, value, Date.now())));
    }

    const result = await env.D1.prepare(
      "SELECT key, value FROM rp_settings WHERE key LIKE 'env:%'"
    ).all<{ key: string; value: string }>();
    const stored: Partial<Record<PersistedKey, string>> = {};
    for (const row of result.results ?? []) {
      const key = row.key.slice(4) as PersistedKey;
      if (persistedKeys.includes(key) && row.value.trim()) stored[key] = row.value;
    }
    settingsCache.set(env.D1 as object, stored);
    return stored;
  } catch {
    return {};
  }
}

export async function getEnv(context: APIContext): Promise<AppEnv> {
  void context;
  const buildEnv = import.meta.env as AppEnv;
  const runtimeEnv = cloudflareEnv as unknown as AppEnv & { DB?: string | D1Database };
  const merged = { ...buildEnv, ...runtimeEnv };
  const legacyD1 = typeof runtimeEnv.DB === "object" && runtimeEnv.DB !== null
    ? runtimeEnv.DB
    : undefined;
  const dbMode = typeof runtimeEnv.DB === "string"
    ? runtimeEnv.DB
    : typeof buildEnv.DB === "string"
      ? buildEnv.DB
      : undefined;
  const env: AppEnv = {
    ...merged,
    DB: dbMode,
    D1: runtimeEnv.D1 ?? legacyD1 ?? merged.D1
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
