import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { docBlocks } from "../../docs/tools/twoslash/index.ts";
import { aliases, pack, root, tsc, version } from "../typescript-lines.ts";

const directory = join(root, "docs/.generated/ts-compatibility");

/**
 * The book's blocks are the fixture: they are the API surface a reader writes, and they are
 * maintained as documentation rather than as a second copy of it.
 *
 * The ones that declare `// @errors` stay out. Which errors a compiler reports, and under which
 * code, moves between lines, and plain `tsc` has nowhere to put the expectation. `vp test` keeps
 * checking those against `src` (docs/tools/twoslash).
 */
function fixtures() {
  return docBlocks(join(root, "docs/src")).filter(
    (block) => !block.ignored && !block.code.includes("// @errors:"),
  );
}

await pack();

await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });

// A block that imports nothing is a script, and its declarations land in a global scope every
// other one shares: two blocks declaring `User` collide. `export {}` gives it a scope of its own
// without changing what is checked.
const isolated = (code: string): string =>
  /^\s*(?:import|export)\b/m.test(code) ? code : `${code}\nexport {};\n`;

// Exported, so the declaration pass below has something to emit. A companion's type is inferred,
// and an inferred type is what reaches for a name the library never published.
const exported = (code: string): string => code.replace(/^(const|type|function) /gm, "export $1 ");

const blocks = fixtures();
for (const block of blocks) {
  const file = join(directory, `${block.name.replace(/\.md:/, "-")}.ts`);
  await writeFile(file, exported(isolated(block.code)));
}

// `paths` without `baseUrl`, which TypeScript 6 removed. They resolve against this file instead.
await writeFile(
  join(directory, "tsconfig.json"),
  `${JSON.stringify(
    {
      compilerOptions: {
        target: "es2022",
        lib: ["es2023"],
        module: "esnext",
        moduleResolution: "bundler",
        strict: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
        types: ["node"],
        noEmit: true,
        skipLibCheck: true,
        paths: {
          // The published declarations, reached the way a consumer reaches them.
          valof: ["../../../dist/index.d.mts"],
          "valof/experimental": ["../../../dist/experimental.d.mts"],
          "valof/eslint-plugin": ["../../../dist/eslint-plugin.d.mts"],
        },
      },
      include: ["*.ts"],
    },
    undefined,
    2,
  )}\n`,
);

/**
 * The same blocks again, emitting declarations. Typechecking alone does not reach this: an
 * inferred type only has to be nameable when it is written to a `.d.ts`, and TS4023 and TS4094
 * are what a consumer sees when it is not. Both have landed here before, on the one line
 * `export const Shape = Enum.companion<Shape>()`.
 */
await writeFile(
  join(directory, "tsconfig.declaration.json"),
  `${JSON.stringify(
    {
      extends: "./tsconfig.json",
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        outDir: "dts",
      },
    },
    undefined,
    2,
  )}\n`,
);

console.log(`  ${blocks.length} blocks from the book`);

const failed: string[] = [];

for (const alias of aliases) {
  const released = version(alias);

  try {
    await tsc(alias)(["-p", directory]);
    await tsc(alias)(["-p", join(directory, "tsconfig.declaration.json")]);
    console.log(`  typescript@${released}  pass`);
  } catch (error) {
    failed.push(released);
    console.log(`  typescript@${released}  fail`);
    console.log(`${(error as { stdout?: string }).stdout ?? String(error)}`);
  }
}

console.log();

if (failed.length > 0) {
  console.error(`the declarations do not typecheck on ${failed.join(", ")}`);
  process.exit(1);
}
