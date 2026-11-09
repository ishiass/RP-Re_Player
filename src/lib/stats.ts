import type { AppEnv } from "./cloudflare";

export type StatEvent = "play" | "complete" | "progress";

export interface MediaStat {
  plays: number;
  completions: number;
  rate: number;
}

type VisitorStatRow = { plays: number; max_progress: number };
type MemoryRow = VisitorStatRow & { path: string; visitorId: string };

declare global {
  var __RP_MEDIA_STATS__: MemoryRow[] | undefined;
}

function memory() {
  globalThis.__RP_MEDIA_STATS__ ??= [];
  return globalThis.__RP_MEDIA_STATS__;
}

function result(row: VisitorStatRow | null | undefined, eligible = 0, completions = 0): MediaStat {
  const plays = Math.max(0, Number(row?.plays) || 0);
  const validEligible = Math.max(0, Math.floor(Number(eligible) || 0));
  const validCompletions = Math.min(validEligible, Math.max(0, Math.floor(Number(completions) || 0)));
  return {
    plays,
    completions: validCompletions,
    rate: validEligible ? Math.round((validCompletions / validEligible) * 1000) / 10 : 0
  };
}

async function ensureDb(env: AppEnv) {
  if (!env.D1) return false;
  await env.D1.prepare(
    `
      CREATE TABLE IF NOT EXISTS rp_media_visitors (
        path TEXT NOT NULL,
        visitor_id TEXT NOT NULL,
        plays INTEGER NOT NULL DEFAULT 0,
        max_progress REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (path, visitor_id)
      )
    `
  ).run();
  return true;
}

async function aggregateDb(env: AppEnv, path: string) {
  const row = await env.D1!.prepare(`
    SELECT SUM(CASE WHEN max_progress > 0.5 THEN 1 ELSE 0 END) AS eligible,
           SUM(CASE WHEN max_progress > 0.81 THEN 1 ELSE 0 END) AS completions
    FROM rp_media_visitors WHERE path = ?
  `).bind(path).first<{ eligible: number; completions: number }>();
  return { eligible: Number(row?.eligible) || 0, completions: Number(row?.completions) || 0 };
}

function aggregateMemory(path: string) {
  const rows = memory().filter((row) => row.path === path);
  return {
    eligible: rows.filter((row) => row.max_progress > 0.5).length,
    completions: rows.filter((row) => row.max_progress > 0.81).length
  };
}

export async function getMediaStat(env: AppEnv, path: string, visitorId: string): Promise<MediaStat> {
  if (await ensureDb(env)) {
    const row = await env.D1!.prepare(
      "SELECT plays, max_progress FROM rp_media_visitors WHERE path = ? AND visitor_id = ? LIMIT 1"
    ).bind(path, visitorId).first<VisitorStatRow>();
    const aggregate = await aggregateDb(env, path);
    return result(row, aggregate.eligible, aggregate.completions);
  }
  const row = memory().find((entry) => entry.path === path && entry.visitorId === visitorId);
  const aggregate = aggregateMemory(path);
  return result(row, aggregate.eligible, aggregate.completions);
}

export async function recordMediaStat(env: AppEnv, path: string, visitorId: string, event: StatEvent, progress = 0): Promise<MediaStat> {
  const nextProgress = Math.min(1, Math.max(0, Number(progress) || 0));
  if (await ensureDb(env)) {
    if (event === "play") {
      await env.D1!.prepare(
        `
          INSERT INTO rp_media_visitors (path, visitor_id, plays, max_progress)
          VALUES (?, ?, 1, 0)
          ON CONFLICT(path, visitor_id) DO UPDATE SET plays = plays + 1
        `
      ).bind(path, visitorId).run();
    } else {
      await env.D1!.prepare(
        `
          INSERT INTO rp_media_visitors (path, visitor_id, plays, max_progress)
          VALUES (?, ?, 0, ?)
          ON CONFLICT(path, visitor_id) DO UPDATE SET
            max_progress = MAX(max_progress, excluded.max_progress)
        `
      ).bind(path, visitorId, event === "complete" ? 1 : nextProgress).run();
    }
    return getMediaStat(env, path, visitorId);
  }

  const state = memory();
  let row = state.find((entry) => entry.path === path && entry.visitorId === visitorId);
  if (!row) {
    row = { path, visitorId, plays: 0, max_progress: 0 };
    state.push(row);
  }
  if (event === "play") row.plays += 1;
  else row.max_progress = Math.max(row.max_progress, event === "complete" ? 1 : nextProgress);
  const aggregate = aggregateMemory(path);
  return result(row, aggregate.eligible, aggregate.completions);
}
