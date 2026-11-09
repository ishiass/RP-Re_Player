import type { AppEnv } from "./cloudflare";
import { THEME_KV_KEY, THEME_KV_READY_KEY, usesKvForPseudoAndTheme } from "./storage";

export const visitorThemes = ["blue", "retro", "future", "tech", "gray"] as const;
export type VisitorTheme = (typeof visitorThemes)[number];

const legacyThemes: Record<string, VisitorTheme> = {
  default: "blue",
  azure: "future",
  newblue: "tech",
  lightgray: "gray"
};

export function normalizeVisitorTheme(value: unknown): VisitorTheme {
  const theme = String(value || "").toLowerCase();
  if (visitorThemes.includes(theme as VisitorTheme)) return theme as VisitorTheme;
  return legacyThemes[theme] || "blue";
}

async function ensureThemeTable(env: AppEnv) {
  if (!env.D1) return false;
  await env.D1.prepare(`
    CREATE TABLE IF NOT EXISTS rp_visitor_theme (
      id INTEGER PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).run();
  return true;
}

export async function getVisitorThemeFromD1(env: AppEnv): Promise<VisitorTheme> {
  if (!(await ensureThemeTable(env))) return "blue";
  const row = await env.D1!.prepare("SELECT value FROM rp_visitor_theme WHERE id = 1")
    .first<{ value: string }>();
  if (row?.value) return normalizeVisitorTheme(row.value);

  const legacy = await env.D1!.prepare("SELECT value FROM rp_settings WHERE key = ?")
    .bind("visitor_theme")
    .first<{ value: string }>()
    .catch(() => null);
  const theme = normalizeVisitorTheme(legacy?.value);
  if (legacy?.value) {
    await env.D1!.prepare("INSERT OR REPLACE INTO rp_visitor_theme (id, value) VALUES (1, ?)")
      .bind(theme)
      .run();
  }
  return theme;
}

async function ensureKvThemeReady(env: AppEnv) {
  if (!env.KV || await env.KV.get(THEME_KV_READY_KEY) === "1") return;
  await env.KV.put(THEME_KV_KEY, await getVisitorThemeFromD1(env));
  await env.KV.put(THEME_KV_READY_KEY, "1");
}

export async function getVisitorTheme(env: AppEnv): Promise<VisitorTheme> {
  if (usesKvForPseudoAndTheme(env)) {
    try {
      await ensureKvThemeReady(env);
      const value = await env.KV!.get(THEME_KV_KEY);
      if (value) return normalizeVisitorTheme(value);
    } catch {
      return getVisitorThemeFromD1(env);
    }
  }
  return getVisitorThemeFromD1(env);
}

export async function setVisitorTheme(env: AppEnv, value: unknown): Promise<VisitorTheme> {
  const theme = normalizeVisitorTheme(value);
  if (await ensureThemeTable(env)) {
    await env.D1!.prepare("INSERT OR REPLACE INTO rp_visitor_theme (id, value) VALUES (1, ?)")
      .bind(theme)
      .run();
  }
  if (usesKvForPseudoAndTheme(env)) {
    await ensureKvThemeReady(env);
    await env.KV!.put(THEME_KV_KEY, theme);
  }
  return theme;
}

export function nextVisitorTheme(current: unknown): VisitorTheme {
  const theme = normalizeVisitorTheme(current);
  return visitorThemes[(visitorThemes.indexOf(theme) + 1) % visitorThemes.length];
}
