import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = new URL("../", import.meta.url);
const marker = "valof-minimal-bundle-size";

function marked(): RegExp {
  return new RegExp(`(?<=<!-- ${marker} -->)[\\s\\S]*?(?=<!-- /${marker} -->)`, "g");
}

function description(): RegExp {
  return /(?<="description": "[^"]*)\d+(?:\.\d+)? [kM]?B gzipped(?=[^"]*")/g;
}

function format(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(2)} kB`;
}

type Measurement = { val?: { production?: { gzip?: unknown } } };
type Claim = {
  file: string;
  url: URL;
  text: string;
  pattern: RegExp;
  found: string;
  stale: boolean;
};

const args = process.argv.slice(2);
const write = args.includes("--write");
const files = args.filter((arg) => arg !== "--write" && arg !== "--");

if (files.length === 0) {
  console.error("usage: replace-bundle-size-claims [--write] <file...>");
  process.exit(1);
}

let stdout: string;
try {
  ({ stdout } = await promisify(execFile)(
    process.execPath,
    [fileURLToPath(new URL("bundle-size.ts", import.meta.url)), "--json"],
    { cwd: fileURLToPath(root) },
  ));
} catch (error) {
  const output = error as { stdout?: string; stderr?: string };
  if (output.stdout) process.stdout.write(output.stdout);
  if (output.stderr) process.stderr.write(output.stderr);
  process.exit(1);
}

const measurement = JSON.parse(stdout) as Measurement;
const gzip = measurement.val?.production?.gzip;
if (typeof gzip !== "number") {
  throw new Error("bundle-size returned no production gzip measurement");
}
const size = `${format(gzip)} gzipped`;

const unique = [...new Map(files.map((file) => [new URL(file, root).href, file])).entries()];
const claims: Claim[] = [];

for (const [href, file] of unique) {
  const url = new URL(href);
  const text = await readFile(url, "utf8");
  const matches = [marked(), description()].flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => ({ pattern, value: match[0] })),
  );
  if (matches.length !== 1) {
    throw new Error(`${file}: expected one bundle-size claim, found ${matches.length}`);
  }
  const match = matches[0]!;
  // The formatter can wrap a marked Markdown claim across lines.
  const found = match.value.replace(/\s+/g, " ");
  claims.push({ file, url, text, pattern: match.pattern, found, stale: found !== size });
}

if (write) {
  await Promise.all(
    claims.map(async ({ url, text, pattern, stale }) => {
      if (stale) await writeFile(url, text.replace(pattern, size));
    }),
  );
}

const label = Math.max(...claims.map(({ file }) => file.length));
console.log(`claims  ${size}`);
for (const { file, found, stale } of claims) {
  const state = !stale ? "ok" : write ? `updated from ${found}` : `stale: ${found}`;
  console.log(`  ${file.padEnd(label)}  ${state}`);
}

const stale = claims.filter((claim) => claim.stale);
if (!write && stale.length > 0) {
  console.error();
  for (const { file, found } of stale) {
    console.error(`stale claim: ${file} says ${found}, measured ${size}. Rerun with --write.`);
  }
  process.exit(1);
}
