import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { minifySync, build, type Rolldown } from "vite";

const root = new URL("../", import.meta.url);
const entry = "./dist/index.mjs";
const types = "./dist/index.d.mts";

const api = "Val";

const modes = ["production", "development"] as const;

type Sizes = { minified: number; gzip: number; brotli: number };

async function bundle(mode: string): Promise<string> {
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

const declarations = await readFile(new URL(types, root), "utf8").catch(() => {
  console.error(`${types} is missing. Run \`vp run build\` first.`);
  process.exit(1);
});
const bundles = await Promise.all(modes.map(async (mode) => measure(await bundle(mode))));

const measured = {
  bundle: Object.fromEntries(modes.map((mode, index) => [mode, bundles[index]!])) as Record<
    (typeof modes)[number],
    Sizes
  >,
  types: { raw: Buffer.byteLength(declarations, "utf8") },
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(measured, null, 2));
} else {
  console.log(`bundle  import { ${api} }`);
  console.log(table(modes.map((mode) => [mode, measured.bundle[mode]])));
  console.log();
  console.log(`types   ${types.replace("./dist/", "")}`);
  console.log(`  raw           ${format(measured.types.raw)}`);
}
