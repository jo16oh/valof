import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Result as R, TaggedError } from "better-result";
import { minifySync, build, type Rolldown } from "vite";
import { Imports } from "../bundle.ts";
import { Build, Measured, Sizes, type Mode } from "./index.ts";

export class PackFailed extends TaggedError("PackFailed")<{ message: string }> {}

export class NoChunk extends TaggedError("NoChunk")<{ mode: Mode; message: string }> {}

export class CompileFailed extends TaggedError("CompileFailed")<{
  mode: Mode;
  step: string;
  cause: unknown;
  message: string;
}> {
  constructor({ mode, step, cause }: { mode: Mode; step: string; cause: unknown }) {
    super({ mode, step, cause, message: `${step} failed for ${mode}: ${String(cause)}` });
  }
}

export class MinifyFailed extends TaggedError("MinifyFailed")<{
  cause: unknown;
  message: string;
}> {
  constructor({ cause }: { cause: unknown }) {
    super({ cause, message: `minify failed: ${String(cause)}` });
  }
}

const root = new URL("../../../", import.meta.url);

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
        readsNodeEnv: yield* R.await(readsNodeEnv(development.modules, "development")),
        production: Build({
          sizes: yield* sizes(production.code),
          library: production.library,
        }),
        development: Build({
          sizes: yield* sizes(development.code),
          library: development.library,
        }),
      }),
    );
  });
}

function minify(code: string): R<string, MinifyFailed> {
  return R.try({
    try: () => minifySync("bundle.mjs", code).code,
    catch: (cause) => new MinifyFailed({ cause }),
  });
}

type Compiled = { code: string; modules: string[]; library: number };

function compile(mode: Mode, imports: Imports): Promise<R<Compiled, NoChunk | CompileFailed>> {
  return R.gen(async function* () {
    const dir = yield* R.await(
      R.tryPromise({
        try: () => mkdtemp(join(tmpdir(), "valof-size-")),
        catch: (cause) => new CompileFailed({ mode, step: "creating the entry directory", cause }),
      }),
    );
    const file = join(dir, "entry.mjs");
    const lines = Object.entries(imports).map(
      ([module, names]) =>
        `import { ${names.join(", ")} } from ${JSON.stringify(fileURLToPath(new URL(module, root)))};`,
    );
    const built = await R.gen(async function* () {
      yield* R.await(
        R.tryPromise({
          try: () =>
            writeFile(
              file,
              `${lines.join("\n")}\nconsole.log(${Imports.names(imports).join(", ")});\n`,
            ),
          catch: (cause) => new CompileFailed({ mode, step: "writing the entry", cause }),
        }),
      );
      const result = yield* R.await(
        R.tryPromise({
          try: async () =>
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
          catch: (cause) => new CompileFailed({ mode, step: "the build", cause }),
        }),
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
      R.tryPromise({
        try: () => rm(dir, { recursive: true, force: true }),
        catch: (cause) => new CompileFailed({ mode, step: "removing the entry directory", cause }),
      }),
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
function readsNodeEnv(modules: readonly string[], mode: Mode): Promise<R<boolean, CompileFailed>> {
  return R.tryPromise({
    try: async () => {
      const sources = await Promise.all(modules.map((module) => readFile(module, "utf8")));
      return sources.some((source) => source.includes("NODE_ENV"));
    },
    catch: (cause) => new CompileFailed({ mode, step: "reading the library", cause }),
  });
}
