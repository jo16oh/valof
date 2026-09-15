import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { minifySync, build, type Rolldown } from "vite";

const root = new URL("../", import.meta.url);

// `core` is the budget everyone pays. The other entries measure what `Trait`, `equals`, or both
// add on top. `Trait` ships from its own subpath, so the entry names the module per import.
const entries = {
  core: { "./dist/index.mjs": ["Val"] },
  trait: { "./dist/index.mjs": ["Val"], "./dist/experimental.mjs": ["Trait"] },
  enum: { "./dist/index.mjs": ["Val"], "./dist/experimental.mjs": ["Enum"] },
  equals: { "./dist/index.mjs": ["Val", "equals"] },
  all: { "./dist/index.mjs": ["Val", "equals"], "./dist/experimental.mjs": ["Enum", "Trait"] },
} as const satisfies Record<string, Readonly<Record<string, readonly string[]>>>;
type Entry = keyof typeof entries;
type Imports = Readonly<Record<string, readonly string[]>>;

/** What the entry imports, as the printed heading spells it. */
const imported = (imports: Imports): string[] => Object.values(imports).flat();

const modes = ["production", "development"] as const;

/**
 * What a user ships. A ratchet, unlike the budgets in `type-perf`: runtime code is written
 * deliberately, so a byte more is a decision, not drift.
 *
 * The declarations are not measured here. They cost a download and a parse, never a byte in the
 * user's bundle, and `type-perf` already measures what reads them.
 *
 * `traitGzip` and `enumGzip` are the first budget plus what each adds, so the pair says the line
 * rather than a second round number: what an experimental import costs is the number to read.
 */
const BUDGET_VAL_GZIP = 1280;
const BUDGET_VAL_PLUS_TRAIT_GZIP = BUDGET_VAL_GZIP + 128;
const BUDGET_VAL_PLUS_ENUM_GZIP = BUDGET_VAL_GZIP + 384;
const budget = {
  gzip: BUDGET_VAL_GZIP,
  traitGzip: BUDGET_VAL_PLUS_TRAIT_GZIP,
  enumGzip: BUDGET_VAL_PLUS_ENUM_GZIP,
};

type Sizes = { minified: number; gzip: number; brotli: number };

async function bundle(mode: string, imports: Imports): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "valof-size-"));
  const file = join(dir, "entry.mjs");
  const lines = Object.entries(imports).map(
    ([module, names]) =>
      `import { ${names.join(", ")} } from ${JSON.stringify(fileURLToPath(new URL(module, root)))};`,
  );
  await writeFile(file, `${lines.join("\n")}\nconsole.log(${imported(imports).join(", ")});\n`);
  try {
    const result = (await build({
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
    })) as Rolldown.RolldownOutput[];
    const chunk = result[0]?.output.find((output) => output.type === "chunk");
    if (chunk?.type !== "chunk") throw new Error(`no chunk emitted for ${mode}`);
    return chunk.code;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function measure(code: string): Sizes {
  const bytes = Buffer.from(minifySync("bundle.mjs", code).code, "utf8");
  return {
    minified: bytes.byteLength,
    gzip: gzipSync(bytes, { level: 9 }).byteLength,
    brotli: brotliCompressSync(bytes, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
        [constants.BROTLI_PARAM_SIZE_HINT]: bytes.byteLength,
      },
    }).byteLength,
  };
}

function format(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(2)} kB`;
}

function table(rows: [string, Record<string, number>][]): string {
  const heads = Object.keys(rows[0]?.[1] ?? {});
  const label = Math.max(...rows.map(([name]) => name.length));
  const widths = heads.map((head, index) =>
    Math.max(head.length, ...rows.map(([, cells]) => format(Object.values(cells)[index]!).length)),
  );
  const line = (name: string, cells: string[]) =>
    `  ${name.padEnd(label)}  ${cells.map((cell, index) => cell.padStart(widths[index]!)).join("  ")}`;
  return [
    line("", heads),
    ...rows.map(([name, cells]) => line(name, Object.values(cells).map(format))),
  ].join("\n");
}

await promisify(execFile)(fileURLToPath(new URL("node_modules/.bin/vp", root)), ["pack"], {
  cwd: fileURLToPath(root),
}).catch((error: { stdout?: string; stderr?: string }) => {
  console.error(error.stdout ?? "");
  console.error(error.stderr ?? "");
  process.exit(1);
});

const names = Object.keys(entries) as Entry[];
const code = Object.fromEntries(
  await Promise.all(
    names.map(async (name) => [
      name,
      Object.fromEntries(
        await Promise.all(modes.map(async (mode) => [mode, await bundle(mode, entries[name])])),
      ) as Record<(typeof modes)[number], string>,
    ]),
  ),
) as Record<Entry, Record<(typeof modes)[number], string>>;

const bundles = Object.fromEntries(
  names.map((name) => [
    name,
    Object.fromEntries(modes.map((mode) => [mode, measure(code[name][mode])])),
  ]),
) as Record<Entry, Record<(typeof modes)[number], Sizes>>;

const production = minifySync("production.mjs", code.core.production).code;
if (
  production.includes("snapshotSealInput") ||
  production.includes("unsnapshotable seal input") ||
  production.includes("The payload changed while the custom seal was running.")
) {
  throw new Error("development-only seal stability checks remain in the production bundle");
}
if (production.includes("Number.isNaN")) {
  throw new Error("equals remains in the production bundle that imports only Val");
}

const measured = {
  bundle: bundles.core,
  trait: bundles.trait,
  enum: bundles.enum,
  equals: bundles.equals,
  all: bundles.all,
};

const checks = [
  ["production gzip", measured.bundle.production.gzip, budget.gzip],
  ["production gzip, with Trait", measured.trait.production.gzip, budget.traitGzip],
  ["production gzip, with Enum", measured.enum.production.gzip, budget.enumGzip],
] as const;

function budgets(): string {
  const label = Math.max(...checks.map(([name]) => name.length));
  const used = Math.max(...checks.map(([, size]) => format(size).length));
  const limit = Math.max(...checks.map(([, , max]) => format(max).length));
  return checks
    .map(([name, size, max]) => {
      const left =
        size > max
          ? `${format(size - max)} over`
          : `${format(max - size)} left (${Math.round((1 - size / max) * 100)}%)`;
      return `  ${name.padEnd(label)}  ${format(size).padStart(used)} / ${format(max).padStart(limit)}  ${left}`;
    })
    .join("\n");
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(measured, null, 2));
} else {
  for (const name of names) {
    console.log(`bundle  import { ${imported(entries[name]).join(", ")} }`);
    console.log(table(modes.map((mode) => [mode, bundles[name][mode]])));
    console.log();
  }
  console.log("budget");
  console.log(budgets());
}

const over = checks.filter(([, bytes, max]) => bytes > max);

if (over.length > 0) {
  console.error();
  for (const [name, bytes, max] of over) {
    console.error(`over budget: ${name} is ${format(bytes)}, budget ${format(max)}`);
  }
  process.exit(1);
}
