import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
