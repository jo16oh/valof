import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { minifySync, build, type Rolldown } from "vite";

const root = new URL("../", import.meta.url);
const entry = "./dist/index.mjs";

// `core` is the budget everyone pays. The other two measure what a `Trait` or an `equals` user
// adds on top.
const entries = { core: "Val", trait: "Val, Trait", equals: "equals" } as const;
type Entry = keyof typeof entries;

const modes = ["production", "development"] as const;

/**
 * What a user ships. A ratchet, unlike the budgets in `type-perf`: runtime code is written
 * deliberately, so a byte more is a decision, not drift.
 *
 * The declarations are not measured here. They cost a download and a parse, never a byte in the
 * user's bundle, and `type-perf` already measures what reads them.
 *
 * `traitGzip` is the first budget plus what `Trait` may add, so the pair says the line rather
 * than a second round number: a user who imports `Trait` pays at most a quarter of a kB more.
 */
const BUDGET_VAL_GZIP = 1280;
const BUDGET_VAL_PLUS_TRAIT_GZIP = BUDGET_VAL_GZIP + 128;
const budget = { gzip: BUDGET_VAL_GZIP, traitGzip: BUDGET_VAL_PLUS_TRAIT_GZIP };

type Sizes = { minified: number; gzip: number; brotli: number };

async function bundle(mode: string, api: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "valof-size-"));
  const file = join(dir, "entry.mjs");
  const target = fileURLToPath(new URL(entry, root));
  await writeFile(
    file,
    `import { ${api} } from ${JSON.stringify(target)};\nconsole.log(${api});\n`,
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

const measured = { bundle: bundles.core, trait: bundles.trait, equals: bundles.equals };

const checks = [
  ["production gzip", measured.bundle.production.gzip, budget.gzip],
  ["production gzip, with Trait", measured.trait.production.gzip, budget.traitGzip],
] as const;

// The prose states this figure, so the prose has to follow the measurement. Markdown marks the
// number with a comment; JSON takes no comment, so the description is matched through its key.
const marker = "valof-minimal-bundle-size";
const marked = () => new RegExp(`(?<=<!-- ${marker} -->)[\\s\\S]*?(?=<!-- /${marker} -->)`, "g");
const claimed: [file: string, claim: RegExp][] = [
  ["README.md", marked()],
  ["docs/src/introduction.md", marked()],
  ["package.json", /(?<="description": "[^"]*)\d+(?:\.\d+)? [kM]?B gzipped(?=[^"]*")/g],
];
const write = process.argv.includes("--write");
const size = `${format(measured.bundle.production.gzip)} gzipped`;

const claims = await Promise.all(
  claimed.map(async ([file, claim]) => {
    const url = new URL(file, root);
    const text = await readFile(url, "utf8");
    // The formatter rewraps prose, so a claim can hold a line break.
    const found = (text.match(claim) ?? []).map((match) => match.replace(/\s+/g, " "));
    if (found.length !== 1) {
      throw new Error(`${file}: expected one ${marker} claim, found ${found.length}`);
    }
    const stale = found[0] !== size;
    if (stale && write) await writeFile(url, text.replace(claim, size));
    return { file, found: found[0], stale };
  }),
);

function states(): string {
  const label = Math.max(...claims.map(({ file }) => file.length));
  return claims
    .map(({ file, found, stale }) => {
      const state = !stale ? "ok" : write ? `updated from ${found}` : `stale: ${found}`;
      return `  ${file.padEnd(label)}  ${state}`;
    })
    .join("\n");
}

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
    console.log(`bundle  import { ${entries[name]} }`);
    console.log(table(modes.map((mode) => [mode, bundles[name][mode]])));
    console.log();
  }
  console.log(`claims  ${size}`);
  console.log(states());
  console.log();
  console.log("budget");
  console.log(budgets());
}

const over = checks.filter(([, bytes, max]) => bytes > max);
const stale = write ? [] : claims.filter(({ stale }) => stale);

if (over.length > 0 || stale.length > 0) {
  console.error();
  for (const [name, bytes, max] of over) {
    console.error(`over budget: ${name} is ${format(bytes)}, budget ${format(max)}`);
  }
  for (const { file, found } of stale) {
    console.error(`stale claim: ${file} says ${found}, measured ${size}. Rerun with --write.`);
  }
  process.exit(1);
}
