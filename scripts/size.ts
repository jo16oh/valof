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
const types = "./dist/index.d.mts";

const apis = ["Val", "equals"] as const;

const modes = ["production", "development"] as const;

const budget = { gzip: 1280, types: 24 * 1024 };

type Sizes = { minified: number; gzip: number; brotli: number };

async function bundle(api: (typeof apis)[number], mode: string): Promise<string> {
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

const declarations = await readFile(new URL(types, root), "utf8");
const bundled = Object.fromEntries(
  await Promise.all(
    apis.map(async (api) => [api, await Promise.all(modes.map((mode) => bundle(api, mode)))]),
  ),
) as Record<(typeof apis)[number], string[]>;
const bundles = Object.fromEntries(apis.map((api) => [api, bundled[api].map(measure)])) as Record<
  (typeof apis)[number],
  Sizes[]
>;

const production = minifySync("production.mjs", bundled.Val[modes.indexOf("production")]!).code;
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
  bundle: Object.fromEntries(
    apis.map((api) => [
      api,
      Object.fromEntries(modes.map((mode, index) => [mode, bundles[api][index]!])),
    ]),
  ) as Record<(typeof apis)[number], Record<(typeof modes)[number], Sizes>>,
  types: { raw: Buffer.byteLength(declarations, "utf8") },
};

const checks = [
  ["Val production gzip", measured.bundle.Val.production.gzip, budget.gzip],
  ["types raw", measured.types.raw, budget.types],
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
  for (const api of apis) {
    console.log(`bundle  import { ${api} }`);
    console.log(table(modes.map((mode) => [mode, measured.bundle[api][mode]])));
    console.log();
  }
  console.log(`types   ${types.replace("./dist/", "")}`);
  console.log(`  raw           ${format(measured.types.raw)}`);
  console.log();
  console.log("budget");
  console.log(budgets());
}

const over = checks.filter(([, size, max]) => size > max);

if (over.length > 0) {
  console.error();
  for (const [name, size, max] of over) {
    console.error(`over budget: ${name} is ${format(size)}, budget ${format(max)}`);
  }
  process.exit(1);
}
