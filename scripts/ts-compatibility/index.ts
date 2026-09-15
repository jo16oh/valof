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

const blocks = fixtures();
for (const block of blocks) {
  await writeFile(join(directory, `${block.name.replace(/\.md:/, "-")}.ts`), block.code);
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

console.log(`  ${blocks.length} blocks from the book`);

const failed: string[] = [];

for (const alias of aliases) {
  const released = version(alias);

  try {
    await tsc(alias)(["-p", directory]);
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
