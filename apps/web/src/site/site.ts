import type { Locale } from "../locale/index.ts";

export const siteName = "games.secrii.dev";

/** Absolute origin for canonical URLs, Open Graph and the sitemap. */
export const siteUrl = new URL("https://games.secrii.dev");

export function catalogPath(locale: Locale): string {
  return `/${locale}`;
}

export function playPath(locale: Locale, gameId: string): string {
  return `/${locale}/play/${gameId}`;
}

/** Turns a site path into an absolute URL, e.g. for the sitemap. */
export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl).toString();
}
