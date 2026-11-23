import { describe, expect, test } from "bun:test";
import { dirname, extname, relative, resolve } from "node:path";

/**
 * The sim runs in the browser (prediction) and on the server (M2), so it may only
 * import the protocol and its own files. tsconfig.json here already rejects DOM
 * globals; this test rejects imports, e.g. `three`, `../client` or `@repo/game-core`
 * (DOM input and a requestAnimationFrame loop).
 *
 * Imports are found by Bun's own parser, not a regex: it sees `require()`,
 * `import x = require()`, `export *`, dynamic `import()` and odd formatting, and
 * ignores the same text inside comments and strings. It does not report imports
 * that TypeScript erases (`import type`, or names used only as types): those never
 * reach the server at runtime, so they can't break it.
 */
const ALLOWED_PACKAGES = new Set([
  "@repo/game-protocol",
  // Physics (M1-01): the deterministic build, so client and server agree bit for bit.
  "@dimforge/rapier3d-deterministic-compat",
]);
const ALLOWED_IN_TESTS = new Set(["bun:test", "node:path"]);

const SIM_DIR = import.meta.dir;
const SOURCES = "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}";

const LOADERS: Record<string, "ts" | "tsx" | "js" | "jsx"> = {
  ".ts": "ts",
  ".mts": "ts",
  ".cts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".jsx": "jsx",
};

const transpilers = {
  ts: new Bun.Transpiler({ loader: "ts" }),
  tsx: new Bun.Transpiler({ loader: "tsx" }),
  js: new Bun.Transpiler({ loader: "js" }),
  jsx: new Bun.Transpiler({ loader: "jsx" }),
};

function importsOf(source: string, loader: keyof typeof transpilers = "ts") {
  return transpilers[loader].scanImports(source).map((entry) => entry.path);
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
  if (/\.test\.[cm]?[jt]sx?$/.test(file) && ALLOWED_IN_TESTS.has(specifier)) {
    return null;
  }
  return `imports ${specifier}`;
}

describe("importsOf", () => {
  test.each([
    ["a static import", 'import { a } from "three";'],
    ["a side-effect import", 'import "three";'],
    ["a re-export", 'export { a } from "three";'],
    ["export *", 'export * from "three";'],
    ["no whitespace", 'import{a}from"three";'],
    [
      "a comment with an apostrophe",
      'import {\n  a, // it\'s fine\n} from "three";',
    ],
    ["require()", 'const t = require("three");'],
    ["import = require()", 'import t = require("three");'],
    ["dynamic import()", 'const t = import("three");'],
    ["a template literal", "const t = import(`three`);"],
    ["a comment inside import()", 'const t = import(/* x */ "three");'],
  ])("sees %s", (_, source) => {
    expect(importsOf(source)).toContain("three");
  });

  test("ignores the same text in comments and strings", () => {
    const source = [
      '// don\'t import "three" here',
      "/* import { a } from 'three'; */",
      "export const s = \"import('three')\";",
    ].join("\n");

    expect(importsOf(source)).toEqual([]);
  });
});

describe("sim boundary", () => {
  test("src/sim imports only the protocol and its own files", async () => {
    const files = await Array.fromAsync(
      new Bun.Glob(SOURCES).scan({ cwd: SIM_DIR, absolute: true }),
    );
    expect(files.length).toBeGreaterThan(1); // the scan really found the sim

    const problems: string[] = [];
    for (const file of files) {
      const loader = LOADERS[extname(file)] ?? "ts";
      for (const specifier of importsOf(await Bun.file(file).text(), loader)) {
        const problem = violation(file, specifier);
        if (problem) {
          problems.push(`${relative(SIM_DIR, file)} ${problem}`);
        }
      }
    }

    expect(problems).toEqual([]);
  });
});
