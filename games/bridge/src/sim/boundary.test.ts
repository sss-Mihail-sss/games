import { describe, expect, test } from "bun:test";
import { dirname, relative, resolve } from "node:path";

/**
 * The sim runs in the browser (prediction) and on the server (M2), so it may only
 * import the protocol and its own files. tsconfig.json here already rejects DOM
 * globals; this test rejects imports, e.g. `three`, `../client` or `@repo/game-core`
 * (DOM input and a requestAnimationFrame loop).
 */
const ALLOWED_PACKAGES = new Set(["@repo/game-protocol"]);
const ALLOWED_IN_TESTS = new Set(["bun:test", "node:path"]);

const SIM_DIR = import.meta.dir;

// Static imports, re-exports, side-effect imports and dynamic import().
const IMPORT =
  /(?:^|[\s;])(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|(?:^|[\s;])import\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(source: string): string[] {
  return [...source.matchAll(IMPORT)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
}

function violation(file: string, specifier: string): string | null {
  if (specifier.startsWith(".")) {
    const target = resolve(dirname(file), specifier);
    const inside = !relative(SIM_DIR, target).startsWith("..");
    return inside ? null : `imports ${specifier} from outside src/sim`;
  }
  if (ALLOWED_PACKAGES.has(specifier)) {
    return null;
  }
  if (file.endsWith(".test.ts") && ALLOWED_IN_TESTS.has(specifier)) {
    return null;
  }
  return `imports ${specifier}`;
}

describe("importsOf", () => {
  test("finds every import form", () => {
    const source = [
      'import { a } from "./a.ts";',
      'import type { B } from "@repo/game-protocol";',
      'export { c } from "../client/c.ts";',
      'import "three";',
      'const d = await import("@repo/game-core");',
      "import {\n  e,\n  f,\n} from './e.ts';",
    ].join("\n");

    expect(importsOf(source)).toEqual([
      "./a.ts",
      "@repo/game-protocol",
      "../client/c.ts",
      "three",
      "@repo/game-core",
      "./e.ts",
    ]);
  });
});

describe("sim boundary", () => {
  test("src/sim imports only the protocol and its own files", async () => {
    const files = await Array.fromAsync(
      new Bun.Glob("**/*.ts").scan({ cwd: SIM_DIR, absolute: true }),
    );
    expect(files.length).toBeGreaterThan(1); // the scan really found the sim

    const problems: string[] = [];
    // This file is skipped: its own examples above contain forbidden imports as strings.
    for (const file of files.filter((f) => f !== import.meta.path)) {
      for (const specifier of importsOf(await Bun.file(file).text())) {
        const problem = violation(file, specifier);
        if (problem) {
          problems.push(`${relative(SIM_DIR, file)} ${problem}`);
        }
      }
    }

    expect(problems).toEqual([]);
  });
});
