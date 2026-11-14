import { readFile, writeFile } from "node:fs/promises";

import { Result as R } from "@praha/byethrow";
import { ErrorFactory } from "@praha/error-factory";

import { Enum, Val } from "#valof";

import { bytes } from "../report.ts";

const MARKER = "valof-minimal-bundle-size";

export class ClaimCountError extends ErrorFactory({
  name: "ClaimCountError",
  message: ({ file, found }) => `${file}: expected one bundle-size claim, found ${found}`,
  fields: ErrorFactory.fields<{ file: string; found: number }>(),
}) {}

/** A file that states the bundle size. `release` marks one that only a release checks. */
export type ClaimedFile = Enum<
  "ClaimedFile",
  {
    /** States it between the markers. */
    Markdown: { path: string; release: boolean };
    /** States it in the package description. */
    PackageJson: { path: string; release: boolean };
  }
>;
export const ClaimedFile = Enum.companion<ClaimedFile>()
  .impl(() => ({
    /** Finds the claim in the file's text. */
    regExp: (file): RegExp =>
      ClaimedFile.match(file, {
        Markdown: () => new RegExp(`(?<=<!-- ${MARKER} -->)[\\s\\S]*?(?=<!-- /${MARKER} -->)`, "g"),
        PackageJson: () => /(?<="description": "[^"]*)\d+(?:\.\d+)? [kM]?B gzipped(?=[^"]*")/g,
      }),
  }))
  .build();

/** The claims a run checks, against `size`, the production gzip of the base bundle. */
export type Claims = Val<"Claims", { size: string; claims: Claim[] }>;
export const Claims = Val.companion<Claims>()
  .implAssoc(({ seal }) => ({
    /** Reads the claims in `files` under `root`. Without `release`, skips the release-only ones. */
    read: async (
      files: readonly ClaimedFile[],
      gzip: number,
      release: boolean,
      root: URL,
    ): R.ResultAsync<Claims, ClaimCountError> => {
      const size = `${bytes(gzip)} gzipped`;
      const texts = await Promise.all(
        files
          .filter((file) => release || !file.release)
          .map(async (file) => ({ file, text: await readFile(new URL(file.path, root), "utf8") })),
      );
      const found = R.sequence(texts, ({ file, text }) => Claim.find(file, text, size));
      if (R.isFailure(found)) return found;

      return R.succeed(seal({ size, claims: found.value }));
    },
  }))
  .impl(() => ({
    /** Writes the measured size in place of each stale claim, in its file under `root`. */
    rewrite: async ({ size, claims }, root: URL): Promise<void> => {
      await Promise.all(
        claims.filter(({ stale }) => stale).map((claim) => Claim.rewrite(claim, size, root)),
      );
    },
    /** Each claim's state, after a run that rewrites with `write`. */
    render: ({ size, claims }, write: boolean): string => {
      const label = Math.max(...claims.map(({ file }) => file.path.length));
      return [
        `claims  ${size}`,
        ...claims.map(
          (claim) => `  ${claim.file.path.padEnd(label)}  ${Claim.state(claim, write)}`,
        ),
      ].join("\n");
    },
    /** A line for each stale claim that `write` did not rewrite, with the flags that would. */
    problems: (
      { size, claims },
      { release, write }: { release: boolean; write: boolean },
    ): string[] =>
      write
        ? []
        : claims
            .filter((claim) => claim.stale)
            .map(
              ({ file, found }) =>
                `stale claim: ${file.path} says ${found}, measured ${size}. Rerun with ${release ? "--write --release" : "--write"}.`,
            ),
  }))
  .build();

type Claim = Val<"Claim", { file: ClaimedFile; text: string; found: string; stale: boolean }>;
const Claim = Val.companion<Claim>()
  .implAssoc(({ seal }) => ({
    /** The one claim `text` makes, compared with `size`. Fails unless `text` makes exactly one. */
    find: (file: ClaimedFile, text: string, size: string): R.Result<Claim, ClaimCountError> => {
      const matches = [...text.matchAll(ClaimedFile.regExp(file))];
      const [match] = matches;
      if (matches.length !== 1 || !match)
        return R.fail(new ClaimCountError({ file: file.path, found: matches.length }));

      // The formatter can wrap a marked Markdown claim across lines.
      const found = match[0].replaceAll(/\s+/g, " ");
      return R.succeed(seal({ file, text, found, stale: found !== size }));
    },
  }))
  .impl(() => ({
    /** Writes `size` in place of the claim, in its file under `root`. */
    rewrite: (claim, size: string, root: URL): Promise<void> =>
      writeFile(
        new URL(claim.file.path, root),
        claim.text.replace(ClaimedFile.regExp(claim.file), size),
      ),
    /** What the table prints for the claim, after a run that rewrites with `write`. */
    state: (claim, write: boolean): string =>
      !claim.stale ? "ok" : write ? `updated from ${claim.found}` : `stale: ${claim.found}`,
  }))
  .build();
