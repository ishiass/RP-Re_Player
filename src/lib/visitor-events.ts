import type { AppEnv } from "./cloudflare";
import { clientIp, countryOnlyDetails, formatRegion, lookupInitialCountry, lookupIpDetails } from "./ip";

export type VisitorEvent = "visit" | "directory" | "media" | "play";

export interface VisitorEventRow {
  id: string;
  event: VisitorEvent;
  path: string;
  ip: string;
  country: string;
  region: string;
  createdAt: string;
}

declare global {
  var __RP_VISITOR_EVENTS__: VisitorEventRow[] | undefined;
}

function memory() {
  globalThis.__RP_VISITOR_EVENTS__ ??= [];
  return globalThis.__RP_VISITOR_EVENTS__;
}

async function ensureDb(env: AppEnv) {
  if (!env.DB) return false;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS rp_visitor_events (
    id TEXT PRIMARY KEY,
    event TEXT NOT NULL,
    path TEXT NOT NULL,
    ip TEXT,
    country TEXT,
    region TEXT,
    created_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare("ALTER TABLE rp_visitor_events ADD COLUMN region TEXT").run().catch(() => undefined);
  return true;
}

async function enrichVisitorEvent(env: AppEnv, row: VisitorEventRow) {
  if (!row.ip || !row.country) return;
  try {
    const details = await lookupIpDetails(row.ip, row.country, 9000);
    if (!details) return;
    row.region = formatRegion(details, row.createdAt);
    if (await ensureDb(env)) {
      await env.DB!.prepare("UPDATE rp_visitor_events SET region = ? WHERE id = ?").bind(row.region, row.id).run();
    }
  } catch {
    // The initial country record is intentionally retained when enrichment fails.
  }
}

export async function recordVisitorEvent(
  env: AppEnv,
  request: Request,
  event: VisitorEvent,
  path: string,
  waitUntil?: (promise: Promise<unknown>) => void
) {
  const normalizedPath = String(path || "/").slice(0, 500);
  const ip = clientIp(request);
  const country = await lookupInitialCountry(request, ip);
  const createdAt = new Date().toISOString();
  const row: VisitorEventRow = {
    id: crypto.randomUUID(),
    event,
    path: normalizedPath,
    ip,
    country,
    region: country ? formatRegion(countryOnlyDetails(country), createdAt) : "-",
    createdAt
  };
  if (await ensureDb(env)) {
    await env.DB!.prepare("INSERT INTO rp_visitor_events (id, event, path, ip, country, region, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(row.id, row.event, row.path, row.ip, row.country, row.region, row.createdAt).run();
  } else {
    memory().unshift(row);
    memory().splice(5000);
  }
  const detailTask = enrichVisitorEvent(env, row);
  if (waitUntil) waitUntil(detailTask);
  else void detailTask;
  return row;
}

export async function listVisitorEvents(env: AppEnv, limit = 200) {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
  if (await ensureDb(env)) {
    const result = await env.DB!.prepare("SELECT id, event, path, ip, country, region, created_at FROM rp_visitor_events ORDER BY created_at DESC LIMIT ?").bind(safeLimit).all<any>();
    return (result.results ?? []).map((row) => ({ id: row.id, event: row.event, path: row.path, ip: row.ip || "", country: row.country || "", region: row.region || row.country || "-", createdAt: row.created_at }));
  }
  return memory().slice(0, safeLimit);
}

export async function visitorSummary(env: AppEnv) {
  if (await ensureDb(env)) {
    const result = await env.DB!.prepare("SELECT event, COUNT(*) AS count FROM rp_visitor_events GROUP BY event ORDER BY count DESC").all<{ event: string; count: number }>();
    return (result.results ?? []).map((row) => ({ event: row.event, count: Number(row.count) || 0 }));
  }
  const counts = new Map<string, number>();
  for (const row of memory()) counts.set(row.event, (counts.get(row.event) || 0) + 1);
  return [...counts.entries()].map(([event, count]) => ({ event, count }));
}
