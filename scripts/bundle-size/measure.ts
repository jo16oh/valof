import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { minifySync, build, type Rolldown } from "vite";
import { Val } from "../../src/index.ts";
import { Imports, type Bundle } from "./schema.ts";

const root = new URL("../../", import.meta.url);

export type Mode = "production" | "development";
export const modes: readonly Mode[] = ["production", "development"];

export type Sizes = Val<"Sizes", { minified: number; gzip: number; brotli: number }>;
export const Sizes = Val.sealer<Sizes>();

export type Measured = {
  imports: Imports;
  code: Record<Mode, string>;
  sizes: Record<Mode, Sizes>;
};

/** A bundle, measured with the base under it unless it joins the base. */
export type Result = Measured & { bundle: Bundle };

/** Builds `dist`, so the bundles import what a user installs. Exits when the build fails. */
export async function pack(): Promise<void> {
  await promisify(execFile)(fileURLToPath(new URL("node_modules/.bin/vp", root)), ["pack"], {
    cwd: fileURLToPath(root),
  }).catch((error: { stdout?: string; stderr?: string }) => {
    console.error(error.stdout ?? "");
    console.error(error.stderr ?? "");
    process.exit(1);
  });
}

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

export async function measure(imports: Imports): Promise<Measured> {
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

/** The bytes the budget caps: a base bundle's whole size, or what another adds to the base. */
export const capped = ({ bundle, sizes }: Result, base: Measured): number =>
  bundle.base ? sizes.production.gzip : sizes.production.gzip - base.sizes.production.gzip;

/** Throws when a production bundle keeps code that only development or another import needs. */
export function assertProduction({ imports, code }: Measured): void {
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
