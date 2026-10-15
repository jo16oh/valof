import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Result as R, TaggedError } from "better-result";
import { minifySync, build, type Rolldown } from "vite";
import { Val } from "../../src/index.ts";
import { Imports, type Bundle } from "./bundle.ts";

export class PackFailed extends TaggedError("PackFailed")<{ message: string }> {}

export class NoChunk extends TaggedError("NoChunk")<{ mode: Mode; message: string }> {}

/** Something a bundle's compiling step could not do: the temporary file, or the build itself. */
export class CompileFailed extends TaggedError("CompileFailed")<{
  mode: Mode;
  cause: unknown;
  message: string;
}> {}

export class MinifyFailed extends TaggedError("MinifyFailed")<{
  cause: unknown;
  message: string;
}> {}

export class BranchIgnored extends TaggedError("BranchIgnored")<{
  imports: Imports;
  message: string;
}> {}

export class AddsNothing extends TaggedError("AddsNothing")<{ bundle: Bundle; message: string }> {}

export type Mode = "production" | "development";
export const modes: readonly Mode[] = ["production", "development"];

export type Sizes = Val<"Sizes", { minified: number; gzip: number; brotli: number }>;
export const Sizes = Val.sealer<Sizes>();

/** One mode's build of a bundle: its code, and what it weighs. */
export type Build = Val<
  "Build",
  {
    code: string;
    sizes: Sizes;
    /** The code's length, leaving out the entry that imports the library. */
    library: number;
  }
>;
export const Build = Val.sealer<Build>();

/** What a set of imports weighs, built in each mode. */
export type Measured = Val<
  "Measured",
  {
    imports: Imports;
    /** Whether the bundled library branches on `NODE_ENV`. */
    branches: boolean;
    production: Build;
    development: Build;
  }
>;
export const Measured = Val.sealer<Measured>().impl({
  /**
   * Fails when the library branches on `NODE_ENV`, yet both builds weigh the same: production
   * keeps the code only development needs.
   */
  check: (measured): R<void, BranchIgnored> =>
    measured.branches && measured.production.sizes.minified === measured.development.sizes.minified
      ? R.err(
          new BranchIgnored({
            imports: measured.imports,
            message: `production keeps the development branches: import { ${Imports.names(measured.imports).join(", ")} }`,
          }),
        )
      : R.ok(undefined),
});

/** A bundle, measured with the base under it unless it joins the base. */
export type MeasuredBundle = Val<
  "MeasuredBundle",
  {
    bundle: Bundle;
    measured: Measured;
    /** The bytes the budget caps: a base bundle's whole size, or what another adds to the base. */
    capped: number;
  }
>;
export const MeasuredBundle = Val.companion<MeasuredBundle>()
  .implCreate((bundle: Bundle, measured: Measured, base: Measured) => ({
    bundle,
    measured,
    capped: bundle.base
      ? measured.production.sizes.gzip
      : measured.production.sizes.gzip - base.production.sizes.gzip,
  }))
  .impl({
    over: (result): boolean => result.capped > result.bundle.budget,
    /**
     * Fails when a bundle on top of the base adds no library code to it: what it imports is in the
     * base already.
     */
    check: (result, base: Measured): R<void, AddsNothing> =>
      !result.bundle.base && result.measured.production.library === base.production.library
        ? R.err(
            new AddsNothing({
              bundle: result.bundle,
              message: `${result.bundle.name} adds nothing to the base, which already holds it`,
            }),
          )
        : R.ok(undefined),
  });

const root = new URL("../../", import.meta.url);

/** Builds `dist`, so the bundles import what a user installs. */
export function pack(): Promise<R<void, PackFailed>> {
  return R.tryPromise({
    try: async () => {
      await promisify(execFile)(fileURLToPath(new URL("node_modules/.bin/vp", root)), ["pack"], {
        cwd: fileURLToPath(root),
      });
    },
    catch: (cause) => {
      const { stdout = "", stderr = "" } = cause as { stdout?: string; stderr?: string };
      const output = `${stdout}${stderr}` || String(cause);
      return new PackFailed({ message: `vp pack failed\n${output}` });
    },
  });
}

