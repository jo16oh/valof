import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { minifySync, build, type Rolldown } from "vite";
import { Val } from "../src/index.ts";
import { Enum, type VariantOf, type VariantsOf } from "../src/experimental.ts";

const root = new URL("../", import.meta.url);

/** The names an entry imports, per module. */
type Imports = Val<"Imports", Record<string, string[]>>;
const Imports = Val.sealer<Imports>().impl({
  /** What the entry imports, as the printed heading spells it. */
  names: (imports): string[] => Object.values(imports).flat(),
});

type Sizes = Val<"Sizes", { minified: number; gzip: number; brotli: number }>;
const Sizes = Val.sealer<Sizes>();

/**
 * A bundle a user ships, and its budget in production gzip. A ratchet, unlike the budgets in
 * `type-perf`: runtime code is written deliberately, so a byte more is a decision, not drift.
 *
 * The declarations are not measured here. They cost a download and a parse, never a byte in the
 * user's bundle, and `type-perf` already measures what reads them.
 *
 * `Core` is the budget everyone pays. The others cap what they add to the measured core, so growth
 * in the core spends only the core's room: what an import costs is the number to read.
 */
type Entry = Enum<
  "Entry",
  { Core: {}; Equals: {}; Trait: {}; Enum: {}; All: {} },
  { imports: Imports; budget: number }
>;
type Name = keyof VariantsOf<Entry>;
const Entry = Enum.sealer<Entry>().impl({
  /** Whether the budget caps what the entry adds to the core, rather than its whole size. */
  adds: (entry): boolean =>
    Entry.match(entry, {
      Core: () => false,
      Equals: () => true,
      Trait: () => true,
      Enum: () => true,
      All: () => true,
    }),
  label: (entry): string => (Entry.adds(entry) ? `added by ${entry._tag}` : "production gzip"),
  amount: (entry, bytes: number): string =>
    Entry.adds(entry) ? `+${format(bytes)}` : format(bytes),
});

// `Trait` and `Enum` ship from their own subpath, so the entry names the module per import.
const entries = {
  Core: Entry.Core({ imports: Imports({ "./dist/index.mjs": ["Val"] }), budget: 1024 }),
  Equals: Entry.Equals({
    imports: Imports({ "./dist/index.mjs": ["Val", "equals"] }),
    budget: 256,
  }),
  Trait: Entry.Trait({
    imports: Imports({ "./dist/index.mjs": ["Val"], "./dist/experimental.mjs": ["Trait"] }),
    budget: 256,
  }),
  Enum: Entry.Enum({
    imports: Imports({ "./dist/index.mjs": ["Val"], "./dist/experimental.mjs": ["Enum"] }),
    budget: 640,
  }),
  All: Entry.All({
    imports: Imports({
      "./dist/index.mjs": ["Val", "equals"],
      "./dist/experimental.mjs": ["Enum", "Trait"],
    }),
    budget: 1024,
  }),
} satisfies { [N in Name]: VariantOf<Entry, N> };
const names = Object.keys(entries) as Name[];

const modes = ["production", "development"] as const;

async function bundle(mode: string, imports: Imports): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "valof-size-"));
  const file = join(dir, "entry.mjs");
  const lines = Object.entries(imports).map(
    ([module, names]) =>
      `import { ${names.join(", ")} } from ${JSON.stringify(fileURLToPath(new URL(module, root)))};`,
  );
  await writeFile(
    file,
    `${lines.join("\n")}\nconsole.log(${Imports.names(imports).join(", ")});\n`,
  );
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
}

function format(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(2)} kB`;
}

function table(rows: [string, Sizes][]): string {
  const heads = ["minified", "gzip", "brotli"] as const;
  const label = Math.max(...rows.map(([name]) => name.length));
  const widths = heads.map((head) =>
    Math.max(head.length, ...rows.map(([, sizes]) => format(sizes[head]).length)),
  );
  const line = (name: string, cells: readonly string[]) =>
    `  ${name.padEnd(label)}  ${cells.map((cell, index) => cell.padStart(widths[index]!)).join("  ")}`;
  return [
    line("", heads),
    ...rows.map(([name, sizes]) =>
      line(
        name,
        heads.map((head) => format(sizes[head])),
      ),
    ),
  ].join("\n");
}

await promisify(execFile)(fileURLToPath(new URL("node_modules/.bin/vp", root)), ["pack"], {
  cwd: fileURLToPath(root),
}).catch((error: { stdout?: string; stderr?: string }) => {
  console.error(error.stdout ?? "");
  console.error(error.stderr ?? "");
  process.exit(1);
});

const code = Object.fromEntries(
  await Promise.all(
    names.map(async (name) => [
      name,
      Object.fromEntries(
        await Promise.all(
          modes.map(async (mode) => [mode, await bundle(mode, entries[name].imports)]),
        ),
      ) as Record<(typeof modes)[number], string>,
    ]),
  ),
) as Record<Name, Record<(typeof modes)[number], string>>;

const bundles = Object.fromEntries(
  names.map((name) => [
    name,
    Object.fromEntries(modes.map((mode) => [mode, measure(code[name][mode])])),
  ]),
) as Record<Name, Record<(typeof modes)[number], Sizes>>;

const production = minifySync("production.mjs", code.Core.production).code;
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

// `replace-bundle-size-claims` reads these keys from `--json`.
const measured = {
  val: bundles.Core,
  trait: bundles.Trait,
  enum: bundles.Enum,
  equals: bundles.Equals,
  all: bundles.All,
};

/** What the entry's budget caps, in production gzip. */
const capped = (entry: Entry): number => {
  const gzip = bundles[entry._tag].production.gzip;
  return Entry.adds(entry) ? gzip - bundles.Core.production.gzip : gzip;
};

function budgets(): string {
  const all = Object.values(entries);
  const label = Math.max(...all.map((entry) => Entry.label(entry).length));
  const used = Math.max(...all.map((entry) => Entry.amount(entry, capped(entry)).length));
  const limit = Math.max(...all.map((entry) => Entry.amount(entry, entry.budget).length));
  return all
    .map((entry) => {
      const bytes = capped(entry);
      const max = entry.budget;
      const left =
        bytes > max
          ? `${format(bytes - max)} over`
          : `${format(max - bytes)} left (${Math.round((1 - bytes / max) * 100)}%)`;
      return `  ${Entry.label(entry).padEnd(label)}  ${Entry.amount(entry, bytes).padStart(used)} / ${Entry.amount(entry, max).padStart(limit)}  ${left}`;
    })
    .join("\n");
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(measured, null, 2));
} else {
  for (const name of names) {
    console.log(`bundle  import { ${Imports.names(entries[name].imports).join(", ")} }`);
    console.log(table(modes.map((mode) => [mode, bundles[name][mode]])));
    console.log();
  }
  console.log("budget");
  console.log(budgets());
}

const over = Object.values(entries).filter((entry) => capped(entry) > entry.budget);

if (over.length > 0) {
  console.error();
  for (const entry of over) {
    console.error(
      `over budget: ${Entry.label(entry)} is ${Entry.amount(entry, capped(entry))}, budget ${Entry.amount(entry, entry.budget)}`,
    );
  }
  process.exit(1);
}
