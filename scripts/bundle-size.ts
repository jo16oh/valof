import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { minifySync, build, type Rolldown } from "vite";
import { Val } from "../src/index.ts";
import { Trait, type Dyn, type Self } from "../src/experimental.ts";

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

/** What a bundle imports, and its budget in production gzip. */
type Spec = { imports: Imports; budget: number };

/**
 * A bundle a user ships, and its budget in production gzip. A ratchet, unlike the budgets in
 * `type-perf`: runtime code is written deliberately, so a byte more is a decision, not drift.
 *
 * The declarations are not measured here. They cost a download and a parse, never a byte in the
 * user's bundle, and `type-perf` already measures what reads them.
 */
type Bundle = Trait<
  "Bundle",
  Spec,
  {
    /** The key in the `--json` output, which `replace-bundle-size-claims` reads. */
    key: (self: Self) => string;
    label: (self: Self) => string;
  }
>;
const Bundle = Trait.companion<Bundle>();

type Core = Val<"Core", Spec, Bundle>;
const Core = Val.sealer<Core>().implTrait(Bundle, {
  key: () => "val",
  label: () => "production gzip",
});

type WithEquals = Val<"WithEquals", Spec, Bundle>;
const WithEquals = Val.sealer<WithEquals>().implTrait(Bundle, {
  key: () => "equals",
  label: () => "added by Equals",
});

type WithTrait = Val<"WithTrait", Spec, Bundle>;
const WithTrait = Val.sealer<WithTrait>().implTrait(Bundle, {
  key: () => "trait",
  label: () => "added by Trait",
});

type WithEnum = Val<"WithEnum", Spec, Bundle>;
const WithEnum = Val.sealer<WithEnum>().implTrait(Bundle, {
  key: () => "enum",
  label: () => "added by Enum",
});

type All = Val<"All", Spec, Bundle>;
const All = Val.sealer<All>().implTrait(Bundle, {
  key: () => "all",
  label: () => "added by All",
});

type Registered = { bundle: Dyn<Bundle>; base: boolean };

/**
 * Collects the bundles to measure. The base is every bundle registered with `base` set, bundled
 * together. Each of those is capped by its whole size. Every other bundle is measured on top of
 * the base and capped by what it adds, so growth in the base spends only the base's room: what an
 * import costs is the number to read.
 */
type Registry = {
  register: (bundle: Dyn<Bundle>, base: boolean) => Registry;
  registered: readonly Registered[];
};
const registry = (registered: readonly Registered[] = []): Registry => ({
  register: (bundle, base) => registry([...registered, { bundle, base }]),
  registered,
});

// `Trait` and `Enum` ship from their own subpath, so a bundle names the module per import.
const { registered } = registry()
  .register(
    Bundle.dyn(Core, Core({ imports: Imports({ "./dist/index.mjs": ["Val"] }), budget: 1024 })),
    true,
  )
  .register(
    Bundle.dyn(
      WithEquals,
      WithEquals({ imports: Imports({ "./dist/index.mjs": ["equals"] }), budget: 256 }),
    ),
    false,
  )
  .register(
    Bundle.dyn(
      WithTrait,
      WithTrait({ imports: Imports({ "./dist/experimental.mjs": ["Trait"] }), budget: 256 }),
    ),
    false,
  )
  .register(
    Bundle.dyn(
      WithEnum,
      WithEnum({ imports: Imports({ "./dist/experimental.mjs": ["Enum"] }), budget: 640 }),
    ),
    false,
  )
  .register(
    Bundle.dyn(
      All,
      All({
        imports: Imports({
          "./dist/index.mjs": ["equals"],
          "./dist/experimental.mjs": ["Enum", "Trait"],
        }),
        budget: 1024,
      }),
    ),
    false,
  );

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

const bases = registered.filter(({ base }) => base).map(({ bundle }) => bundle.imports);
const [first, ...others] = bases;
if (first === undefined) throw new Error("register at least one bundle as the base");
const baseImports = others.reduce((merged, imports) => Imports.merge(merged, imports), first);

const [base, results] = await Promise.all([
  measure(baseImports),
  Promise.all(
    registered.map(async (entry) => ({
      ...entry,
      ...(await measure(
        entry.base ? entry.bundle.imports : Imports.merge(baseImports, entry.bundle.imports),
      )),
    })),
  ),
]);

const production = minifySync("production.mjs", base.code.production).code;
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

type Result = (typeof results)[number];

/** The bytes the budget caps: a base bundle's whole size, or what another adds to the base. */
const capped = ({ base: isBase, sizes }: Result): number =>
  isBase ? sizes.production.gzip : sizes.production.gzip - base.sizes.production.gzip;

const amount = ({ base: isBase }: Result, bytes: number): string =>
  isBase ? format(bytes) : `+${format(bytes)}`;

function budgets(): string {
  const label = Math.max(...results.map(({ bundle }) => bundle.label().length));
  const used = Math.max(...results.map((result) => amount(result, capped(result)).length));
  const limit = Math.max(...results.map((result) => amount(result, result.bundle.budget).length));
  return results
    .map((result) => {
      const bytes = capped(result);
      const max = result.bundle.budget;
      const left =
        bytes > max
          ? `${format(bytes - max)} over`
          : `${format(max - bytes)} left (${Math.round((1 - bytes / max) * 100)}%)`;
      return `  ${result.bundle.label().padEnd(label)}  ${amount(result, bytes).padStart(used)} / ${amount(result, max).padStart(limit)}  ${left}`;
    })
    .join("\n");
}

// With one base bundle, the base is that bundle, already printed.
const printed = bases.length > 1 ? [base, ...results] : results;

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      Object.fromEntries(results.map(({ bundle, sizes }) => [bundle.key(), sizes])),
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
  console.log("budget");
  console.log(budgets());
}

const over = results.filter((result) => capped(result) > result.bundle.budget);

if (over.length > 0) {
  console.error();
  for (const result of over) {
    console.error(
      `over budget: ${result.bundle.label()} is ${amount(result, capped(result))}, budget ${amount(result, result.bundle.budget)}`,
    );
  }
  process.exit(1);
}
