import type { MiddlewareHandler } from "astro";
import { getEnv } from "@lib/cloudflare";
import { routeForChinaCloudIp } from "@lib/ip";

export const onRequest: MiddlewareHandler = async (context, next) => {
  const pathname = context.url.pathname;
  const publicEntry = pathname === "/" || pathname === "/Re" || pathname === "/Local" || pathname.startsWith("/Local/") || pathname === "/Loading" || pathname === "/Tree" || pathname.startsWith("/Tree/") || pathname === "/tree" || pathname.startsWith("/tree/");
  if (publicEntry && (context.request.method === "GET" || context.request.method === "HEAD")) {
    const redirect = await routeForChinaCloudIp(context.request, await getEnv(context));
    if (redirect) return Response.redirect(redirect, 302);
  }
  if (pathname === "/Tree" || pathname.startsWith("/Tree/")) {
    return context.rewrite(new URL(`/tree${pathname.slice("/Tree".length)}`, context.url));
  }
  return next();
};
