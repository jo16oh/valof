import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createTwoslasher } from "twoslash/core";
// The compiler API the repository builds with is the native port, which does not expose one, so
// Twoslash gets its own. `vp run ts-compatibility` is what covers the newer lines. The root
// `tsconfig.json` aims the `typescript` that Twoslash's own declarations import here as well.
import * as ts from "typescript-5";

import { codeBlocks, isTypeScript } from "../markdown-code/index.ts";

// No trailing separator: Twoslash appends one to build its virtual paths, and the doubled
// separator stops a diagnostic matching the file it came from, which passes every block.
const root = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");

// `@typescript/vfs` takes the lib files from whichever `typescript` it resolves for itself, and
// that is the native port, which ships no `lib.*.d.ts`. Point it at the one Twoslash runs on.
const libDirectory = dirname(fileURLToPath(import.meta.resolve("typescript-5")));

/** A block the fence marked ```ts,ignore. Kept, so the test output says it was left out. */
export const ignore = "ignore";

export type DocBlock = {
  /** `caveats.md:18`, which is the test's name. */
  name: string;
  code: string;
  ignored: boolean;
};

const twoslasher = createTwoslasher({
  tsModule: ts,
  tsLibDirectory: libDirectory,
  vfsRoot: root,
  compilerOptions: {
    // The strictness of the root `tsconfig.json`. A block that only typechecks under looser
    // settings is wrong for a reader who copied the repository's own configuration.
    strict: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    lib: ["lib.es2023.d.ts"],
    types: ["node"],
    // `src` imports its siblings with the extension, and the book writes the package name.
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    allowImportingTsExtensions: true,
    noEmit: true,
    // Every subpath the book imports. Without them the checkout's own `package.json` answers,
    // which resolves through `dist`, and that is built here but not in a fresh clone.
    paths: {
      valof: [join(root, "src/index.ts")],
      "valof/experimental": [join(root, "src/experimental.ts")],
      "valof/lint": [join(root, "src/lint/index.ts")],
      "valof/eslint-plugin": [join(root, "src/lint/eslint-plugin.ts")],
    },
  },
});

/** Throws for an error the block did not declare with `// @errors`, or a declared one that stopped. */
export function checkBlock(code: string): void {
  const result = twoslasher(code, "ts");

  // Twoslash itself validates one direction: it throws for an undeclared error, and says nothing
  // when a declared one stops happening. The book's "type error" lines have to stay true.
  const raised = new Set(result.errors.map((error) => error.code));
  const missing = result.meta.handbookOptions.errors.filter((code) => !raised.has(code));

  if (missing.length > 0) {
    throw new Error(`declared as errors, but nothing went wrong: ${missing.join(" ")}`);
  }
}

export function docBlocks(directory: string): DocBlock[] {
  const blocks: DocBlock[] = [];

  for (const file of readdirSync(directory).sort()) {
    if (!file.endsWith(".md")) {
      continue;
    }

    blocks.push(...markdownBlocks(readFileSync(join(directory, file), "utf8"), file));
  }

  return blocks;
}

/** TypeScript fences from one Markdown document, named for a test report. */
export function markdownBlocks(markdown: string, name: string): DocBlock[] {
  return codeBlocks(markdown)
    .filter((block) => isTypeScript(block.language))
    .map((block) => ({
      name: `${name}:${block.line}`,
      code: block.value,
      ignored: block.attributes.includes(ignore),
    }));
}
