import type { MetadataRoute } from "next";

import { absoluteUrl } from "#site/index.ts";

/** Everything is public; the sitemap tells crawlers which pages exist. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
