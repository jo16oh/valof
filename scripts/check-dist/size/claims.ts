import { readFile, writeFile } from "node:fs/promises";

import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";
import { Val } from "#valof";

/** The repository, which the claimed files are relative to. */
const repository = new URL("../../../", import.meta.url);
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
  message: ({ stale, size, rerun }) =>
    stale
      .map(
        ({ file, found }) =>
          `stale claim: ${file} says ${found}, measured ${size}. Rerun with ${rerun}.`,
      )
      .join("\n"),
  fields: ErrorFactory.fields<{
    stale: { file: string; found: string }[];
    size: string;
    /** The flags that rewrite these claims. */
    rerun: string;
  }>(),
}) {}

/** The source of a regular expression that finds a claim. */
type Pattern = Val<"Pattern", string>;
const Pattern = Val.companion<Pattern>()
  .impl(() => ({ regExp: (pattern) => new RegExp(pattern, "g") }))
  .build();

const patterns = [
  // A Markdown claim, between the markers.
  Pattern.seal(`(?<=<!-- ${marker} -->)[\\s\\S]*?(?=<!-- /${marker} -->)`),
  // The package description.
  Pattern.seal(/(?<="description": "[^"]*)\d+(?:\.\d+)? [kM]?B gzipped(?=[^"]*")/.source),
];

function format(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(2)} kB`;
}

type Claim = Val<
  "Claim",
  { file: string; text: string; pattern: Pattern; found: string; stale: boolean }
>;
const Claim = Val.companion<Claim>().build();

/**
 * Compares the size each file states with `gzip`, the production gzip of the base bundle, and
 * rewrites the stale ones with `write`.
 */
export async function claims(
  gzip: number,
  { release, write }: { release: boolean; write: boolean },
  root: URL = repository,
): R.ResultAsync<void, ClaimCountError | StaleClaimError> {
  const size = `${format(gzip)} gzipped`;
  const texts = await Promise.all(
    claimed(release).map(async (file) => ({
      file,
      text: await readFile(new URL(file, root), "utf8"),
    })),
  );
  const found: Claim[] = [];
  for (const { file, text } of texts) {
    const matches = patterns.flatMap((pattern) =>
      [...text.matchAll(Pattern.regExp(pattern))].map((match) => ({ pattern, value: match[0] })),
    );
    const [match] = matches;
    if (matches.length !== 1 || !match)
      return R.fail(new ClaimCountError({ file, found: matches.length }));
    // The formatter can wrap a marked Markdown claim across lines.
    const said = match.value.replaceAll(/\s+/g, " ");
    found.push(
      Claim.seal({ file, text, pattern: match.pattern, found: said, stale: said !== size }),
    );
  }

  if (write)
    await Promise.all(
      found.map(async ({ file, text, pattern, stale }) => {
        if (stale)
          await writeFile(new URL(file, root), text.replace(Pattern.regExp(pattern), size));
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
          rerun: release ? "--write --release" : "--write",
        }),
      );
}
