/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface ImportMetaEnv {
  readonly A?: string;
  readonly B?: string;
  readonly C?: string;
  readonly N?: string;
  readonly P?: string;
  readonly T?: string;
  readonly US?: string;
  readonly UI?: string;
  readonly UH?: string;
  readonly UD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
