/** Languages the site is published in. The first one is the default. */
export const locales = ["ru"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = locales[0];

export function isLocale(value: unknown): value is Locale {
  return (locales as readonly unknown[]).includes(value);
}

/** Static params for the root `[locale]` segment. */
export function localeParams(): { locale: Locale }[] {
  return locales.map((locale) => ({ locale }));
}
