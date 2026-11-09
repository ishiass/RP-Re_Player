import type { AppEnv } from "./cloudflare";
import { countItemsForMigration, itemsAfterForMigration } from "./pseudo";
import { getVisitorTheme } from "./theme";

const MIGRATION_ID = "d1-kv-pseudo-theme-v1";
const ITEM_PREFIX = "rp:v1:pseudo:";
const THEME_KEY = "rp:v1:visitor-theme";
const BATCH_SIZE = 100;
const LEASE_MS = 90_000;

interface MigrationState {
  migration_id: string;
  cursor: string;
  total: number;
  processed: number;
  theme_done: number;
  status: "pending" | "running" | "error" | "complete";
  lock_token: string | null;
  lease_until: number | null;
  last_error: string | null;
}

async function ensureMigrationState(env: AppEnv) {
  if (!env.DB) throw new Error("D1 binding is not configured.");
  if (!env.KV) throw new Error("KV binding is not configured.");

  const total = await countItemsForMigration(env);
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS rp_kv_migration (
      migration_id TEXT PRIMARY KEY,
      cursor TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL DEFAULT 0,
      processed INTEGER NOT NULL DEFAULT 0,
      theme_done INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      lock_token TEXT,
      lease_until INTEGER,
      last_error TEXT,
      updated_at TEXT NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO rp_kv_migration
      (migration_id, cursor, total, processed, theme_done, status, updated_at)
    VALUES (?, '', ?, 0, 0, 'pending', ?)
  `).bind(MIGRATION_ID, total, new Date().toISOString()).run();

  const state = await env.DB.prepare(
    "SELECT migration_id, cursor, total, processed, theme_done, status, lock_token, lease_until, last_error FROM rp_kv_migration WHERE migration_id = ?"
  ).bind(MIGRATION_ID).first<MigrationState>();
  if (!state) throw new Error("Could not initialize migration state.");
  return state;
}

function progress(state: MigrationState) {
  const done = state.status === "complete";
  return {
    migration: MIGRATION_ID,
    status: state.status,
    total: state.total,
    processed: state.processed,
    percent: done ? 100 : state.total ? Math.min(99, Math.floor(state.processed / state.total * 100)) : 0,
    next: done ? null : "/re",
    lastError: state.last_error || undefined
  };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function putIfChanged(env: AppEnv, key: string, value: string) {
  const current = await env.KV!.get(key);
  if (current !== value) await env.KV!.put(key, value);
}

export async function migrateD1PseudoAndTheme(env: AppEnv) {
  const state = await ensureMigrationState(env);
  if (state.status === "complete") return { ...progress(state), copiedThisRequest: 0, themeCopied: false };

  const now = Date.now();
  const token = crypto.randomUUID();
  const claim = await env.DB!.prepare(`
    UPDATE rp_kv_migration
    SET lock_token = ?, lease_until = ?, status = 'running', last_error = NULL, updated_at = ?
    WHERE migration_id = ? AND status <> 'complete'
      AND (lock_token IS NULL OR lease_until < ?)
  `).bind(token, now + LEASE_MS, new Date(now).toISOString(), MIGRATION_ID, now).run();

  if (!claim.meta.changes) {
    const current = await ensureMigrationState(env);
    const isComplete = current.status === "complete";
    return {
      ...progress(current),
      status: isComplete ? "complete" : "running",
      copiedThisRequest: 0,
      themeCopied: false,
      retryAfterSeconds: isComplete ? undefined : 5
    };
  }

  try {
    const current = await env.DB!.prepare(
      "SELECT migration_id, cursor, total, processed, theme_done, status, lock_token, lease_until, last_error FROM rp_kv_migration WHERE migration_id = ?"
    ).bind(MIGRATION_ID).first<MigrationState>();
    if (!current) throw new Error("Could not read migration state.");

    let themeDone = Boolean(current.theme_done);
    if (!themeDone) {
      await putIfChanged(env, THEME_KEY, await getVisitorTheme(env));
      themeDone = true;
    }

    const items = await itemsAfterForMigration(env, current.cursor, BATCH_SIZE);
    await Promise.all(items.map(async (item) => {
      const key = `${ITEM_PREFIX}${await sha256(item.path)}`;
      await putIfChanged(env, key, JSON.stringify(item));
    }));

    const processed = current.processed + items.length;
    const done = processed >= current.total || items.length < BATCH_SIZE;
    const cursor = items.at(-1)?.path ?? current.cursor;
    await env.DB!.prepare(`
      UPDATE rp_kv_migration
      SET cursor = ?, processed = ?, theme_done = ?, status = ?, lock_token = NULL,
          lease_until = NULL, last_error = NULL, updated_at = ?
      WHERE migration_id = ? AND lock_token = ?
    `).bind(
      cursor,
      processed,
      themeDone ? 1 : 0,
      done ? "complete" : "pending",
      new Date().toISOString(),
      MIGRATION_ID,
      token
    ).run();

    return {
      migration: MIGRATION_ID,
      status: done ? "complete" : "pending",
      total: current.total,
      processed,
      percent: done ? 100 : current.total ? Math.min(99, Math.floor(processed / current.total * 100)) : 0,
      copiedThisRequest: items.length,
      themeCopied: !current.theme_done,
      next: done ? null : "/re"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB!.prepare(`
      UPDATE rp_kv_migration
      SET status = 'error', last_error = ?, lock_token = NULL, lease_until = NULL, updated_at = ?
      WHERE migration_id = ? AND lock_token = ?
    `).bind(message.slice(0, 500), new Date().toISOString(), MIGRATION_ID, token).run().catch(() => undefined);
    throw error;
  }
}
