#!/usr/bin/env node
import { globSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { styleText, type InspectColor } from "node:util";
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

/** What a directory holds, for a caller who names one instead of writing the glob out. */
const UNDER = "**/*.{ts,tsx,mts,cts}";

const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/**
 * The files one argument stands for.
 *
 * A directory brings the TypeScript under it, never what its dependencies installed: a project
 * given as `.` would otherwise walk `node_modules`.
 */
const expand = (path: string): string[] =>
  globSync(isDirectory(path) ? `${path}/${UNDER}` : path, {
    exclude: (found) => found.split(/[\\/]/).includes("node_modules"),
  });

const projects: string[] = [];
const targets: string[] = [];
const loose: string[] = [];
const skip = new Set<Kind>();
let help = false;
let pending: "project" | "target" | undefined;

for (const argument of process.argv.slice(2)) {
  if (pending) {
    (pending === "project" ? projects : targets).push(argument);
    pending = undefined;
  } else if (argument === "--help" || argument === "-h") {
    help = true;
  } else if (argument === "--project" || argument === "--target") {
    pending = argument.slice("--".length) as "project" | "target";
  } else if (argument.startsWith("--project=")) {
    projects.push(argument.slice("--project=".length));
  } else if (argument.startsWith("--target=")) {
    targets.push(argument.slice("--target=".length));
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
    loose.push(argument);
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
      "report on the whole project. Either can be given by name, in any order.",
      "  valof-lint src src/billing/id.ts",
      "  valof-lint --target src/billing/id.ts --project 'src/**/*.ts'",
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

const read = (projects.length > 0 ? projects : ["src/**/*.ts"]).flatMap(expand);
const asked = targets.flatMap(expand);
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
