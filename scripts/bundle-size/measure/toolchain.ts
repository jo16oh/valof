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
        production: yield* Compiled.measure(production),
        development: yield* Compiled.measure(development),
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
    attempt(mode, "reading the library", async () =>
      (await readFile(module, "utf8")).includes("NODE_ENV"),
    ),
});

type Compiled = Val<"Compiled", { code: Code; modules: Module[]; library: number }>;
const Compiled = Val.sealer<Compiled>().impl({
  measure: (compiled): R<Build, MinifyError> =>
    Code.sizes(compiled.code).map((sizes) => Build({ sizes, library: compiled.library })),
});

function compile(mode: Mode, imports: Imports): Promise<R<Compiled, NoChunkError | CompileError>> {
  return R.gen(async function* () {
    const dir = yield* R.await(
      attempt(mode, "creating the entry directory", () => mkdtemp(join(tmpdir(), "valof-size-"))),
    );

    const file = join(dir, "entry.mjs");

    const built = await R.gen(async function* () {
      yield* R.await(
        attempt(mode, "writing the entry", () => {
          const content = pipe(
            Object.entries(imports).map(
              ([module, names]) =>
                `import { ${names.join(", ")} } from ${JSON.stringify(fileURLToPath(new URL(module, root)))};`,
            ),
            (lines) => [...lines, `console.log(${Imports.names(imports).join(", ")});`, ""],
            (lines) => lines.join("\n"),
          );
          return writeFile(file, content);
        }),
      );

      const chunk = yield* flow(
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
      attempt(mode, "removing the entry directory", () =>
        rm(dir, { recursive: true, force: true }),
      ),
    );

    return built;
  });
}

/** Runs one step of building a bundle, turning a rejection into a {@link CompileError}. */
function attempt<A>(mode: Mode, step: string, run: () => Promise<A>): Promise<R<A, CompileError>> {
  return R.tryPromise({ try: run, catch: (cause) => new CompileError({ mode, step, cause }) });
}
