import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";

import { Val, type Dyn } from "#valof";

import { docBlocks } from "../../../../docs/tools/twoslash/index.ts";
import { matches, type MissingPinError, pinned } from "../../../pin-valof/index.ts";
import { output, ROOT, writeJson } from "../../../shared/repository.ts";
import { tsc, version } from "../../../shared/typescript-lines.ts";
import { Check } from "../check.ts";
import { problemLines, Report } from "../report.ts";
import { RoundTrip, SourceExports, type SourceExportsError } from "./round-trip.ts";

const DIRECTORY = join(ROOT, "docs/.generated/ts-compatibility");

const SCRIPTS = join(DIRECTORY, "scripts");

export class StalePinError extends ErrorFactory({
  name: "StalePinError",
  message: ({ pin }) =>
    `valof ${pin.slice(0, 7)} builds a different dist; run \`vp run pin-valof origin/main\``,
  fields: ErrorFactory.fields<{ pin: string }>(),
}) {}

export type CompatError = StalePinError | MissingPinError | SourceExportsError;

/** One TypeScript line's failure messages, empty where it passes. */
export type LineResult = Val<"LineResult", { version: string; failures: string[] }>;
export const LineResult = Val.companion<LineResult>().build();

/** What the compat check found, on every TypeScript line. */
export type CompatReport = Val<
  "CompatReport",
  {
    blocks: number;
    fixtures: number;
    pin: string;
    /** How many scripts were checked, or nothing where the pin builds a different `dist`. */
    scripts?: number;
    lines: LineResult[];
  },
  Report
>;
export const CompatReport = Val.companion<CompatReport>()
  .implTrait(Report, () => ({
    render: (report): string => {
      const { blocks, fixtures, pin, scripts, lines } = report;
      return [
        `  ${blocks} blocks from the book, ${fixtures} fixtures`,
        scripts === undefined
          ? `  scripts skipped: valof ${pin.slice(0, 7)} builds a different dist`
          : `  ${scripts} scripts on valof ${pin.slice(0, 7)}`,
        ...lines.flatMap(({ version, failures }) => [
          `  typescript@${version}  ${failures.length === 0 ? "pass" : "fail"}`,
          ...failures,
        ]),
        ...problemLines(CompatReport.problems(report)),
        "",
      ].join("\n");
    },
    passed: (report): boolean => CompatReport.problems(report).length === 0,
  }))
  .impl(() => ({
    /** A line naming the TypeScript lines that failed. */
    problems: ({ lines }): string[] => {
      const failed = lines
        .filter(({ failures }) => failures.length > 0)
        .map(({ version }) => version);
      return failed.length === 0
        ? []
        : [`the declarations do not typecheck, or change a type, on ${failed.join(", ")}`];
    },
  }))
  .build();

export type CompatCheck = Val<
  "CompatCheck",
  {
    name: string;
    release: boolean;
    /** The TypeScript lines to typecheck on, by their aliases in `node_modules`. */
    lines: string[];
  },
  Check
>;
export const CompatCheck = Val.companion<CompatCheck>()
  .implCreate(({ release, lines }: { release: boolean; lines: string[] }) => ({
    name: "compat",
    release,
    lines,
  }))
  .implTrait(Check, () => ({
    /**
     * Typechecks the book's blocks, the fixtures and the scripts against `dist` on every TypeScript
     * line. Expects `dist` to be built. With `release`, fails unless the commit the scripts pin
     * builds this same `dist`.
     */
    run: async ({ release, lines }): R.ResultAsync<Dyn<Report>, CompatError> => {
      const pinnedTo = await pinned();
      if (R.isFailure(pinnedTo)) return pinnedTo;
      const pin = pinnedTo.value;

      const current = await matches(pin);
      if (!current && release) return R.fail(new StalePinError({ pin }));

      await install();
      const blocks = await writeBlocks();
      const fixtures = await copyFixtures();
      await writeConfigs();
      const importers = current ? await copyScripts() : [];

      /**
       * Each export, compared with the type its declaration gives a consumer. A declaration can lose
       * a type without an error (notes §18.5). The scripts are searched only for `/*elided*\/`,
       * because their declarations expand other packages' aliases, which the comparison counts as a
       * change.
       */
      const read = SourceExports.read(DIRECTORY, [...blocks, ...fixtures]);
      if (R.isFailure(read)) return read;
      const exports = read.value;

      // The TypeScript lines run concurrently, each emitting to directories of its own.
      const results = await Promise.all(
        lines.map(async (alias) =>
          LineResult.seal({
            version: version(alias),
            failures: await typecheck(alias, exports, current),
          }),
        ),
      );

      return R.succeed(
        Report.dyn(
          CompatReport,
          CompatReport.seal({
            blocks: blocks.length,
            fixtures: fixtures.length,
            pin,
            ...(current ? { scripts: importers.length } : {}),
            lines: results,
          }),
        ),
      );
    },
  }))
  .build();

