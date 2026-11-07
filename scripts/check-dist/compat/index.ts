import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";
import { Val } from "#valof";

import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { docBlocks } from "../../../docs/tools/twoslash/index.ts";
import { matches, pinned } from "../../pin-valof/index.ts";
import { aliases, root, tsc, version, type Tsc } from "../../shared/typescript-lines.ts";
import { Check } from "../run.ts";
import { roundTrip, type RoundTrip } from "./round-trip.ts";

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

export class StalePinError extends ErrorFactory({
  message: ({ pin }) =>
    `valof ${pin.slice(0, 7)} builds a different dist; run \`vp run pin-valof origin/main\``,
  fields: ErrorFactory.fields<{ pin: string }>(),
}) {}

export class IncompatibleError extends ErrorFactory({
  message: ({ failed }) =>
    `the declarations do not typecheck, or change a type, on ${failed.join(", ")}`,
  fields: ErrorFactory.fields<{ failed: string[] }>(),
}) {}

/**
 * Typechecks the book's blocks, the fixtures and the scripts against `dist` on every TypeScript
 * line. Expects `dist` to be built. With `release`, fails unless the commit the scripts pin builds this
 * same `dist`.
 */
export async function checkCompat({
  release,
}: {
  release: boolean;
}): R.ResultAsync<void, StalePinError | IncompatibleError> {
  const pin = await pinned();
  const current = await matches(pin);
  if (!current && release) return R.fail(new StalePinError({ pin }));

  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });

  // Installed the way npm installs it, so `exports` decides what a declaration may reference. A
  // path to `dist` would let it reach a module the package does not export.
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
  const exported = (code: string): string =>
    code.replace(/^(const|type|function) /gm, "export $1 ");

  const blocks = fixtures();
  const modules: string[] = [];
  for (const block of blocks) {
    const file = join(directory, `${block.name.replace(/\.md:/, "-")}.ts`);
    await writeFile(file, exported(isolated(block.code)));
    modules.push(file);
  }

  // Exports the book does not show, kept beside this script.
  const extras = join(root, "scripts/check-dist/compat/fixtures");
  const files = await readdir(extras);
  for (const file of files) {
    await copyFile(join(extras, file), join(directory, `fixture-${file}`));
    modules.push(join(directory, `fixture-${file}`));
  }

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
   * against this `dist` only when the pin builds the same one; `release` fails otherwise,
   * which a release PR passes so the scripts catch up before a release.
   *
   * Copied, with a `package.json` that sends `#valof` to the installed package. The copy sits
   * inside the repository, so every other import still reaches its `node_modules`.
   */
  const scripts = join(directory, "scripts");
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
  const trip = roundTrip(directory, modules);

  console.log(`  ${blocks.length} blocks from the book, ${files.length} fixtures`);
  console.log(
    current
      ? `  ${importers.length} scripts on valof ${pin.slice(0, 7)}`
      : `  scripts skipped: valof ${pin.slice(0, 7)} builds a different dist`,
  );

  // The TypeScript lines run concurrently, each emitting to directories of its own, and report in
  // the order of `aliases`.
  const reports = await Promise.all(aliases.map(check));
  for (const [i, alias] of aliases.entries()) {
    const report = reports[i]!;
    console.log(`  typescript@${version(alias)}  ${report.length === 0 ? "pass" : "fail"}`);
    for (const line of report) console.log(line);
  }
  const failed = aliases.filter((_, i) => reports[i]!.length > 0).map(version);

  console.log();

  return failed.length === 0 ? R.succeed() : R.fail(new IncompatibleError({ failed }));

  // The failure messages of one TypeScript line, empty where it passes.
  async function check(alias: string): Promise<string[]> {
    const run = tsc(alias);
    const dts = join(directory, "dts", alias);
    const own = join(scripts, "dts", alias);
    try {
      await run(["-p", directory]);
      await run(["-p", join(directory, "tsconfig.declaration.json"), "--outDir", dts]);
      if (current) await run(["-p", scripts, "--outDir", own]);
      const changed = await differs(run, await trip(dts, join(directory, "round-trip", alias)));
      const cut = current ? await elided(own) : [];
      return [
        ...changed.map((name) => `    the declaration changes ${name}`),
        ...(cut.length > 0 ? [`    /*elided*/ in ${cut.join(", ")}`] : []),
      ];
    } catch (error) {
      return [`${(error as { stdout?: string }).stdout ?? String(error)}`];
    }
  }
}

export type CompatCheck = Val<"CompatCheck", { name: string; release: boolean }, Check>;
export const CompatCheck = Val.companion<CompatCheck>()
  .implCreate(({ release }: { release: boolean }) => ({ name: "compat", release }))
  .implTrait(Check, () => ({ run: (check) => checkCompat(check) }))
  .build();

// The exports whose declaration changes their type. It throws on an error outside the
// comparisons, such as a declaration that does not parse.
async function differs(tsc: Tsc, { project, exports }: RoundTrip): Promise<string[]> {
  try {
    await tsc(["-p", project]);
    return [];
  } catch (error) {
    const output = (error as { stdout?: string }).stdout ?? "";
    const lines = [...output.matchAll(/round-trip\/[^/]+\/index\.ts\((\d+),\d+\)/g)].map(
      ([, line]) => exports[line!],
    );
    if (lines.length === 0 || lines.includes(undefined)) throw error;
    return [...new Set(lines as string[])];
  }
}

// The declaration files in which TypeScript truncated a type to `/*elided*/ any`.
async function elided(directory: string): Promise<string[]> {
  const files = await readdir(directory, { recursive: true });
  const cut: string[] = [];
  for (const file of files.filter((file) => file.endsWith(".d.ts"))) {
    if ((await readFile(join(directory, file), "utf8")).includes("/*elided*/")) cut.push(file);
  }
  return cut.sort();
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
