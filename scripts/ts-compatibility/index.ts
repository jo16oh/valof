import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { docBlocks } from "../../docs/tools/twoslash/index.ts";
import { matches, pinned } from "../pin-valof/index.ts";
import { aliases, pack, root, tsc, version } from "../shared/typescript-lines.ts";

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

// Installed the way npm installs it, so `exports` decides what a declaration may reference. A path
// to `dist` would let it reach a module the package does not export.
const installed = join(directory, "node_modules/valof");
await cp(join(root, "dist"), join(installed, "dist"), { recursive: true });
await copyFile(join(root, "package.json"), join(installed, "package.json"));
// A package of its own, or `valof` resolves to this repository by self-reference.
await writeFile(
  join(directory, "package.json"),
  `${JSON.stringify({ private: true, type: "module" })}\n`,
);

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

// Exports the book does not show, kept beside this script.
const extras = join(root, "scripts/ts-compatibility/fixtures");
const files = await readdir(extras);
for (const file of files) await copyFile(join(extras, file), join(directory, `fixture-${file}`));

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

/**
 * The scripts, which are written against the pinned commit, as code a user wrote. They read
 * against this `dist` only when the pin builds the same one; `--require-pin` fails otherwise,
 * which a release PR passes so the scripts catch up before a release.
 *
 * Copied, with a `package.json` that sends `#valof` to the installed package. The copy sits inside
 * the repository, so every other import still reaches its `node_modules`.
 */
const scripts = join(directory, "scripts");
const pin = await pinned();
const current = await matches(pin);
const importers = current ? await valofImporters() : [];
if (current) {
  // Without the tests, which `vp test` would otherwise pick up here too.
  await cp(join(root, "scripts"), scripts, {
    recursive: true,
    filter: (source) => !source.endsWith(".test.ts"),
  });
  await writeFile(
    join(scripts, "package.json"),
    `${JSON.stringify({ private: true, type: "module", imports: { "#valof": "valof" } })}\n`,
  );
  await writeFile(
    join(scripts, "tsconfig.json"),
    `${JSON.stringify(
      {
        extends: join(root, "tsconfig.json"),
        compilerOptions: { noEmit: false, emitDeclarationOnly: true, outDir: "dts" },
        files: importers,
      },
      undefined,
      2,
    )}\n`,
  );
}

console.log(`  ${blocks.length} blocks from the book, ${files.length} fixtures`);
if (current) {
  console.log(`  ${importers.length} scripts on valof ${pin.slice(0, 7)}`);
} else if (process.argv.includes("--require-pin")) {
  console.error(`valof ${pin.slice(0, 7)} builds a different dist; run \`vp run pin-valof HEAD\``);
  process.exit(1);
} else {
  console.log(`  scripts skipped: valof ${pin.slice(0, 7)} builds a different dist`);
}

const failed: string[] = [];

for (const alias of aliases) {
  const released = version(alias);

  try {
    await tsc(alias)(["-p", directory]);
    await tsc(alias)(["-p", join(directory, "tsconfig.declaration.json")]);
    if (current) await tsc(alias)(["-p", scripts]);
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

async function valofImporters(): Promise<string[]> {
  const files = await readdir(join(root, "scripts"), { recursive: true });
  const importers: string[] = [];
  // The tests stay out of the copy, so out of the program as well.
  for (const file of files.filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))) {
    const code = await readFile(join(root, "scripts", file), "utf8");
    if (/^import\b[^;]*from "#valof"/m.test(code)) importers.push(file);
  }
  return importers.sort();
}