/** Installs `dist` the way npm installs it, so `exports` decides what a declaration may reference. */
async function install(): Promise<void> {
  await rm(DIRECTORY, { recursive: true, force: true });
  await mkdir(DIRECTORY, { recursive: true });

  const installed = join(DIRECTORY, "node_modules/valof");
  await cp(join(ROOT, "dist"), join(installed, "dist"), { recursive: true });
  await copyFile(join(ROOT, "package.json"), join(installed, "package.json"));
  // A package of its own, or `valof` resolves to this repository by self-reference.
  await writeJson(join(DIRECTORY, "package.json"), { private: true, type: "module" });
}

/**
 * The book's blocks, except those that declare `// @errors`. Plain `tsc` cannot check an expected
 * error, and the code a compiler reports changes between TypeScript lines. `vp test` checks those
 * blocks against `src` (docs/tools/twoslash).
 */
function writeBlocks(): Promise<string[]> {
  // A block that imports nothing is a script, and it shares one global scope with every other such
  // block.
  const isolated = (code: string): string =>
    /^\s*(?:import|export)\b/m.test(code) ? code : `${code}\nexport {};\n`;

  // Exported, so the declaration pass emits each inferred type, which is where a name the library
  // never published appears.
  const exported = (code: string): string =>
    code.replaceAll(/^(const|type|function) /gm, "export $1 ");

  return Promise.all(
    docBlocks(join(ROOT, "docs/src"))
      .filter((block) => !block.ignored && !block.code.includes("// @errors:"))
      .map(async (block) => {
        const file = join(DIRECTORY, `${block.name.replace(/\.md:/, "-")}.ts`);
        await writeFile(file, exported(isolated(block.code)));
        return file;
      }),
  );
}

/** Exports the book does not show, kept beside this script. */
async function copyFixtures(): Promise<string[]> {
  const extras = join(ROOT, "scripts/check-dist/check/compat/fixtures");
  return Promise.all(
    (await readdir(extras)).map(async (file) => {
      const copy = join(DIRECTORY, `fixture-${file}`);
      await copyFile(join(extras, file), copy);
      return copy;
    }),
  );
}

/**
 * The blocks' `tsconfig.json`, and a second one that emits their declarations, because an inferred type
 * has to be nameable only in a `.d.ts` (TS4023, TS4094).
 */
async function writeConfigs(): Promise<void> {
  await writeJson(join(DIRECTORY, "tsconfig.json"), {
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
  await writeJson(join(DIRECTORY, "tsconfig.declaration.json"), {
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
 * Copies the scripts, read as code a user wrote against the pinned commit, and sends their
 * `#valof` to the installed package. The copy sits inside the repository, so every other import
 * still reaches its `node_modules`. Returns the scripts that import valof.
 */
async function copyScripts(): Promise<string[]> {
  const importers = await valofImporters();
  // Without the tests, which `vp test` would otherwise pick up here too.
  await cp(join(ROOT, "scripts"), SCRIPTS, {
    recursive: true,
    filter: (source) => !source.endsWith(".test.ts"),
  });
  await writeJson(join(SCRIPTS, "package.json"), {
    private: true,
    type: "module",
    imports: { "#valof": "valof" },
  });
  await writeJson(join(SCRIPTS, "tsconfig.json"), {
    extends: join(ROOT, "tsconfig.json"),
    compilerOptions: { noEmit: false, emitDeclarationOnly: true, outDir: "dts" },
    files: importers,
  });
  return importers;
}

// The failure messages of one TypeScript line, empty where it passes. `current` adds the scripts.
async function typecheck(
  alias: string,
  exports: SourceExports,
  current: boolean,
): Promise<string[]> {
  const run = tsc(alias);
  const dts = join(DIRECTORY, "dts", alias);
  const own = join(SCRIPTS, "dts", alias);
  try {
    await run(["-p", DIRECTORY]);
    await run(["-p", join(DIRECTORY, "tsconfig.declaration.json"), "--outDir", dts]);
    if (current) {
      await run(["-p", SCRIPTS, "--outDir", own]);
    }
    const trip = await RoundTrip.write(exports, dts, join(DIRECTORY, "round-trip", alias));
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
  const files = (await readdir(join(ROOT, "scripts"), { recursive: true })).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );
  const read = await readAll(join(ROOT, "scripts"), files);
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
