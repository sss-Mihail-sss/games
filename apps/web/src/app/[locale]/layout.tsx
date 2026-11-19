import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { locale } from "next/root-params";
import type { ReactNode } from "react";

import { isLocale, localeParams } from "../../locale/index.ts";

import "../globals.css";

export const metadata: Metadata = {
  title: {
    default: "games.secrii.dev",
    template: "%s · games.secrii.dev",
  },
  description: "Браузерные 2D- и 3D-игры.",
};

// Only the published locales exist; anything else is a 404 without rendering.
export const dynamicParams = false;
export const generateStaticParams = localeParams;

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const current = await locale();
  // Second line of defence: dynamicParams is unavailable with Cache Components.
  if (!isLocale(current)) {
    notFound();
  }

  return (
    <html lang={current}>
      <body>{children}</body>
    </html>
  );
}
