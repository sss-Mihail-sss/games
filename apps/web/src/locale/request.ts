// Server-only by intent, not just because next/root-params happens to be:
// a value import of this module (or of locale/index.ts) from a Client Component
// fails the build with "'server-only' cannot be imported from a Client Component".
import "server-only";

import { notFound } from "next/navigation";
import { locale } from "next/root-params";

import { isLocale } from "./locale.ts";
import type { Locale } from "./locale.ts";

/**
 * The locale of the current request, read from the `[locale]` root param.
 * Server Components only. An unknown locale is a 404, never a fallback:
 * otherwise `/xx/...` would render Russian pages under a wrong URL.
 */
export async function getLocale(): Promise<Locale> {
  const current = await locale();
  if (!isLocale(current)) {
    notFound();
  }
  return current;
}
