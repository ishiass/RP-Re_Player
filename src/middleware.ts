import type { MiddlewareHandler } from "astro";

export const onRequest: MiddlewareHandler = async (context, next) => {
  const pathname = context.url.pathname;
  if (pathname === "/Tree" || pathname.startsWith("/Tree/")) {
    return context.rewrite(new URL(`/tree${pathname.slice("/Tree".length)}`, context.url));
  }
  if (pathname === "/Action" || pathname.startsWith("/Action/")) {
    return context.rewrite(new URL(`/action${pathname.slice("/Action".length)}`, context.url));
  }
  return next();
};
