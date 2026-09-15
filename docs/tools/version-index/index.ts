import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Handlebars from "handlebars";

const template = fileURLToPath(new URL("index.hbs", import.meta.url));

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

/** Tag directories, newest first. Anything else on the site is left out. */
export function versions(names: string[]): string[] {
  return names
    .filter((name) => /^v\d+\.\d+\.\d+/.test(name))
    .sort(compare)
    .reverse();
}

export function render(names: string[]): string {
  const sorted = versions(names);
  // `latest/` is a copy of the newest release, so the newest non-prerelease names what it holds.
  const latest = sorted.find((version) => !version.includes("-"));
  return Handlebars.compile(readFileSync(template, "utf8"))({ versions: sorted, latest });
}

function main(): void {
  // The site root of the published book: one directory per tag, plus `latest`.
  const root = process.argv[2];
  if (root === undefined) throw new Error("usage: node index.ts <site-root>");

  const names = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  writeFileSync(join(root, "index.html"), render(names));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
