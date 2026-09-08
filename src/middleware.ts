import type { MiddlewareHandler } from "astro";
import { getEnv } from "@lib/cloudflare";
import { redirectTargetForPublicPath } from "@lib/redirect-mounts";

export const onRequest: MiddlewareHandler = async (context, next) => {
  const pathname = context.url.pathname;
  const lowerPath = pathname.toLocaleLowerCase();
  if (lowerPath.startsWith("/local/pash/") || lowerPath.startsWith("/loacl/pash/") || lowerPath.startsWith("/tree/")) {
    const env = await getEnv(context);
    const redirect = await redirectTargetForPublicPath(env, pathname);
    if (redirect && redirect !== pathname) return Response.redirect(new URL(redirect, context.url), 302);
  }
  if (pathname === "/Tree" || pathname.startsWith("/Tree/")) {
    return context.rewrite(new URL(`/tree${pathname.slice("/Tree".length)}`, context.url));
  }
  return next();
};
