import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { minifySync, build, type Rolldown } from "vite";
import { Val } from "../src/index.ts";

const root = new URL("../", import.meta.url);

type Mode = "production" | "development";
const modes: readonly Mode[] = ["production", "development"];

/** The names a bundle imports, per module. */
type Imports = Val<"Imports", Record<string, string[]>>;
const Imports = Val.sealer<Imports>().impl({
  /** What the bundle imports, as the printed heading spells it. */
  names: (imports): string[] => Object.values(imports).flat(),
  merge: (imports, other: Imports): Imports => {
    const merged: Record<string, string[]> = {};
    for (const source of [imports, other]) {
      for (const [module, names] of Object.entries(source)) {
        merged[module] = [...new Set([...(merged[module] ?? []), ...names])];
      }
    }
    return Imports(merged);
  },
});

type Sizes = Val<"Sizes", { minified: number; gzip: number; brotli: number }>;
const Sizes = Val.sealer<Sizes>();

/**
 * A bundle a user ships, and its budget in production gzip. A ratchet, unlike the budgets in
 * `type-perf`: runtime code is written deliberately, so a byte more is a decision, not drift.
 *
 * The declarations are not measured here. They cost a download and a parse, never a byte in the
 * user's bundle, and `type-perf` already measures what reads them.
 */
type Bundle = Val<
  "Bundle",
  {
    /** The key in the `--json` output, which `replace-bundle-size-claims` reads. */
    key: string;
    /** The bundle's name in the budget table. */
    name: string;
    /**
     * Whether the bundle joins the base, which every base bundle forms together. A base bundle is
     * capped by its whole size. Every other bundle is measured on top of the base and capped by
     * what it adds, so growth in the base spends only the base's room: what an import costs is the
     * number to read.
     */
    base?: boolean;
    imports: Imports;
    budget: number;
  }
>;
const Bundle = Val.sealer<Bundle>();

/** The bundles to measure. */
type Registry = Val<"Registry", Bundle[]>;
const Registry = Val.sealer<Registry>().impl({
  /** What the base imports: every base bundle's imports, merged. */
  base: (registry): Imports => {
    const [first, ...others] = registry
      .filter((bundle) => bundle.base)
      .map((bundle) => bundle.imports);
    if (first === undefined) throw new Error("no bundle sets base");
    return others.reduce((merged, imports) => Imports.merge(merged, imports), first);
  },
});

// `Trait` and `Enum` ship from their own subpath, so a bundle names the module per import.
const registry = Registry([
  Bundle({
    key: "val",
    name: "Val",
    base: true,
    imports: Imports({ "./dist/index.mjs": ["Val"] }),
    budget: 1024,
  }),
  Bundle({
    key: "equals",
    name: "Equals",
    imports: Imports({ "./dist/index.mjs": ["equals"] }),
    budget: 256,
  }),
  Bundle({
    key: "trait",
    name: "Trait",
    imports: Imports({ "./dist/experimental.mjs": ["Trait"] }),
    budget: 256,
  }),
  Bundle({
    key: "enum",
    name: "Enum",
    imports: Imports({ "./dist/experimental.mjs": ["Enum"] }),
    budget: 640,
  }),
  Bundle({
    key: "all",
    name: "All",
    imports: Imports({
      "./dist/index.mjs": ["equals"],
      "./dist/experimental.mjs": ["Enum", "Trait"],
    }),
    budget: 1024,
  }),
]);

