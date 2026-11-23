import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getLocale, localeParams } from "#locale/index.ts";
import { siteName, siteUrl } from "#site/index.ts";

import "../globals.css";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: siteName,
    template: `%s · ${siteName}`,
  },
  description: "Браузерные 2D- и 3D-игры.",
  openGraph: { siteName, type: "website" },
};

// Only the published locales exist; anything else is a 404 without rendering.
export const dynamicParams = false;
export const generateStaticParams = localeParams;

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // getLocale() also 404s on an unknown locale: the second line of defence,
  // because dynamicParams is unavailable with Cache Components.
  const current = await getLocale();

  return (
    <html lang={current}>
      <body className="p-8 font-sans">{children}</body>
    </html>
  );
}
