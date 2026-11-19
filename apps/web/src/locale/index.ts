export { defaultLocale, isLocale, localeParams, locales } from "./locale.ts";
export type { Locale } from "./locale.ts";
// Server only: imports next/root-params. Client components import types from here, not values.
export { getLocale } from "./request.ts";
