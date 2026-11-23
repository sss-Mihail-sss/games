/**
 * Smoke test of the production build, run the way it will run in Docker: the
 * standalone Next server under Bun (`bun server.js`), not `next start`.
 *
 *   bun run --filter web build && bun scripts/smoke.ts
 *
 * Env: SMOKE_PORT (default 4173, so it never clashes with `bun run dev` on 3000),
 * SMOKE_TIMEOUT_MS (how long to wait for the server, default 15 s).
 * Exits with 1 if any check fails or the server doesn't come up.
 */
import { cp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const WEB = join(ROOT, "apps/web");
const STANDALONE = join(WEB, ".next/standalone/apps/web");

const PORT = Number(process.env.SMOKE_PORT ?? 4173);
const READY_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 15_000);
const BASE = `http://127.0.0.1:${PORT}`;

interface Check {
  path: string;
  status: number;
  /** The redirect target must end with this. */
  location?: string;
  /** Each of these must appear in the response body. */
  body?: string[];
}

const CHECKS: Check[] = [
  { path: "/", status: 307, location: "/ru" },
  { path: "/ru", status: 200, body: ['<html lang="ru"'] },
  { path: "/ru/play/bridge", status: 200, body: ["og:title"] },
  { path: "/ru/play/nope", status: 404 },
  { path: "/robots.txt", status: 200, body: ["Sitemap:"] },
  { path: "/sitemap.xml", status: 200 },
];

/** The standalone build doesn't copy static files; Docker will do the same. */
async function prepare() {
  if (!(await Bun.file(join(STANDALONE, "server.js")).exists())) {
    throw new Error(
      "No standalone build. Run `bun run --filter web build` first.",
    );
  }
  for (const [from, to] of [
    [join(WEB, "public"), join(STANDALONE, "public")],
    [join(WEB, ".next/static"), join(STANDALONE, ".next/static")],
  ] as const) {
    await rm(to, { recursive: true, force: true });
    await mkdir(join(to, ".."), { recursive: true });
    await cp(from, to, { recursive: true });
  }
}

async function waitForServer(server: Bun.Subprocess) {
  const deadline = performance.now() + READY_TIMEOUT_MS;
  while (performance.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Server exited early with code ${server.exitCode}`);
    }
    try {
      await fetch(`${BASE}/ru`, { signal: AbortSignal.timeout(1000) });
      return; // any response means it's listening
    } catch {
      await Bun.sleep(200);
    }
  }
  throw new Error(`Server not ready on ${BASE} after ${READY_TIMEOUT_MS} ms`);
}

/** Problems with one response; empty if it matches the expectation. */
async function run(check: Check): Promise<string[]> {
  // manual: otherwise fetch follows the 307 and we'd see the 200 behind it.
  const response = await fetch(BASE + check.path, { redirect: "manual" });
  const problems: string[] = [];

  if (response.status !== check.status) {
    problems.push(`status ${response.status}, expected ${check.status}`);
  }
  if (check.location !== undefined) {
    const location = response.headers.get("location") ?? "";
    if (!location.endsWith(check.location)) {
      problems.push(
        `location "${location}", expected to end with "${check.location}"`,
      );
    }
  }
  if (check.body) {
    const body = await response.text();
    for (const text of check.body) {
      if (!body.includes(text)) {
        problems.push(`body has no ${JSON.stringify(text)}`);
      }
    }
  }
  return problems;
}

async function main(): Promise<boolean> {
  await prepare();

  const server = Bun.spawn([process.execPath, "server.js"], {
    cwd: STANDALONE,
    // HOSTNAME explicitly: Next listens on it, and it is often preset to the
    // machine or container name, which is not where we connect.
    env: { ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1" },
    stdout: "ignore",
    stderr: "inherit", // server errors land in the CI log
  });

  try {
    await waitForServer(server);
    let ok = true;
    for (const check of CHECKS) {
      const problems = await run(check);
      ok &&= problems.length === 0;
      console.log(
        problems.length === 0
          ? `✓ ${check.path}`
          : `✗ ${check.path}: ${problems.join("; ")}`,
      );
    }
    return ok;
  } finally {
    // Always, even on a failed check or a timeout: no server left on the port.
    server.kill();
    await server.exited;
  }
}

try {
  if (!(await main())) {
    process.exit(1);
  }
  console.log(`Smoke test passed: ${CHECKS.length} checks on ${BASE}`);
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
