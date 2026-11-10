import type { AppEnv } from "./cloudflare";

export const PSEUDO_KV_PREFIX = "rp:v1:pseudo:";
export const THEME_KV_KEY = "rp:v1:visitor-theme";

export function usesKvForPseudoAndTheme(env: AppEnv) {
  return String(env.DB || "").trim().toLowerCase() === "kv" && Boolean(env.KV);
}

export async function pseudoKvKey(path: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(path));
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${PSEUDO_KV_PREFIX}${hash}`;
}
