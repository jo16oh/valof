import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";
import { Val } from "#valof";

import { docBlocks } from "../../../docs/tools/twoslash/index.ts";
import { matches, pinned } from "../../pin-valof/index.ts";
import { output, root, writeJson } from "../../shared/repository.ts";
import { aliases, tsc, version } from "../../shared/typescript-lines.ts";
import { Check } from "../run.ts";
import { RoundTrip, SourceExports } from "./round-trip.ts";

const directory = join(root, "docs/.generated/ts-compatibility");
const scripts = join(directory, "scripts");

export class StalePinError extends ErrorFactory({
  name: "StalePinError",
  message: ({ pin }) =>
    `valof ${pin.slice(0, 7)} builds a different dist; run \`vp run pin-valof origin/main\``,
  fields: ErrorFactory.fields<{ pin: string }>(),
}) {}

export class IncompatibleError extends ErrorFactory({
  name: "IncompatibleError",
  message: ({ failed }) =>
    `the declarations do not typecheck, or change a type, on ${failed.join(", ")}`,
  fields: ErrorFactory.fields<{ failed: string[] }>(),
}) {}

export type CompatError = StalePinError | IncompatibleError;

/**
 * Typechecks the book's blocks, the fixtures and the scripts against `dist` on every TypeScript
 * line. Expects `dist` to be built. With `release`, fails unless the commit the scripts pin builds
 * this same `dist`.
 */
export async function checkCompat({
  release,
}: {
  release: boolean;
}): R.ResultAsync<void, CompatError> {
  const pin = await pinned();
  const current = await matches(pin);
  if (!current && release) return R.fail(new StalePinError({ pin }));

  await install();
  const blocks = await writeBlocks();
  const fixtures = await copyFixtures();
  await writeConfigs();
  const importers = current ? await copyScripts() : [];

  /**
   * Each export of the book's blocks and the fixtures, compared with the type its declaration
   * gives a consumer. A declaration can lose a type without an error. Up to 7.0, TypeScript
   * truncates a type nested beyond the printer's depth limit to `/*elided*\/ any` (7.1 reports
   * TS7056 instead, microsoft/TypeScript#64461).
   *
   * The scripts are only searched for `/*elided*\/`. TypeScript expands the aliases of other
   * packages in their declarations, such as the base class of `ErrorFactory`, and the comparison
   * counts that as a change.
   */
  const exports = SourceExports.read(directory, [...blocks, ...fixtures]);

  console.log(`  ${blocks.length} blocks from the book, ${fixtures.length} fixtures`);
  console.log(
    current
      ? `  ${importers.length} scripts on valof ${pin.slice(0, 7)}`
      : `  scripts skipped: valof ${pin.slice(0, 7)} builds a different dist`,
  );

  // The TypeScript lines run concurrently, each emitting to directories of its own, and report in
  // the order of `aliases`.
  const reports = await Promise.all(aliases.map((alias) => check(alias, exports, current)));
  for (const [i, alias] of aliases.entries()) {
    const report = reports[i]!;
    console.log(`  typescript@${version(alias)}  ${report.length === 0 ? "pass" : "fail"}`);
    for (const line of report) console.log(line);
  }
  const failed = aliases.filter((_, i) => reports[i]!.length > 0).map(version);
  console.log();

  return failed.length === 0 ? R.succeed() : R.fail(new IncompatibleError({ failed }));
}

export type CompatCheck = Val<"CompatCheck", { name: string; release: boolean }, Check>;
export const CompatCheck = Val.companion<CompatCheck>()
  .implCreate(({ release }: { release: boolean }) => ({ name: "compat", release }))
  .implTrait(Check, () => ({ run: (check) => checkCompat(check) }))
  .build();

/**
 * Installs `dist` the way npm installs it, so `exports` decides what a declaration may reference.
 * A path to `dist` would let it reach a module the package does not export.
 */
async function install(): Promise<void> {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });

  const installed = join(directory, "node_modules/valof");
  await cp(join(root, "dist"), join(installed, "dist"), { recursive: true });
  await copyFile(join(root, "package.json"), join(installed, "package.json"));
  // A package of its own, or `valof` resolves to this repository by self-reference.
  await writeJson(join(directory, "package.json"), { private: true, type: "module" });
}

/**
 * The book's blocks are the fixture: they are the API surface a reader writes, and they are
 * maintained as documentation rather than as a second copy of it.
 *
 * The ones that declare `// @errors` stay out. Which errors a compiler reports, and under which
 * code, moves between lines, and plain `tsc` has nowhere to put the expectation. `vp test` keeps
 * checking those against `src` (docs/tools/twoslash).
 */
