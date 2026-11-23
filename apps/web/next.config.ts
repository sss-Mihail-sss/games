import type { NextConfig } from "next";

import { defaultLocale } from "./src/locale/locale.ts";

const nextConfig: NextConfig = {
  // `/` has no root layout (it lives under app/[locale]). Language negotiation by
  // cookie and Accept-Language will move to proxy.ts later (docs/ARCHITECTURE.md).
  redirects: () =>
    Promise.resolve([
      { source: "/", destination: `/${defaultLocale}`, permanent: false },
    ]),
  // Workspace packages export TypeScript sources without a build step.
  transpilePackages: [
    "@repo/contracts",
    "@repo/game-bridge",
    "@repo/game-core",
    "@repo/game-protocol",
    "@repo/ui",
    "@repo/utils",
  ],
  // Self-contained server for the Docker image (see docs/ARCHITECTURE.md).
  output: "standalone",
  turbopack: {
    rules: {
      // Tailwind v4 as a Turbopack loader instead of PostCSS: one step less on
      // every CSS change. Only our own CSS: node_modules has no @import "tailwindcss".
      "*.css": {
        condition: { not: "foreign" },
        loaders: ["@tailwindcss/turbopack"],
      },
    },
  },
  experimental: {
    // Our root layout is app/[locale]/layout.tsx, so there is no layout for a
    // segment-level not-found.tsx to render into: every 404 (unknown locale, unknown
    // game, any unmatched URL) uses app/global-not-found.tsx instead.
    globalNotFound: true,
  },
};

export default nextConfig;
