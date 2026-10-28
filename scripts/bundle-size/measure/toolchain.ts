import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Result as R } from "@praha/byethrow";
import { minifySync, build, type Rolldown } from "vite";
import { Val } from "#valof";
import { Imports } from "../bundle.ts";
import { flow, pipe } from "../../shared/pipe/index.ts";
import { defineError, toDefinedError } from "../../shared/util.ts";
import { Build, BuildResult, Sizes, type Mode } from "./index.ts";

export const PackError = defineError("PackError", (output: string) => ({
  message: `vp run build failed\n${output}`,
  output,
}));
export type PackError = ReturnType<typeof PackError>;

export const NoChunkError = defineError("NoChunkError", (mode: Mode) => ({
  message: `no chunk emitted for ${mode}`,
  mode,
}));
export type NoChunkError = ReturnType<typeof NoChunkError>;

export const CompileError = defineError(
  "CompileError",
  (mode: Mode, step: string, cause: unknown) => ({
    message: `${step} failed for ${mode}: ${String(cause)}`,
    cause: toDefinedError(cause),
    mode,
    step,
  }),
);
export type CompileError = ReturnType<typeof CompileError>;

export const MinifyError = defineError("MinifyError", (cause: unknown) => ({
  message: `minify failed: ${String(cause)}`,
  cause: toDefinedError(cause),
}));
export type MinifyError = ReturnType<typeof MinifyError>;

const root = new URL("../../../", import.meta.url);

export function pack(): R.ResultAsync<void, PackError> {
  return R.try({
    try: async () => {
      await promisify(execFile)(
        fileURLToPath(new URL("node_modules/.bin/vp", root)),
        ["run", "build"],
        {
          cwd: fileURLToPath(root),
        },
      );
    },
    catch: (cause) => {
      const { stdout = "", stderr = "" } = cause as { stdout?: string; stderr?: string };
      return PackError(`${stdout}${stderr}` || String(cause));
    },
  });
}

export async function measure(
  imports: Imports,
): R.ResultAsync<BuildResult, NoChunkError | CompileError | MinifyError> {
  const compiled = await R.sequence([
    compile("production", imports),
    compile("development", imports),
  ]);
  if (R.isFailure(compiled)) return compiled;
  const [production, development] = compiled.value;

  const reads = await R.sequence(
    development.modules.map((module) => Module.readsNodeEnv(module, "development")),
  );
  if (R.isFailure(reads)) return reads;

  const builds = R.sequence({
    production: Compiled.measure(production),
    development: Compiled.measure(development),
  });
  if (R.isFailure(builds)) return builds;

  return R.succeed(
    BuildResult.seal({ imports, readsNodeEnv: reads.value.some((read) => read), ...builds.value }),
  );
}

type Code = Val<"Code", string>;
const Code = Val.companion<Code>()
  .impl(({ seal }) => ({
    minify: (code) =>
      R.try({
        try: () => seal(minifySync("bundle.mjs", code).code),
        catch: (cause) => MinifyError(cause),
      }),
    sizes: (code): R.Result<Sizes, MinifyError> =>
      R.map((minified: Code) => {
        const bytes = Buffer.from(minified, "utf8");
        return Sizes.seal({
          minified: bytes.byteLength,
          gzip: gzipSync(bytes, { level: 9 }).byteLength,
          brotli: brotliCompressSync(bytes, {
            params: {
              [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
              [constants.BROTLI_PARAM_SIZE_HINT]: bytes.byteLength,
            },
          }).byteLength,
        });
      })(Code.minify(code)),
  }))
  .build();

type Module = Val<"Module", string>;
const Module = Val.companion<Module>()
  .impl(() => ({
    /** Whether the module's source reads `NODE_ENV`, before `define` replaces it. */
    readsNodeEnv: (module, mode: Mode) =>
      attempt(mode, "reading the library", async () =>
        (await readFile(module, "utf8")).includes("NODE_ENV"),
      ),
  }))
  .build();

type Compiled = Val<"Compiled", { code: Code; modules: Module[]; library: number }>;
const Compiled = Val.companion<Compiled>()
  .impl(() => ({
    measure: (compiled): R.Result<Build, MinifyError> =>
      pipe(
        Code.sizes(compiled.code),
        R.map((sizes) => Build.seal({ sizes, library: compiled.library })),
      ),
  }))
  .build();

async function compile(
  mode: Mode,
  imports: Imports,
): R.ResultAsync<Compiled, NoChunkError | CompileError> {
  const dir = await attempt(mode, "creating the entry directory", () =>
    mkdtemp(join(tmpdir(), "valof-size-")),
  );
  if (R.isFailure(dir)) return dir;

  const built = await compileEntry(mode, imports, join(dir.value, "entry.mjs"));

  // Removed whether or not the build succeeded.
  const removed = await attempt(mode, "removing the entry directory", () =>
    rm(dir.value, { recursive: true, force: true }),
  );
  if (R.isFailure(removed)) return removed;

  return built;
}

async function compileEntry(
  mode: Mode,
  imports: Imports,
  file: string,
): R.ResultAsync<Compiled, NoChunkError | CompileError> {
  const written = await attempt(mode, "writing the entry", () => {
    const content = pipe(
      Object.entries(imports).map(
        ([module, names]) =>
          // `Val.companion` imports `Val` and reads one member, leaving the rest to tree-shaking.
          `import { ${[...new Set(names.map((name) => name.split(".")[0]))].join(", ")} } from ${JSON.stringify(fileURLToPath(new URL(module, root)))};`,
      ),
      (lines) => [...lines, `console.log(${Imports.names(imports).join(", ")});`, ""],
      (lines) => lines.join("\n"),
    );
    return writeFile(file, content);
  });
  if (R.isFailure(written)) return written;

  const found = await flow(
    attempt(
      mode,
      "the build",
      () =>
        build({
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
        }) as Promise<Rolldown.RolldownOutput[]>,
    ),
    R.map((result) => result[0]?.output.find((output) => output.type === "chunk")),
    R.andThen((output) =>
      output?.type === "chunk" ? R.succeed(output) : R.fail(NoChunkError(mode)),
    ),
  );
  if (R.isFailure(found)) return found;
  const chunk = found.value;

  const entry = chunk.facadeModuleId === null ? undefined : chunk.modules[chunk.facadeModuleId];

  return R.succeed(
    Compiled.seal({
      code: Code.seal(chunk.code),
      modules: chunk.moduleIds
        .filter((id) => id !== chunk.facadeModuleId)
        .map((id) => Module.seal(id)),
      // A module's own `renderedLength` counts code that tree-shaking drops, so the library is
      // what the chunk holds beyond its entry.
      library: chunk.code.length - (entry?.renderedLength ?? 0),
    }),
  );
}

/** Runs one step of building a bundle, turning a rejection into a {@link CompileError}. */
function attempt<A>(
  mode: Mode,
  step: string,
  run: () => Promise<A>,
): R.ResultAsync<A, CompileError> {
  return R.try({ try: run, catch: (cause) => CompileError(mode, step, cause) });
}
