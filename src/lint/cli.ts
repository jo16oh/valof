#!/usr/bin/env node
import { resolve } from "node:path";
import { styleText, type InspectColor } from "node:util";

import { Result as R } from "@praha/byethrow";

import { Val } from "../index.ts";
import { Arguments } from "./arguments.ts";
import { NoFilesMatchedError, type UsageError } from "./errors.ts";
import { Path, type FilePath } from "./files.ts";
import { RULES, type Finding } from "./rules/index.ts";
import { Options } from "./options.ts";
import { run } from "./run.ts";
import { ScanCache } from "./scan-cache.ts";
import { ScanStore } from "./scan-store.ts";

/** What `--help` prints. */
function usage(): string {
  const width = Math.max(...RULES.map(({ kind }) => kind.length));
  const listed = RULES.map(({ kind, description }) => `  ${kind.padEnd(width)}  ${description}`);
  return [
    "valof-lint [--no-<rule>...] [project] [file...]",
    "",
    "Reports what the type checker cannot, and what a disable comment does not do:",
    ...listed,
    "",
    "The project is a directory or a glob, and defaults to src/**/*.ts. It is what the",
    "run reads. Files named after it are what the run reports on; leave them out to",
    "report on the whole project. The project can also be given by name, --project,",
    "before or after the files, and either can be given more than once.",
    "  valof-lint src src/billing/id.ts",
    "  valof-lint src/billing/id.ts --project 'src/**/*.ts'",
    "",
    "A path starting with ! is excluded, from the run as well as the report:",
    "  valof-lint 'src/**/*.ts' '!src/generated/**'",
    "",
    "Three rules need a second file to say anything, so a run narrowed to one file",
    "loses their findings and calls the directives holding them back unused.",
    "",
    "Exits 1 when something is found.",
    "",
    "Leave a rule out of the run:",
    "  valof-lint --no-unused-member",
    "",
    "Turn on data-type-outside-valof, with any of its settings:",
    "  valof-lint --data-type-outside-valof=classes,constraints,extraction",
    "",
    "Silence one line with a comment in the block above it, by the same names:",
    "  // valof-lint-disable-next-line unused-member, brand-mismatch -- why",
    "",
    "Silence a whole file with one anywhere in it:",
    "  // valof-lint-disable-whole-file unused-member -- why",
    "  // valof-lint-disable-all-whole-file -- every rule, for a generated file",
    "",
    "Needs oxc-parser, which valof leaves for you to install:",
    "  pnpm add -D oxc-parser",
  ].join("\n");
}

type Files = Val<"Files", { scanned: FilePath[]; targets: FilePath[]; reported: FilePath[] }>;
const Files = Val.companion<Files>()
  .implAssoc(({ seal }) => ({
    /** Expands the globs the arguments name, and makes the files of {@link Files.fromPaths}. */
    glob: ({ projects, targets, excluded }: Arguments): R.Result<Files, NoFilesMatchedError> =>
      Files.fromPaths(
        (projects.length > 0 ? projects : [Path.seal("src/**/*.ts")]).flatMap((path) =>
          Path.expand(path),
        ),
        targets.length > 0 ? targets.flatMap((path) => Path.expand(path)) : null,
        excluded.flatMap((path) => Path.expand(path)),
      ),
    /**
     * The files read and the files reported on, with every exclusion applied to both. `targets` is
     * `null` when the arguments name none, and then every file read is reported on.
     */
    fromPaths: (
      project: FilePath[],
      targets: FilePath[] | null,
      excluded: FilePath[],
    ): R.Result<Files, NoFilesMatchedError> => {
      // Resolved, because the same file can come from a glob the caller wrote and from one it
      // excluded, spelled differently.
      const dropped = new Set(excluded.map((file) => resolve(file)));
      const kept = (found: FilePath[]): FilePath[] =>
        found.filter((file) => !dropped.has(resolve(file)));

      const read = kept(project);
      const targeted = kept(targets ?? []);
      // Scanned together, so a file to report on that the project glob does not cover is still
      // read, rather than skipped and called clean.
      const scanned = [...new Set([...read, ...targeted])];
      const reported = targets ? targeted : scanned;
      return reported.length === 0
        ? R.fail(new NoFilesMatchedError())
        : R.succeed(seal({ scanned, targets: targeted, reported }));
    },
  }))
  .build();

/** Runs what the arguments ask for, and returns the status to exit with. */
async function command(argv: readonly string[]): Promise<R.Result<number, UsageError>> {
  const parsed = Arguments.fromArgv(argv);
  if (R.isFailure(parsed)) return parsed;
  const args = parsed.value;
  if (args.help) {
    console.log(usage());
    return R.succeed(0);
  }
  const chosen = Files.glob(args);
  if (R.isFailure(chosen)) return chosen;
  const { scanned, targets, reported } = chosen.value;
  const store = ScanStore.open();
  const found = await run(
    scanned,
    Options.create({
      skip: args.skip,
      enable: args.enable,
      ...(args.targets.length > 0 ? { targets } : {}),
    }),
    new ScanCache(store),
  );
  store.save();
  if (R.isFailure(found)) return found;
  print(found.value, reported.length);
  return R.succeed(found.value.length === 0 ? 0 : 1);
}

/**
 * Color, or not, as the stream warrants.
 *
 * `styleText` decides: a TTY gets color, a pipe does not, and `NO_COLOR` and `FORCE_COLOR` are
 * honored with the latter winning. Each stream is judged on its own, so piping the findings still
 * leaves the summary on a terminal colored. No library improves on this.
 */
const paint =
  (stream: NodeJS.WriteStream) =>
  (style: InspectColor, text: string): string =>
    styleText(style, text, { stream });

function print(findings: readonly Finding[], reported: number): void {
  const out = paint(process.stdout);
  const err = paint(process.stderr);
  for (const {
    file,
    at: { line, column },
    kind,
    message,
  } of findings) {
    console.log(`${out("cyan", `${file}:${line}:${column}`)}  ${out("yellow", kind)}  ${message}`);
  }
  console.error(
    findings.length === 0
      ? err("green", `valof-lint: nothing to report in ${reported} file(s)`)
      : err("red", `valof-lint: ${findings.length} finding(s) in ${reported} file(s)`),
  );
}

const status = await command(process.argv.slice(2));
if (R.isFailure(status)) console.error(status.error.message);
process.exit(R.isFailure(status) ? 2 : status.value);
