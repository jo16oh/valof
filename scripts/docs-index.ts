import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

// The site root of the published book: one directory per tag, plus `latest`.
const root = process.argv[2];
if (root === undefined) throw new Error("usage: node scripts/docs-index.ts <site-root>");

const template = fileURLToPath(new URL("../docs/index.hbs", import.meta.url));

const entries = await readdir(root, { withFileTypes: true });
const versions = entries
  .filter((entry) => entry.isDirectory() && /^v\d+\.\d+\.\d+/.test(entry.name))
  .map((entry) => entry.name)
  .sort(compare)
  .reverse();

function compare(a: string, b: string): number {
  const parts = (name: string) => {
    const [core = "", pre] = name.slice(1).split("-", 2);
    const [major = 0, minor = 0, patch = 0] = core.split(".").map(Number);
    return { numbers: [major, minor, patch], pre };
  };
  const left = parts(a);
  const right = parts(b);
  for (const [i, number] of left.numbers.entries()) {
    const other = right.numbers[i] ?? 0;
    if (number !== other) return number - other;
  }
  // A release outranks its own prereleases; between two prereleases, order by name.
  if (left.pre === right.pre) return 0;
  if (left.pre === undefined) return 1;
  if (right.pre === undefined) return -1;
  return left.pre < right.pre ? -1 : 1;
}

const render = Handlebars.compile(await readFile(template, "utf8"));

// `latest/` is a copy of the newest release, so the newest non-prerelease names what it holds.
const latest = versions.find((version) => !version.includes("-"));

await writeFile(join(root, "index.html"), render({ versions, latest }));
