import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import Handlebars from "handlebars";

const TEMPLATE = fileURLToPath(new URL("index.hbs", import.meta.url));

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
  return Handlebars.compile(readFileSync(TEMPLATE, "utf8"))({ versions: sorted, latest });
}

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
  // A release outranks its own prereleases.
  if (left.pre === right.pre) return 0;
  if (left.pre === undefined) return 1;
  if (right.pre === undefined) return -1;
  return comparePrerelease(left.pre, right.pre);
}

/** Semver precedence: numbers by value and below words, and a shorter list below a longer one. */
function comparePrerelease(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  for (const [i, x] of left.entries()) {
    const y = right[i];
    if (y === undefined) return 1;
    if (x === y) continue;
    const xNumber = /^\d+$/.test(x);
    const yNumber = /^\d+$/.test(y);
    if (xNumber && yNumber) return Number(x) - Number(y);
    if (xNumber !== yNumber) return xNumber ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return left.length - right.length;
}
