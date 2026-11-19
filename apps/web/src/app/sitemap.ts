import type { MetadataRoute } from "next";

import { games } from "../games/index.ts";
import { locales } from "../locale/index.ts";
import type { Locale } from "../locale/index.ts";
import { absoluteUrl, catalogPath, playPath } from "../site/index.ts";

/** One entry per page and locale, each listing its translations. */
function localized(path: (locale: Locale) => string): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    locales.map((locale) => [locale, absoluteUrl(path(locale))]),
  );
  return locales.map((locale) => ({
    url: absoluteUrl(path(locale)),
    alternates: { languages },
  }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...localized(catalogPath),
    ...games.manifests.flatMap((game) =>
      localized((locale) => playPath(locale, game.id)),
    ),
  ];
}