function writeBlocks(): Promise<string[]> {
  // A block that imports nothing is a script, and its declarations land in a global scope every
  // other one shares: two blocks declaring `User` collide. `export {}` gives it a scope of its own
  // without changing what is checked.
  const isolated = (code: string): string =>
    /^\s*(?:import|export)\b/m.test(code) ? code : `${code}\nexport {};\n`;

  // Exported, so the declaration pass has something to emit. A companion's type is inferred, and
  // an inferred type is what reaches for a name the library never published.
  const exported = (code: string): string =>
    code.replaceAll(/^(const|type|function) /gm, "export $1 ");

  return Promise.all(
    docBlocks(join(root, "docs/src"))
      .filter((block) => !block.ignored && !block.code.includes("// @errors:"))
      .map(async (block) => {
        const file = join(directory, `${block.name.replace(/\.md:/, "-")}.ts`);
        await writeFile(file, exported(isolated(block.code)));
        return file;
      }),
  );
}

/** Exports the book does not show, kept beside this script. */
async function copyFixtures(): Promise<string[]> {
  const extras = join(root, "scripts/check-dist/compat/fixtures");
  return Promise.all(
    (await readdir(extras)).map(async (file) => {
      const copy = join(directory, `fixture-${file}`);
      await copyFile(join(extras, file), copy);
      return copy;
    }),
  );
}

/**
 * The blocks' `tsconfig.json`, and a second one that emits their declarations. Typechecking alone
 * does not reach this: an inferred type only has to be nameable when it is written to a `.d.ts`,
 * and TS4023 and TS4094 are what a consumer sees when it is not. Both have landed here before, on
 * the one line `export const Shape = Enum.companion<Shape>()`.
 */
async function writeConfigs(): Promise<void> {
  await writeJson(join(directory, "tsconfig.json"), {
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
  });
  await writeJson(join(directory, "tsconfig.declaration.json"), {
    extends: "./tsconfig.json",
    compilerOptions: {
      noEmit: false,
      declaration: true,
      emitDeclarationOnly: true,
      outDir: "dts",
    },
  });
}

/**
 * The scripts, which are written against the pinned commit, as code a user wrote. They read
 * against this `dist` only when the pin builds the same one; `release` fails otherwise, which a
 * release PR passes so the scripts catch up before a release.
 *
 * Copied, with a `package.json` that sends `#valof` to the installed package. The copy sits
 * inside the repository, so every other import still reaches its `node_modules`. Returns the
 * scripts that import valof.
 */
async function copyScripts(): Promise<string[]> {
  const importers = await valofImporters();
  // Without the tests, which `vp test` would otherwise pick up here too.
  await cp(join(root, "scripts"), scripts, {
    recursive: true,
    filter: (source) => !source.endsWith(".test.ts"),
  });
  await writeJson(join(scripts, "package.json"), {
    private: true,
    type: "module",
    imports: { "#valof": "valof" },
  });
  await writeJson(join(scripts, "tsconfig.json"), {
    extends: join(root, "tsconfig.json"),
    compilerOptions: { noEmit: false, emitDeclarationOnly: true, outDir: "dts" },
    files: importers,
  });
  return importers;
}

// The failure messages of one TypeScript line, empty where it passes. `current` adds the scripts.
async function check(alias: string, exports: SourceExports, current: boolean): Promise<string[]> {
  const run = tsc(alias);
  const dts = join(directory, "dts", alias);
  const own = join(scripts, "dts", alias);
  try {
    await run(["-p", directory]);
    await run(["-p", join(directory, "tsconfig.declaration.json"), "--outDir", dts]);
    if (current) await run(["-p", scripts, "--outDir", own]);
    const trip = await RoundTrip.write(exports, dts, join(directory, "round-trip", alias));
    const changed = await RoundTrip.differs(trip, run);
    const cut = current ? await elided(own) : [];
    return [
      ...changed.map((name) => `    the declaration changes ${name}`),
      ...(cut.length > 0 ? [`    /*elided*/ in ${cut.join(", ")}`] : []),
    ];
  } catch (error) {
    return [output(error)];
  }
}

// The declaration files in which TypeScript truncated a type to `/*elided*/ any`.
async function elided(directory: string): Promise<string[]> {
  const files = (await readdir(directory, { recursive: true })).filter((file) =>
    file.endsWith(".d.ts"),
  );
  const read = await readAll(directory, files);
  return read
    .filter(({ text }) => text.includes("/*elided*/"))
    .map(({ file }) => file)
    .sort();
}

async function valofImporters(): Promise<string[]> {
  // The tests stay out of the copy, so out of the program as well.
  const files = (await readdir(join(root, "scripts"), { recursive: true })).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );
  const read = await readAll(join(root, "scripts"), files);
  return read
    .filter(({ text }) => /^import\b[^;]*from "#valof"/m.test(text))
    .map(({ file }) => file)
    .sort();
}

function readAll(directory: string, files: string[]): Promise<{ file: string; text: string }[]> {
  return Promise.all(
    files.map(async (file) => ({ file, text: await readFile(join(directory, file), "utf8") })),
  );
}
