import { readFile, writeFile } from "node:fs/promises";

import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";
import { Val } from "#valof";

import { bytes } from "../report.ts";
import { repository } from "../../shared/repository.ts";

const marker = "valof-minimal-bundle-size";

/** The files that state the bundle size. A release adds the ones that describe the release. */
const claimed = (release: boolean): string[] => [
  "docs/src/introduction.md",
  ...(release ? ["README.md", "package.json"] : []),
];

export class ClaimCountError extends ErrorFactory({
  name: "ClaimCountError",
  message: ({ file, found }) => `${file}: expected one bundle-size claim, found ${found}`,
  fields: ErrorFactory.fields<{ file: string; found: number }>(),
}) {}

export class StaleClaimError extends ErrorFactory({
  name: "StaleClaimError",
  message: ({ stale, size, rerun }) =>
    stale
      .map(
        ({ file, found }) =>
          `stale claim: ${file} says ${found}, measured ${size}. Rerun with ${rerun}.`,
      )
      .join("\n"),
  fields: ErrorFactory.fields<{
    stale: Claim[];
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

export type Claim = Val<
  "Claim",
  { file: string; text: string; pattern: Pattern; found: string; stale: boolean }
>;
const Claim = Val.companion<Claim>()
  .implAssoc(({ seal }) => ({
    /** The one claim `text` makes, compared with `size`. Fails unless `text` makes exactly one. */
    find: (file: string, text: string, size: string): R.Result<Claim, ClaimCountError> => {
      const matches = patterns.flatMap((pattern) =>
        [...text.matchAll(Pattern.regExp(pattern))].map((match) => ({ pattern, value: match[0] })),
      );
      const [match] = matches;
      if (matches.length !== 1 || !match)
        return R.fail(new ClaimCountError({ file, found: matches.length }));

      // The formatter can wrap a marked Markdown claim across lines.
      const found = match.value.replaceAll(/\s+/g, " ");
      return R.succeed(seal({ file, text, pattern: match.pattern, found, stale: found !== size }));
    },
  }))
  .impl(() => ({
    /** Writes `size` in place of the claim, in its file under `root`. */
    rewrite: (claim, size: string, root: URL): Promise<void> =>
      writeFile(new URL(claim.file, root), claim.text.replace(Pattern.regExp(claim.pattern), size)),
    /** What the table prints for the claim, after a run that rewrites with `write`. */
    state: (claim, write: boolean): string =>
      !claim.stale ? "ok" : write ? `updated from ${claim.found}` : `stale: ${claim.found}`,
  }))
  .build();

/**
 * Compares the size each file states with `gzip`, the production gzip of the base bundle, and
 * rewrites the stale ones with `write`.
 */
export async function claims(
  gzip: number,
  { release, write }: { release: boolean; write: boolean },
  root: URL = repository,
): R.ResultAsync<void, ClaimCountError | StaleClaimError> {
  const size = `${bytes(gzip)} gzipped`;
  const texts = await Promise.all(
    claimed(release).map(async (file) => ({
      file,
      text: await readFile(new URL(file, root), "utf8"),
    })),
  );
  const found = R.sequence(texts, ({ file, text }) => Claim.find(file, text, size));
  if (R.isFailure(found)) return found;
  const stated = found.value;

  if (write)
    await Promise.all(
      stated.filter(({ stale }) => stale).map((claim) => Claim.rewrite(claim, size, root)),
    );

  const label = Math.max(...stated.map(({ file }) => file.length));
  console.log(`claims  ${size}`);
  for (const claim of stated)
    console.log(`  ${claim.file.padEnd(label)}  ${Claim.state(claim, write)}`);

  const stale = stated.filter((claim) => claim.stale);
  return write || stale.length === 0
    ? R.succeed()
    : R.fail(
        new StaleClaimError({
          stale,
          size,
          rerun: release ? "--write --release" : "--write",
        }),
      );
}
