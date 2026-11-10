import type { AppEnv } from "./cloudflare";
import { PSEUDO_KV_PREFIX, pseudoKvKey, usesKvForPseudoAndTheme } from "./storage";

export type PseudoKind = "video" | "audio" | "image" | "file";
export type H5Player = "playsvideo" | "movi" | "vplayer" | "select";

export interface PseudoItem {
  id: string;
  name: string;
  path: string;
  url: string;
  kind: PseudoKind;
  description?: string;
  artist?: string;
  poster?: string;
  sub?: string;
  embeddedMulti?: boolean;
  h5Player?: H5Player;
  lrc?: string;
  lrc2?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicNode {
  name: string;
  path: string;
  isDir: boolean;
  kind?: PseudoKind;
  artist?: string;
  poster?: string;
  sub?: string;
  updatedAt?: string;
}

type MemoryState = {
  items: PseudoItem[];
};

declare global {
  var __RP_PSEUDO_STATE__: MemoryState | undefined;
}

function memory() {
  globalThis.__RP_PSEUDO_STATE__ ??= { items: [] };
  return globalThis.__RP_PSEUDO_STATE__;
}

export function normalizeRootPath(path: string) {
  const normalized = `/${String(path || "/root")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .join("/")}`;

  if (normalized === "/") return "/root";
  if (normalized === "/root" || normalized.startsWith("/root/")) return normalized;
  return `/root/${normalized.replace(/^\/+/, "")}`;
}

export function safeFileName(input: string) {
  const value = String(input || "untitled")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return [...value].slice(0, 180).join("");
}

function assertRoutableSegment(segment: string, label: string) {
  if (!segment || segment === "." || segment === ".." || /[\\/\u0000-\u001f\u007f]/.test(segment)) {
    throw new Error(`${label} contains a path segment that cannot be used in a public URL.`);
  }
  try {
    encodeURIComponent(segment);
  } catch {
    throw new Error(`${label} contains invalid Unicode.`);
  }
}

function assertRoutableFolder(folder: string) {
  for (const segment of normalizeRootPath(folder).split("/").filter(Boolean).slice(1)) {
    assertRoutableSegment(segment, "Folder");
  }
}

export function publicMediaPath(path: string) {
  return publicAssetPath("/api/public/media", path);
}

export function publicDownloadPath(path: string) {
  return publicAssetPath("/api/public/download", path);
}

export function publicCoverPath(path: string) {
  return publicAssetPath("/api/public/cover", path);
}

function publicAssetPath(prefix: string, path: string) {
  const relative = normalizeRootPath(path).slice("/root".length);
  const encoded = relative
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return encoded ? `${prefix}/${encoded}` : prefix;
}

function webUrl(input: string, label: string) {
  const value = String(input || "").trim();
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must use HTTP or HTTPS.`);
  }
  return url.href;
}

function parentPath(path: string) {
  const parts = normalizeRootPath(path).split("/").filter(Boolean);
  parts.pop();
  return `/${parts.join("/")}` || "/root";
}

function pathConflict(items: PseudoItem[], path: string) {
  return items.some((existing) =>
    existing.path !== path &&
    (existing.path.startsWith(`${path}/`) || path.startsWith(`${existing.path}/`))
  );
}

async function ensureDb(env: AppEnv) {
  if (!env.D1) return false;
  await env.D1.prepare(
    `
      CREATE TABLE IF NOT EXISTS rp_pseudo_links (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        kind TEXT NOT NULL,
        description TEXT,
        poster TEXT,
        sub TEXT,
        embedded_multi INTEGER NOT NULL DEFAULT 0,
        embedded_player TEXT,
        lrc TEXT,
        lrc2 TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `
  ).run();

  const info = await env.D1.prepare("PRAGMA table_info(rp_pseudo_links)").all<{ name: string }>();
  if (!(info.results ?? []).some((column) => column.name === "sub")) {
    await env.D1.prepare("ALTER TABLE rp_pseudo_links ADD COLUMN sub TEXT").run();
  }
  if (!(info.results ?? []).some((column) => column.name === "embedded_multi")) {
    await env.D1.prepare("ALTER TABLE rp_pseudo_links ADD COLUMN embedded_multi INTEGER NOT NULL DEFAULT 0").run();
  }
  if (!(info.results ?? []).some((column) => column.name === "embedded_player")) {
    await env.D1.prepare("ALTER TABLE rp_pseudo_links ADD COLUMN embedded_player TEXT").run();
  }
  if (!(info.results ?? []).some((column) => column.name === "lrc")) {
    await env.D1.prepare("ALTER TABLE rp_pseudo_links ADD COLUMN lrc TEXT").run();
  }
  if (!(info.results ?? []).some((column) => column.name === "lrc2")) {
    await env.D1.prepare("ALTER TABLE rp_pseudo_links ADD COLUMN lrc2 TEXT").run();
  }
  if (!(info.results ?? []).some((column) => column.name === "description")) {
    await env.D1.prepare("ALTER TABLE rp_pseudo_links ADD COLUMN description TEXT").run();
  }
  return true;
}

function mapRow(row: any): PseudoItem {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    url: row.url,
    kind: row.kind,
    description: row.description || undefined,
    poster: row.poster || undefined,
    sub: row.sub || undefined,
    embeddedMulti: Boolean(row.embedded_multi),
    h5Player: ["playsvideo", "movi", "vplayer", "select"].includes(row.embedded_player)
      ? row.embedded_player
      : row.embedded_multi
        ? "movi"
        : undefined,
    lrc: row.lrc || undefined,
    lrc2: row.lrc2 || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function allItemsFromD1(env: AppEnv): Promise<PseudoItem[]> {
  if (await ensureDb(env)) {
    const result = await env.D1!.prepare(
      "SELECT id, name, path, url, kind, description, poster, sub, embedded_multi, embedded_player, lrc, lrc2, created_at, updated_at FROM rp_pseudo_links ORDER BY path ASC"
    ).all<any>();
    return (result.results ?? []).map(mapRow);
  }
  return [...memory().items].sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
}

async function allItemsFromD1Backup(env: AppEnv): Promise<PseudoItem[]> {
  if (!env.D1) return [];
  try {
    const result = await env.D1.prepare(
      "SELECT id, name, path, url, kind, description, poster, sub, embedded_multi, embedded_player, lrc, lrc2, created_at, updated_at FROM rp_pseudo_links ORDER BY path ASC"
    ).all<any>();
    return (result.results ?? []).map(mapRow);
  } catch {
    return [];
  }
}

function sameItem(left: PseudoItem, right: PseudoItem) {
  const fields: Array<keyof PseudoItem> = [
    "id", "name", "path", "url", "kind", "description", "poster", "sub",
    "embeddedMulti", "h5Player", "lrc", "lrc2", "createdAt", "updatedAt"
  ];
  return fields.every((field) => (left[field] ?? "") === (right[field] ?? ""));
}

async function backupItemToD1(env: AppEnv, item: PseudoItem) {
  if (!(await ensureDb(env))) return;
  const existing = await env.D1!.prepare(
    "SELECT id, name, path, url, kind, description, poster, sub, embedded_multi, embedded_player, lrc, lrc2, created_at, updated_at FROM rp_pseudo_links WHERE path = ? LIMIT 1"
  ).bind(item.path).first<any>();
  if (existing && sameItem(mapRow(existing), item)) return;

  await env.D1!.prepare(`
    INSERT INTO rp_pseudo_links (id, name, path, url, kind, description, poster, sub, embedded_multi, embedded_player, lrc, lrc2, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      id = excluded.id,
      name = excluded.name,
      url = excluded.url,
      kind = excluded.kind,
      description = excluded.description,
      poster = excluded.poster,
      sub = excluded.sub,
      embedded_multi = excluded.embedded_multi,
      embedded_player = excluded.embedded_player,
      lrc = excluded.lrc,
      lrc2 = excluded.lrc2,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).bind(
    item.id,
    item.name,
    item.path,
    item.url,
    item.kind,
    item.description ?? null,
    item.poster ?? null,
    item.sub ?? null,
    item.embeddedMulti ? 1 : 0,
    item.h5Player ?? null,
    item.lrc ?? null,
    item.lrc2 ?? null,
    item.createdAt,
    item.updatedAt
  ).run();
}

async function writeItemToKv(env: AppEnv, item: PseudoItem) {
  const key = await pseudoKvKey(item.path);
  await env.KV!.put(key, JSON.stringify(item));
}

async function allItemsFromKv(env: AppEnv): Promise<PseudoItem[]> {
  const items: PseudoItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.KV!.list({
      prefix: PSEUDO_KV_PREFIX,
      limit: 1000,
      ...(cursor ? { cursor } : {})
    });
    for (let start = 0; start < page.keys.length; start += 50) {
      const keys = page.keys.slice(start, start + 50);
      const values = await Promise.all(keys.map(({ name }) => env.KV!.get(name)));
      for (const value of values) {
        if (!value) continue;
        try {
          const item = JSON.parse(value) as PseudoItem;
          if (item && typeof item.path === "string" && typeof item.id === "string") items.push(item);
        } catch {
          // Ignore malformed values without mutating KV during reads.
        }
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return items.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
}

export async function allItems(env: AppEnv): Promise<PseudoItem[]> {
  if (usesKvForPseudoAndTheme(env)) {
    try {
      const [backup, live] = await Promise.all([allItemsFromD1Backup(env), allItemsFromKv(env)]);
      const byPath = new Map(backup.map((item) => [item.path, item]));
      for (const item of live) byPath.set(item.path, item);
      return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
    } catch {
      return allItemsFromD1(env);
    }
  }
  return allItemsFromD1(env);
}

export async function listPublic(env: AppEnv, path = "/root", query = "") {
  const current = normalizeRootPath(path);
  const items = await allItems(env);
  // The Tree mount is a separate native-player entry and is intentionally hidden from Local.
  const visibleItems = items.filter((item) => {
    const path = item.path.toLocaleLowerCase();
    return !(path === "/root/tree" || path.startsWith("/root/tree/"));
  });
  const children = new Map<string, PublicNode>();
  const search = String(query || "").trim().slice(0, 100).toLocaleLowerCase();
  const prefix = current === "/root" ? "/root/" : `${current}/`;

  if (search) {
    for (const item of visibleItems) {
      if (!item.path.startsWith(prefix)) continue;
      const rest = item.path.slice(current.length).replace(/^\/+/, "");
      if (!rest) continue;

      const parts = rest.split("/");
      let folderPath = current;
      for (const folder of parts.slice(0, -1)) {
        folderPath = `${folderPath}/${folder}`;
        if (folder.toLocaleLowerCase().includes(search)) {
          children.set(folderPath, { name: folder, path: folderPath, isDir: true });
        }
      }

      if (item.name.toLocaleLowerCase().includes(search)) {
        children.set(item.path, {
          name: item.name,
          path: item.path,
          isDir: false,
          kind: item.kind,
          artist: item.artist,
          poster: item.poster,
          sub: item.sub,
          updatedAt: item.updatedAt
        });
      }
    }

    const results = [...children.values()]
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.path.localeCompare(b.path, "zh-CN"));
    return {
      path: current,
      query: String(query || "").trim().slice(0, 100),
      items: results.slice(0, 300),
      truncated: results.length > 300
    };
  }

  for (const item of visibleItems) {
    if (!item.path.startsWith(prefix)) continue;
    const rest = item.path.slice(current.length).replace(/^\/+/, "");
    if (!rest) continue;

    const [first, ...remaining] = rest.split("/");
    if (remaining.length > 0) {
      const folderPath = `${current}/${first}`;
      children.set(folderPath, {
        name: first,
        path: folderPath,
        isDir: true
      });
    } else {
      children.set(item.path, {
        name: item.name,
        path: item.path,
        isDir: false,
        kind: item.kind,
        poster: item.poster,
        sub: item.sub,
        updatedAt: item.updatedAt
      });
    }
  }

  return {
    path: current,
    query: "",
    items: [...children.values()].sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, "zh-CN"))
  };
}

export async function getItem(env: AppEnv, path: string) {
  const normalized = normalizeRootPath(path);
  if (usesKvForPseudoAndTheme(env)) {
    try {
      const value = await env.KV!.get(await pseudoKvKey(normalized));
      if (value) {
        const item = JSON.parse(value) as PseudoItem;
        if (item && typeof item.path === "string" && typeof item.id === "string") return item;
      }
    } catch {
      // Fall back to the read-only D1 backup if KV is unavailable or malformed.
    }
    return getItemFromD1Backup(env, normalized);
  }
  return getItemFromD1(env, normalized);
}

async function getItemFromD1Backup(env: AppEnv, normalized: string) {
  if (!env.D1) return null;
  try {
    const row = await env.D1.prepare(
      "SELECT id, name, path, url, kind, description, poster, sub, embedded_multi, embedded_player, lrc, lrc2, created_at, updated_at FROM rp_pseudo_links WHERE path = ? LIMIT 1"
    ).bind(normalized).first<any>();
    return row ? mapRow(row) : null;
  } catch {
    return null;
  }
}

async function getItemFromD1(env: AppEnv, normalized: string) {
  if (await ensureDb(env)) {
    const row = await env.D1!.prepare(
      "SELECT id, name, path, url, kind, description, poster, sub, embedded_multi, embedded_player, lrc, lrc2, created_at, updated_at FROM rp_pseudo_links WHERE path = ? LIMIT 1"
    )
      .bind(normalized)
      .first<any>();
    return row ? mapRow(row) : null;
  }
  return memory().items.find((item) => item.path === normalized) ?? null;
}

export async function createItem(
  env: AppEnv,
  input: {
    folder: string;
    name: string;
    url: string;
    kind: PseudoKind;
    description?: string;
    poster?: string;
    sub?: string;
    embeddedMulti?: boolean;
    h5Player?: H5Player;
    lrc?: string;
    lrc2?: string;
  }
) {
  const folder = normalizeRootPath(input.folder || "/root");
  assertRoutableFolder(folder);
  const name = safeFileName(input.name);
  if (!name) throw new Error("Name is required.");
  assertRoutableSegment(name, "Name");
  const path = `${folder.replace(/\/+$/, "")}/${name}`;
  const now = new Date().toISOString();
  const selectedH5Player = ["playsvideo", "movi", "vplayer", "select"].includes(input.h5Player || "")
    ? input.h5Player
    : undefined;
  const embeddedMulti = input.kind === "video" && (Boolean(input.embeddedMulti) || Boolean(selectedH5Player));
  const item: PseudoItem = {
    id: crypto.randomUUID(),
    name,
    path,
    url: webUrl(input.url, "Media URL") || "",
    kind: input.kind === "file" || input.kind === "image" || input.kind === "audio" ? input.kind : "video",
    description: input.kind === "file" ? String(input.description || "").trim() : undefined,
    poster: input.kind === "file" ? undefined : webUrl(input.poster || "", "Poster URL"),
    sub: input.kind === "video" ? webUrl(input.sub || "", "Subtitle URL") : undefined,
    embeddedMulti,
    h5Player: embeddedMulti ? selectedH5Player ?? "movi" : undefined,
    lrc: input.kind === "audio" ? webUrl(input.lrc || "", "Lyrics URL") : undefined,
    lrc2: input.kind === "audio" ? webUrl(input.lrc2 || "", "Other lyrics URL") : undefined,
    createdAt: now,
    updatedAt: now
  };

  if (!item.url) throw new Error("URL is required.");

  const conflicts = (await allItems(env)).filter((existing) => existing.path !== path);
  if (conflicts.some((existing) => existing.path.startsWith(`${path}/`))) {
    throw new Error("This path is already used as a folder.");
  }
  if (conflicts.some((existing) => path.startsWith(`${existing.path}/`))) {
    throw new Error("A media item cannot be used as a folder.");
  }

  const kvMode = usesKvForPseudoAndTheme(env);
  if (kvMode) {
    await writeItemToKv(env, item);
    const storedValue = await env.KV!.get(await pseudoKvKey(item.path));
    if (!storedValue) throw new Error("The mounted item could not be read back from KV.");
    const storedItem = JSON.parse(storedValue) as PseudoItem;
    await backupItemToD1(env, storedItem);
    return storedItem;
  }

  const dbReady = await ensureDb(env);
  if (dbReady) {
    const result = await env.D1!.prepare(
      `
        INSERT INTO rp_pseudo_links (id, name, path, url, kind, description, poster, sub, embedded_multi, embedded_player, lrc, lrc2, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1
          FROM rp_pseudo_links
          WHERE path <> ?
            AND (
              substr(path, 1, length(?) + 1) = ? || '/'
              OR substr(?, 1, length(path) + 1) = path || '/'
            )
        )
        ON CONFLICT(path) DO UPDATE SET
          name = excluded.name,
          url = excluded.url,
          kind = excluded.kind,
          description = excluded.description,
          poster = excluded.poster,
          sub = excluded.sub,
          embedded_multi = excluded.embedded_multi,
          embedded_player = excluded.embedded_player,
          lrc = excluded.lrc,
          lrc2 = excluded.lrc2,
          updated_at = excluded.updated_at
      `
    )
      .bind(
        item.id,
        item.name,
        item.path,
        item.url,
        item.kind,
        item.description ?? null,
        item.poster ?? null,
        item.sub ?? null,
        item.embeddedMulti ? 1 : 0,
        item.h5Player ?? null,
        item.lrc ?? null,
        item.lrc2 ?? null,
        now,
        now,
        path,
        path,
        path,
        path
      )
      .run();
    if (!result.meta.changes) throw new Error("This path conflicts with another media item.");
  }

  if (!dbReady) {
    const state = memory();
    if (pathConflict(state.items, path)) throw new Error("This path conflicts with another media item.");
    state.items = [item, ...state.items.filter((existing) => existing.path !== item.path)];
  }

  return item;
}

export async function deleteItem(env: AppEnv, pathOrId: string) {
  const kvMode = usesKvForPseudoAndTheme(env);
  const normalized = normalizeRootPath(pathOrId);
  let item = kvMode
    ? (await allItems(env)).find((candidate) => candidate.id === pathOrId || candidate.path === normalized)
    : undefined;
  if (kvMode && env.KV) {
    const targetPath = item?.path || (String(pathOrId).startsWith("/") ? normalized : "");
    if (targetPath) {
      const key = await pseudoKvKey(targetPath);
      if (await env.KV.get(key)) await env.KV.delete(key);
      if (await env.KV.get(key)) throw new Error("The mounted item could not be removed from KV.");
    }
  }

  const dbReady = await ensureDb(env);
  if (dbReady) {
    await env.D1!.prepare("DELETE FROM rp_pseudo_links WHERE id = ? OR path = ?")
      .bind(pathOrId, normalizeRootPath(pathOrId))
      .run();
  }
  if (!kvMode && !dbReady) {
    const state = memory();
    state.items = state.items.filter((item) => item.id !== pathOrId && item.path !== normalized);
  }

  return true;
}

export { parentPath };
