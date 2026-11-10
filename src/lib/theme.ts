import type { AppEnv } from "./cloudflare";
import { THEME_KV_KEY, usesKvForPseudoAndTheme } from "./storage";

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
  return normalizeVisitorTheme(legacy?.value);
}

export async function getVisitorTheme(env: AppEnv): Promise<VisitorTheme> {
  if (usesKvForPseudoAndTheme(env)) {
    try {
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
  if (usesKvForPseudoAndTheme(env)) {
    const current = await env.KV!.get(THEME_KV_KEY);
    if (current !== theme) await env.KV!.put(THEME_KV_KEY, theme);
    const stored = await env.KV!.get(THEME_KV_KEY);
    if (stored && await ensureThemeTable(env)) {
      const backup = await env.D1!.prepare("SELECT value FROM rp_visitor_theme WHERE id = 1")
        .first<{ value: string }>();
      const storedTheme = normalizeVisitorTheme(stored);
      if (backup?.value !== storedTheme) {
        await env.D1!.prepare("INSERT OR REPLACE INTO rp_visitor_theme (id, value) VALUES (1, ?)")
          .bind(storedTheme)
          .run();
      }
    }
    return normalizeVisitorTheme(stored || theme);
  }
  if (await ensureThemeTable(env)) {
    const backup = await env.D1!.prepare("SELECT value FROM rp_visitor_theme WHERE id = 1")
      .first<{ value: string }>();
    if (backup?.value !== theme) {
      await env.D1!.prepare("INSERT OR REPLACE INTO rp_visitor_theme (id, value) VALUES (1, ?)")
        .bind(theme)
        .run();
    }
  }
  return theme;
}

export function nextVisitorTheme(current: unknown): VisitorTheme {
  const theme = normalizeVisitorTheme(current);
  return visitorThemes[(visitorThemes.indexOf(theme) + 1) % visitorThemes.length];
}
