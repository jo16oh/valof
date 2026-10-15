import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Result as R, TaggedError } from "better-result";
import { minifySync, build, type Rolldown } from "vite";
import { Val } from "../../src/index.ts";
import { Imports, type Bundle } from "./bundle.ts";

const root = new URL("../../", import.meta.url);

export type Mode = "production" | "development";
export const modes: readonly Mode[] = ["production", "development"];

export type Sizes = Val<"Sizes", { minified: number; gzip: number; brotli: number }>;
export const Sizes = Val.sealer<Sizes>();

export type Measured = {
  imports: Imports;
  code: Record<Mode, string>;
  sizes: Record<Mode, Sizes>;
};

/** A bundle, measured with the base under it unless it joins the base. */
export type MeasuredBundle = Measured & {
  bundle: Bundle;
  /** The bytes the budget caps: a base bundle's whole size, or what another adds to the base. */
  capped: number;
};

export class PackFailed extends TaggedError("PackFailed")<{ message: string }> {}

export class NoChunk extends TaggedError("NoChunk")<{ mode: Mode; message: string }> {}

export class DevelopmentCodeRemains extends TaggedError("DevelopmentCodeRemains")<{
  imports: Imports;
  message: string;
}> {}

export class EqualsRemains extends TaggedError("EqualsRemains")<{
  imports: Imports;
  message: string;
}> {}

/** Builds `dist`, so the bundles import what a user installs. */
export const pack = (): Promise<R<void, PackFailed>> =>
  R.tryPromise({
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

const attempt = <T>(mode: Mode, step: string, run: () => Promise<T>) =>
  R.tryPromise({
    try: run,
    catch: (cause) =>
      new CompileFailed({ mode, cause, message: `${step} failed for ${mode}: ${String(cause)}` }),
  });

const minify = (code: string): R<string, MinifyFailed> =>
  R.try({
    try: () => minifySync("bundle.mjs", code).code,
    catch: (cause) => new MinifyFailed({ cause, message: `minify failed: ${String(cause)}` }),
  });

const compile = (mode: Mode, imports: Imports): Promise<R<string, NoChunk | CompileFailed>> =>
  R.gen(async function* () {
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
      return chunk?.type === "chunk"
        ? R.ok(chunk.code)
        : R.err(new NoChunk({ mode, message: `no chunk emitted for ${mode}` }));
    });
    // Removed whether or not the build succeeded.
    yield* R.await(
      attempt(mode, "removing the entry directory", () =>
        rm(dir, { recursive: true, force: true }),
      ),
    );
    return built;
  });

const sizes = (code: string): R<Sizes, MinifyFailed> =>
  minify(code).map((minified) => {
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

export const measure = (
  imports: Imports,
): Promise<R<Measured, NoChunk | CompileFailed | MinifyFailed>> =>
  R.gen(async function* () {
    const [production, development] = yield* R.await(
      R.allAsync([compile("production", imports), compile("development", imports)] as const),
    );
    return R.ok({
      imports,
      code: { production, development },
      sizes: { production: yield* sizes(production), development: yield* sizes(development) },
    });
  });

/** Adds the bytes its budget caps, which {@link MeasuredBundle.capped} describes. */
export const cap = (measured: Measured & { bundle: Bundle }, base: Measured): MeasuredBundle => ({
  ...measured,
  capped: measured.bundle.base
    ? measured.sizes.production.gzip
    : measured.sizes.production.gzip - base.sizes.production.gzip,
});

/** Fails when a production bundle keeps code that only development or another import needs. */
export function checkProduction({
  imports,
  code,
}: Measured): R<void, DevelopmentCodeRemains | EqualsRemains | MinifyFailed> {
  const minified = minify(code.production);
  if (minified.isErr()) return minified;
  const production = minified.value;
  const heading = `import { ${Imports.names(imports).join(", ")} }`;
  if (
    production.includes("snapshotSealInput") ||
    production.includes("unsnapshotable seal input") ||
    production.includes("The payload changed while the custom seal was running.")
  ) {
    return R.err(
      new DevelopmentCodeRemains({
        imports,
        message: `development-only seal stability checks remain in production: ${heading}`,
      }),
    );
  }
  if (!Imports.names(imports).includes("equals") && production.includes("Number.isNaN")) {
    return R.err(
      new EqualsRemains({
        imports,
        message: `equals remains in production without its import: ${heading}`,
      }),
    );
  }
  return R.ok(undefined);
}