function attempt<T>(mode: Mode, step: string, run: () => Promise<T>): Promise<R<T, CompileFailed>> {
  return R.tryPromise({
    try: run,
    catch: (cause) =>
      new CompileFailed({ mode, cause, message: `${step} failed for ${mode}: ${String(cause)}` }),
  });
}

function minify(code: string): R<string, MinifyFailed> {
  return R.try({
    try: () => minifySync("bundle.mjs", code).code,
    catch: (cause) => new MinifyFailed({ cause, message: `minify failed: ${String(cause)}` }),
  });
}

/** A bundle's code, its library modules, and the code's length without the entry. */
type Compiled = { code: string; modules: string[]; library: number };

function compile(mode: Mode, imports: Imports): Promise<R<Compiled, NoChunk | CompileFailed>> {
  return R.gen(async function* () {
    const dir = yield* R.await(
      attempt(mode, "creating the entry directory", () => mkdtemp(join(tmpdir(), "valof-size-"))),
    );
    const file = join(dir, "entry.mjs");
    const lines = Object.entries(imports).map(
      ([module, names]) =>
        `import { ${names.join(", ")} } from ${JSON.stringify(fileURLToPath(new URL(module, root)))};`,
    );
    const built = await R.gen(async function* () {
      yield* R.await(
        attempt(mode, "writing the entry", () =>
          writeFile(
            file,
            `${lines.join("\n")}\nconsole.log(${Imports.names(imports).join(", ")});\n`,
          ),
        ),
      );
      const result = yield* R.await(
        attempt(
          mode,
          "the build",
          async () =>
            (await build({
              root: fileURLToPath(root),
              logLevel: "silent",
              configFile: false,
              define: { "process.env.NODE_ENV": JSON.stringify(mode) },
              build: {
                write: false,
                minify: false,
                target: "esnext",
                lib: { entry: file, formats: ["es"], fileName: "entry" },
              },
            })) as Rolldown.RolldownOutput[],
        ),
      );
      const chunk = result[0]?.output.find((output) => output.type === "chunk");
      if (chunk?.type !== "chunk") {
        return R.err(new NoChunk({ mode, message: `no chunk emitted for ${mode}` }));
      }
      const entry = chunk.facadeModuleId === null ? undefined : chunk.modules[chunk.facadeModuleId];
      return R.ok({
        code: chunk.code,
        modules: chunk.moduleIds.filter((id) => id !== chunk.facadeModuleId),
        // A module's own `renderedLength` counts code that tree-shaking drops, so the library is
        // what the chunk holds beyond its entry.
        library: chunk.code.length - (entry?.renderedLength ?? 0),
      });
    });
    // Removed whether or not the build succeeded.
    yield* R.await(
      attempt(mode, "removing the entry directory", () =>
        rm(dir, { recursive: true, force: true }),
      ),
    );
    return built;
  });
}

function sizes(code: string): R<Sizes, MinifyFailed> {
  return minify(code).map((minified) => {
    const bytes = Buffer.from(minified, "utf8");
    return Sizes({
      minified: bytes.byteLength,
      gzip: gzipSync(bytes, { level: 9 }).byteLength,
      brotli: brotliCompressSync(bytes, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
          [constants.BROTLI_PARAM_SIZE_HINT]: bytes.byteLength,
        },
      }).byteLength,
    });
  });
}

/** Whether a module's source reads `NODE_ENV`, before `define` replaces it. */
function branches(modules: readonly string[], mode: Mode): Promise<R<boolean, CompileFailed>> {
  return attempt(mode, "reading the library", async () => {
    const sources = await Promise.all(modules.map((module) => readFile(module, "utf8")));
    return sources.some((source) => source.includes("NODE_ENV"));
  });
}

export function measure(
  imports: Imports,
): Promise<R<Measured, NoChunk | CompileFailed | MinifyFailed>> {
  return R.gen(async function* () {
    const [production, development] = yield* R.await(
      R.allAsync([compile("production", imports), compile("development", imports)] as const),
    );
    return R.ok(
      Measured({
        imports,
        branches: yield* R.await(branches(development.modules, "development")),
        production: Build({
          code: production.code,
          sizes: yield* sizes(production.code),
          library: production.library,
        }),
        development: Build({
          code: development.code,
          sizes: yield* sizes(development.code),
          library: development.library,
        }),
      }),
    );
  });
}
