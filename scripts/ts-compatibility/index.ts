import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { docBlocks } from "../../docs/tools/twoslash/index.ts";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = join(root, "docs/.generated/ts-compatibility");

/**
 * The floor the README claims, the line above it, and the current one, each installed under an
 * alias. Read from `node_modules`, so a new major enters this check when someone adds its alias.
 *
 * A line's last release is where its semantics settled, and supporting one from there avoids the
 * edge cases of the versions in between (notes §10.1).
 */
const aliases = ["typescript-5", "typescript-6", "typescript"];

function version(alias: string): string {
  const manifest = join(root, "node_modules", alias, "package.json");
  return (JSON.parse(readFileSync(manifest, "utf8")) as { version: string }).version;
}

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

await run(join(root, "node_modules/.bin/vp"), ["pack"], { cwd: root });

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
    await run(join(root, "node_modules", alias, "bin/tsc"), ["-p", directory], { cwd: root });
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
