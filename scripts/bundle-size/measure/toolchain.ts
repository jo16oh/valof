import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Result as R, TaggedError } from "better-result";
import { minifySync, build, type Rolldown } from "vite";
import { Val } from "../../../src/index.ts";
import { Imports } from "../bundle.ts";
import { flow, pipe } from "../util/pipe/index.ts";
import { GenAwait } from "../util/util.ts";
import { Build, BuildResult, Sizes, type Mode } from "./index.ts";

export class PackError extends TaggedError("PackError")<{ output: string; message: string }> {
  constructor({ output }: { output: string }) {
    super({ output, message: `vp pack failed\n${output}` });
  }
}

export class NoChunkError extends TaggedError("NoChunkError")<{ mode: Mode; message: string }> {
  constructor({ mode }: { mode: Mode }) {
    super({ mode, message: `no chunk emitted for ${mode}` });
  }
}

export class CompileError extends TaggedError("CompileError")<{
  mode: Mode;
  step: string;
  cause: unknown;
  message: string;
}> {
  constructor({ mode, step, cause }: { mode: Mode; step: string; cause: unknown }) {
    super({ mode, step, cause, message: `${step} failed for ${mode}: ${String(cause)}` });
  }
}

export class MinifyError extends TaggedError("MinifyError")<{
  cause: unknown;
  message: string;
}> {
  constructor({ cause }: { cause: unknown }) {
    super({ cause, message: `minify failed: ${String(cause)}` });
  }
}

const root = new URL("../../../", import.meta.url);

export function pack(): Promise<R<void, PackError>> {
  return R.tryPromise({
    try: async () => {
      await promisify(execFile)(fileURLToPath(new URL("node_modules/.bin/vp", root)), ["pack"], {
        cwd: fileURLToPath(root),
      });
    },
    catch: (cause) => {
      const { stdout = "", stderr = "" } = cause as { stdout?: string; stderr?: string };
      return new PackError({ output: `${stdout}${stderr}` || String(cause) });
    },
  });
}

export function measure(
  imports: Imports,
): Promise<R<BuildResult, NoChunkError | CompileError | MinifyError>> {
  return R.gen(async function* () {
    const [production, development] = yield* flow(
      [compile("production", imports), compile("development", imports)] as const,
      R.allAsync,
      GenAwait,
    );

    const readsNodeEnv = yield* flow(
      development.modules.map((module) => Module.readsNodeEnv(module, "development")),
      R.allAsync,
      R.map((reads) => reads.some((read) => read)),
      GenAwait,
    );

    return R.ok(
      BuildResult({
        imports,
        readsNodeEnv,
        production: Build({
          sizes: yield* Code.sizes(production.code),
          library: production.library,
        }),
        development: Build({
          sizes: yield* Code.sizes(development.code),
          library: development.library,
        }),
      }),
    );
  });
}

type Code = Val<"Code", string>;
const Code = Val.sealer<Code>().impl({
  minify: (code): R<Code, MinifyError> =>
    R.try({
      try: () => Code(minifySync("bundle.mjs", code).code),
      catch: (cause) => new MinifyError({ cause }),
    }),
  sizes: (code): R<Sizes, MinifyError> =>
    Code.minify(code).map((minified) => {
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
    }),
});

type Module = Val<"Module", string>;
const Module = Val.sealer<Module>().impl({
  /** Whether the module's source reads `NODE_ENV`, before `define` replaces it. */
  readsNodeEnv: (module, mode: Mode): Promise<R<boolean, CompileError>> =>
    R.tryPromise({
      try: async () => (await readFile(module, "utf8")).includes("NODE_ENV"),
      catch: (cause) => new CompileError({ mode, step: "reading the library", cause }),
    }),
});

type Compiled = Val<"Compiled", { code: Code; modules: Module[]; library: number }>;
const Compiled = Val.sealer<Compiled>();

function compile(mode: Mode, imports: Imports): Promise<R<Compiled, NoChunkError | CompileError>> {
  return R.gen(async function* () {
    const dir = yield* R.await(
      R.tryPromise({
        try: () => mkdtemp(join(tmpdir(), "valof-size-")),
        catch: (cause) => new CompileError({ mode, step: "creating the entry directory", cause }),
      }),
    );

    const file = join(dir, "entry.mjs");

    const built = await R.gen(async function* () {
      yield* R.await(
        R.tryPromise({
          try: () => {
            const content = pipe(
              Object.entries(imports).map(
                ([module, names]) =>
                  `import { ${names.join(", ")} } from ${JSON.stringify(fileURLToPath(new URL(module, root)))};`,
              ),
              (lines) => [...lines, `console.log(${Imports.names(imports).join(", ")});`, ""],
              (lines) => lines.join("\n"),
            );
            return writeFile(file, content);
          },
          catch: (cause) => new CompileError({ mode, step: "writing the entry", cause }),
        }),
      );

      const chunk = yield* flow(
        R.tryPromise({
          try: () =>
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
          catch: (cause) => new CompileError({ mode, step: "the build", cause }),
        }),
        R.map((result) => result[0]?.output.find((output) => output.type === "chunk")),
        R.andThen((found) =>
          found?.type === "chunk" ? R.ok(found) : R.err(new NoChunkError({ mode })),
        ),
        GenAwait,
      );

      const entry = chunk.facadeModuleId === null ? undefined : chunk.modules[chunk.facadeModuleId];

      return R.ok(
        Compiled({
          code: Code(chunk.code),
          modules: chunk.moduleIds
            .filter((id) => id !== chunk.facadeModuleId)
            .map((id) => Module(id)),
          // A module's own `renderedLength` counts code that tree-shaking drops, so the library is
          // what the chunk holds beyond its entry.
          library: chunk.code.length - (entry?.renderedLength ?? 0),
        }),
      );
    });

    // Removed whether or not the build succeeded.
    yield* R.await(
      R.tryPromise({
        try: () => rm(dir, { recursive: true, force: true }),
        catch: (cause) => new CompileError({ mode, step: "removing the entry directory", cause }),
      }),
    );

    return built;
  });
}
