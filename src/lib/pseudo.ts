import type { AppEnv } from "./cloudflare";

export type PseudoKind = "video" | "audio" | "image";

export interface PseudoItem {
  id: string;
  name: string;
  path: string;
  url: string;
  kind: PseudoKind;
  artist?: string;
  poster?: string;
  sub?: string;
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
  const relative = normalizeRootPath(path).slice("/root".length);
  const encoded = relative
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return encoded ? `/api/public/media/${encoded}` : "/api/public/media";
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
  if (!env.DB) return false;
  await env.DB.prepare(
    `
      CREATE TABLE IF NOT EXISTS rp_pseudo_links (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        kind TEXT NOT NULL,
        poster TEXT,
        sub TEXT,
        lrc TEXT,
        lrc2 TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `
  ).run();

  const info = await env.DB.prepare("PRAGMA table_info(rp_pseudo_links)").all<{ name: string }>();
  if (!(info.results ?? []).some((column) => column.name === "sub")) {
    await env.DB.prepare("ALTER TABLE rp_pseudo_links ADD COLUMN sub TEXT").run();
  }
  if (!(info.results ?? []).some((column) => column.name === "lrc")) {
    await env.DB.prepare("ALTER TABLE rp_pseudo_links ADD COLUMN lrc TEXT").run();
  }
  if (!(info.results ?? []).some((column) => column.name === "lrc2")) {
    await env.DB.prepare("ALTER TABLE rp_pseudo_links ADD COLUMN lrc2 TEXT").run();
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
    poster: row.poster || undefined,
    sub: row.sub || undefined,
    lrc: row.lrc || undefined,
    lrc2: row.lrc2 || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function allItems(env: AppEnv): Promise<PseudoItem[]> {
  if (await ensureDb(env)) {
    const result = await env.DB!.prepare(
      "SELECT id, name, path, url, kind, poster, sub, lrc, lrc2, created_at, updated_at FROM rp_pseudo_links ORDER BY path ASC"
    ).all<any>();
    return (result.results ?? []).map(mapRow);
  }
  return [...memory().items].sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
}

export async function listPublic(env: AppEnv, path = "/root", query = "") {
  const current = normalizeRootPath(path);
  const items = await allItems(env);
  // Tree and Action mounts are separate native-player entries and are intentionally hidden from Local.
  const visibleItems = items.filter((item) => {
    const path = item.path.toLocaleLowerCase();
    return !(path === "/root/tree" || path.startsWith("/root/tree/") || path === "/root/action" || path.startsWith("/root/action/"));
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
  if (await ensureDb(env)) {
    const row = await env.DB!.prepare(
      "SELECT id, name, path, url, kind, poster, sub, lrc, lrc2, created_at, updated_at FROM rp_pseudo_links WHERE path = ? LIMIT 1"
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
    poster?: string;
    sub?: string;
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
  const item: PseudoItem = {
    id: crypto.randomUUID(),
    name,
    path,
    url: webUrl(input.url, "Media URL") || "",
    kind: input.kind === "image" || input.kind === "audio" ? input.kind : "video",
    poster: webUrl(input.poster || "", "Poster URL"),
    sub: input.kind === "video" ? webUrl(input.sub || "", "Subtitle URL") : undefined,
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

  if (await ensureDb(env)) {
    const result = await env.DB!.prepare(
      `
        INSERT INTO rp_pseudo_links (id, name, path, url, kind, poster, sub, lrc, lrc2, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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
          poster = excluded.poster,
          sub = excluded.sub,
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
        item.poster ?? null,
        item.sub ?? null,
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
  } else {
    const state = memory();
    if (pathConflict(state.items, path)) throw new Error("This path conflicts with another media item.");
    state.items = [item, ...state.items.filter((existing) => existing.path !== item.path)];
  }

  return item;
}

export async function deleteItem(env: AppEnv, pathOrId: string) {
  if (await ensureDb(env)) {
    await env.DB!.prepare("DELETE FROM rp_pseudo_links WHERE id = ? OR path = ?")
      .bind(pathOrId, normalizeRootPath(pathOrId))
      .run();
  } else {
    const state = memory();
    const normalized = normalizeRootPath(pathOrId);
    state.items = state.items.filter((item) => item.id !== pathOrId && item.path !== normalized);
  }

  return true;
}

export { parentPath };