async function compile(mode: Mode, imports: Imports): Promise<string> {
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

function sizes(code: string): Sizes {
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

/** Pads every column to its widest cell, aligned to the given side. */
function align(rows: readonly (readonly string[])[], sides: readonly ("left" | "right")[]) {
  const columns = sides.map((side, index) => {
    const cells = rows.map((row) => row[index] ?? "");
    const width = Math.max(...cells.map((cell) => cell.length));
    return cells.map((cell) => (side === "left" ? cell.padEnd(width) : cell.padStart(width)));
  });
  return rows.map((_, index) => columns.map((cells) => cells[index] ?? ""));
}

function table(rows: [string, Sizes][]): string {
  const heads = ["minified", "gzip", "brotli"] as const;
  return align(
    [
      ["", ...heads],
      ...rows.map(([name, sizes]) => [name, ...heads.map((head) => format(sizes[head]))]),
    ],
    ["left", "right", "right", "right"],
  )
    .map((cells) => `  ${cells.join("  ")}`)
    .join("\n");
}

await promisify(execFile)(fileURLToPath(new URL("node_modules/.bin/vp", root)), ["pack"], {
  cwd: fileURLToPath(root),
}).catch((error: { stdout?: string; stderr?: string }) => {
  console.error(error.stdout ?? "");
  console.error(error.stderr ?? "");
  process.exit(1);
});

type Measured = {
  imports: Imports;
  code: Record<Mode, string>;
  sizes: Record<Mode, Sizes>;
};

async function measure(imports: Imports): Promise<Measured> {
  const [production, development] = await Promise.all([
    compile("production", imports),
    compile("development", imports),
  ]);
  return {
    imports,
    code: { production, development },
    sizes: { production: sizes(production), development: sizes(development) },
  };
}

const baseImports = Registry.base(registry);

const results = await Promise.all(
  registry.map(async (bundle) => ({
    bundle,
    ...(await measure(bundle.base ? bundle.imports : Imports.merge(baseImports, bundle.imports))),
  })),
);
const [only, ...more] = results.filter(({ bundle }) => bundle.base);
const base = only !== undefined && more.length === 0 ? only : await measure(baseImports);

for (const { imports, code } of [base, ...results]) {
  const production = minifySync("production.mjs", code.production).code;
  const heading = `import { ${Imports.names(imports).join(", ")} }`;
  if (
    production.includes("snapshotSealInput") ||
    production.includes("unsnapshotable seal input") ||
    production.includes("The payload changed while the custom seal was running.")
  ) {
    throw new Error(`development-only seal stability checks remain in production: ${heading}`);
  }
  if (!Imports.names(imports).includes("equals") && production.includes("Number.isNaN")) {
    throw new Error(`equals remains in production without its import: ${heading}`);
  }
}

type Result = (typeof results)[number];

/** The bytes the budget caps: a base bundle's whole size, or what another adds to the base. */
const capped = ({ bundle, sizes }: Result): number =>
  bundle.base ? sizes.production.gzip : sizes.production.gzip - base.sizes.production.gzip;

const amount = ({ bundle }: Result, bytes: number): string =>
  bundle.base ? format(bytes) : `+${format(bytes)}`;

const label = ({ bundle }: Result): string =>
  bundle.base ? bundle.name : `added by ${bundle.name}`;

function budgets(): string {
  const rows = results.map((result) => {
    const bytes = capped(result);
    const max = result.bundle.budget;
    const left =
      bytes > max
        ? `${format(bytes - max)} over`
        : `${format(max - bytes)} left (${Math.round((1 - bytes / max) * 100)}%)`;
    return [label(result), amount(result, bytes), amount(result, max), left];
  });
  return align(rows, ["left", "right", "right", "left"])
    .map(([name, used, limit, left]) => `  ${name}  ${used} / ${limit}  ${left}`.trimEnd())
    .join("\n");
}

const printed: Measured[] = base === only ? results : [base, ...results];

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      Object.fromEntries(results.map(({ bundle, sizes }) => [bundle.key, sizes])),
      null,
      2,
    ),
  );
} else {
  for (const { imports, sizes } of printed) {
    console.log(`bundle  import { ${Imports.names(imports).join(", ")} }`);
    console.log(table(modes.map((mode) => [mode, sizes[mode]])));
    console.log();
  }
  console.log("budget (production gzip)");
  console.log(budgets());
}

const over = results.filter((result) => capped(result) > result.bundle.budget);

if (over.length > 0) {
  console.error();
  for (const result of over) {
    console.error(
      `over budget: ${label(result)} is ${amount(result, capped(result))}, budget ${amount(result, result.bundle.budget)}`,
    );
  }
  process.exit(1);
}
