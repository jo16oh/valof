#!/usr/bin/env node
import { resolve } from "node:path";
import { styleText, type InspectColor } from "node:util";
import { expand, isDirectory } from "./files.ts";
import {
  isKind,
  isSkippable,
  kinds,
  lint,
  NO_TYPESCRIPT,
  RULES,
  skippable,
  type Finding,
  type Kind,
} from "./index.ts";

/** A path with any of these is a glob, and stands for whatever it matches. */
const GLOB = /[*?[\]{}]/;

const projects: string[] = [];
const targets: string[] = [];
const excluded: string[] = [];
const loose: string[] = [];
const skip = new Set<Kind>();
let help = false;
let pending: "project" | "report-on" | undefined;

/**
 * A path goes where it was written, unless it opens with `!`.
 *
 * An exclusion belongs to neither list: it comes off the run and the report alike, so a generated
 * tree named once is out of the answer however it was reached.
 */
const take = (into: string[], path: string): void => {
  if (path.startsWith("!")) excluded.push(path.slice(1));
  else into.push(path);
};

for (const argument of process.argv.slice(2)) {
  if (pending) {
    take(pending === "project" ? projects : targets, argument);
    pending = undefined;
  } else if (argument === "--help" || argument === "-h") {
    help = true;
  } else if (argument === "--project" || argument === "--report-on") {
    pending = argument.slice("--".length) as "project" | "report-on";
  } else if (argument.startsWith("--project=")) {
    take(projects, argument.slice("--project=".length));
  } else if (argument.startsWith("--report-on=")) {
    take(targets, argument.slice("--report-on=".length));
  } else if (argument.startsWith("--no-")) {
    const kind = argument.slice("--no-".length);
    if (!isKind(kind)) {
      console.error(
        `valof-lint: no rule called ${JSON.stringify(kind)}\n  known rules: ${kinds.join(", ")}`,
      );
      process.exit(2);
    }
    if (!isSkippable(kind)) {
      console.error(
        `valof-lint: ${kind} always runs, since it guards the disable comments\n` +
          `  rules you can leave out: ${skippable.join(", ")}`,
      );
      process.exit(2);
    }
    skip.add(kind);
  } else {
    take(loose, argument);
  }
}

if (help) {
  const width = Math.max(...RULES.map(({ kind }) => kind.length));
  const listed = (which: (rule: (typeof RULES)[number]) => boolean): string[] =>
    RULES.filter(which).map(({ kind, description }) => `  ${kind.padEnd(width)}  ${description}`);
  console.log(
    [
      "valof-lint [--no-<rule>...] [project] [file...]",
      "",
      "Reports what the type checker cannot:",
      ...listed((rule) => !rule.always),
      "",
      "And about the disable comments themselves, which always run:",
      ...listed((rule) => rule.always === true),
      "",
      "The project is a directory or a glob, and defaults to src/**/*.ts. It is what the",
      "run reads. Files named after it are what the run reports on; leave them out to",
      "report on the whole project. Either can be given by name, --project and",
      "--report-on, in any order, and either can be given more than once.",
      "  valof-lint src src/billing/id.ts",
      "  valof-lint --report-on src/billing/id.ts --project 'src/**/*.ts'",
      "",
      "A path opening with ! is excluded, from the run as well as the report:",
      "  valof-lint 'src/**/*.ts' '!src/generated/**'",
      "",
      "Three rules need a second file to say anything, so a run narrowed to one file",
      "loses their findings and calls the directives holding them back unused.",
      "",
      "Exits 1 when something is found.",
      "",
      "Leave a rule out of the run:",
      "  valof-lint --no-structural-equals",
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
    ].join("\n"),
  );
  process.exit(0);
}

if (pending) {
  console.error(`valof-lint: --${pending} needs a path`);
  process.exit(2);
}

// The first loose path is the project, unless one was named. A file there is the mistake this
// catches: it would narrow the run rather than the report, which is the whole point of the two.
if (projects.length === 0 && loose.length > 0) {
  const first = loose.shift() as string;
  if (!GLOB.test(first) && !isDirectory(first)) {
    console.error(
      `valof-lint: the project must be a directory or a glob, and ${JSON.stringify(first)} is` +
        " neither\n  valof-lint 'src/**/*.ts' " +
        first,
    );
    process.exit(2);
  }
  projects.push(first);
}
targets.push(...loose);

// Resolved, since a path reaches this from a glob the caller wrote and from one it excluded, and
// the two spellings need not match.
const dropped = new Set(excluded.flatMap(expand).map((file) => resolve(file)));
const kept = (files: string[]): string[] => files.filter((file) => !dropped.has(resolve(file)));

const read = kept((projects.length > 0 ? projects : ["src/**/*.ts"]).flatMap(expand));
const asked = kept(targets.flatMap(expand));
// Scanned together: a file to report on that the project glob does not cover is still read,
// rather than passed over and called clean.
const scanned = [...new Set([...read, ...asked])];
const reported = targets.length > 0 ? asked : scanned;
if (reported.length === 0) {
  console.error("valof-lint: no files matched");
  process.exit(2);
}

let findings: Finding[];
try {
  findings = await lint(scanned, {
    skip,
    ...(targets.length > 0 ? { report: new Set(asked.map((file) => resolve(file))) } : {}),
  });
} catch (error) {
  const { code } = error as { code?: string };
  if (code === "ERR_MODULE_NOT_FOUND") {
    console.error(
      "valof-lint needs oxc-parser, which valof does not install for you.\n" +
        "  pnpm add -D oxc-parser",
    );
  } else if (code === NO_TYPESCRIPT) {
    console.error(
      "valof-lint found no typescript in the project it is linting.\n" + "  pnpm add -D typescript",
    );
  } else {
    throw error;
  }
  process.exit(2);
}
/**
 * Colour, or not, as the stream warrants.
 *
 * `styleText` decides: a TTY gets colour, a pipe does not, and `NO_COLOR` and `FORCE_COLOR` are
 * honoured with the latter winning. Each stream is judged on its own, so piping the findings
 * still leaves the summary on a terminal coloured. No library buys anything over this.
 */
const paint =
  (stream: NodeJS.WriteStream) =>
  (style: InspectColor, text: string): string =>
    styleText(style, text, { stream });

const out = paint(process.stdout);
const err = paint(process.stderr);

for (const { file, line, column, kind, message } of findings) {
  console.log(`${out("cyan", `${file}:${line}:${column}`)}  ${out("yellow", kind)}  ${message}`);
}
console.error(
  findings.length === 0
    ? err("green", `valof-lint: nothing to report in ${reported.length} file(s)`)
    : err("red", `valof-lint: ${findings.length} finding(s) in ${reported.length} file(s)`),
);
process.exit(findings.length === 0 ? 0 : 1);
