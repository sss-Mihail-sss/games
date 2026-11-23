import type { Metadata } from "next";
import Link from "next/link";

import { defaultLocale } from "#locale/index.ts";
import { catalogPath, siteName } from "#site/index.ts";

import "./globals.css";

export const metadata: Metadata = {
  title: `Страница не найдена · ${siteName}`,
};

/**
 * The 404 page for every URL we don't serve. It bypasses the root layout, so it
 * renders its own document. The locale of a bad URL can't be trusted (it may be
 * the bad part), so the page is in the default language.
 */
export default function GlobalNotFound() {
  return (
    <html lang={defaultLocale}>
      <body>
        <main>
          <h1>Страница не найдена</h1>
          <p>Такой игры или страницы нет.</p>
          <Link href={catalogPath(defaultLocale)}>Назад в каталог</Link>
        </main>
      </body>
    </html>
  );
}
