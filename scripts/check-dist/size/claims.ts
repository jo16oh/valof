import { readFile, writeFile } from "node:fs/promises";

import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";

const root = new URL("../../../", import.meta.url);
const marker = "valof-minimal-bundle-size";

/** The files that state the bundle size. A release adds the ones that describe the release. */
export const claimed = (release: boolean): string[] => [
  "docs/src/introduction.md",
  ...(release ? ["README.md", "package.json"] : []),
];

export class ClaimCountError extends ErrorFactory({
  message: ({ file, found }) => `${file}: expected one bundle-size claim, found ${found}`,
  fields: ErrorFactory.fields<{ file: string; found: number }>(),
}) {}

export class StaleClaimError extends ErrorFactory({
  message: ({ stale, size }) =>
    stale
      .map(
        ({ file, found }) =>
          `stale claim: ${file} says ${found}, measured ${size}. Rerun with --write.`,
      )
      .join("\n"),
  fields: ErrorFactory.fields<{ stale: { file: string; found: string }[]; size: string }>(),
}) {}

function marked(): RegExp {
  return new RegExp(`(?<=<!-- ${marker} -->)[\\s\\S]*?(?=<!-- /${marker} -->)`, "g");
}

function description(): RegExp {
  return /(?<="description": "[^"]*)\d+(?:\.\d+)? [kM]?B gzipped(?=[^"]*")/g;
}

function format(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(2)} kB`;
}

type Claim = {
  file: string;
  url: URL;
  text: string;
  pattern: RegExp;
  found: string;
  stale: boolean;
};

/**
 * Compares the size each file states with `gzip`, the production gzip of the base bundle, and
 * rewrites the stale ones with `write`.
 */
export async function claims(
  gzip: number,
  { release, write }: { release: boolean; write: boolean },
): R.ResultAsync<void, ClaimCountError | StaleClaimError> {
  const size = `${format(gzip)} gzipped`;
  const found: Claim[] = [];
  for (const file of claimed(release)) {
    const url = new URL(file, root);
    const text = await readFile(url, "utf8");
    const matches = [marked(), description()].flatMap((pattern) =>
      [...text.matchAll(pattern)].map((match) => ({ pattern, value: match[0] })),
    );
    const [match] = matches;
    if (matches.length !== 1 || !match)
      return R.fail(new ClaimCountError({ file, found: matches.length }));
    // The formatter can wrap a marked Markdown claim across lines.
    const said = match.value.replace(/\s+/g, " ");
    found.push({ file, url, text, pattern: match.pattern, found: said, stale: said !== size });
  }

  if (write)
    await Promise.all(
      found.map(async ({ url, text, pattern, stale }) => {
        if (stale) await writeFile(url, text.replace(pattern, size));
      }),
    );

  const label = Math.max(...found.map(({ file }) => file.length));
  console.log(`claims  ${size}`);
  for (const { file, found: said, stale } of found) {
    const state = !stale ? "ok" : write ? `updated from ${said}` : `stale: ${said}`;
    console.log(`  ${file.padEnd(label)}  ${state}`);
  }

  const stale = found.filter((claim) => claim.stale);
  return write || stale.length === 0
    ? R.succeed()
    : R.fail(
        new StaleClaimError({
          stale: stale.map(({ file, found: said }) => ({ file, found: said })),
          size,
        }),
      );
}
