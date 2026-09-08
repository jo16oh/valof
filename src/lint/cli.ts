#!/usr/bin/env node
import { globSync } from "node:fs";
import { styleText, type InspectColor } from "node:util";
import { isKind, kinds, lint, NO_TYPESCRIPT, RULES, type Finding, type Kind } from "./index.ts";

const patterns: string[] = [];
const skip = new Set<Kind>();
let help = false;

for (const argument of process.argv.slice(2)) {
  if (argument === "--help" || argument === "-h") {
    help = true;
  } else if (argument.startsWith("--no-")) {
    const kind = argument.slice("--no-".length);
    if (!isKind(kind)) {
      console.error(
        `valof-lint: no rule called ${JSON.stringify(kind)}\n  known rules: ${kinds.join(", ")}`,
      );
      process.exit(2);
    }
    skip.add(kind);
  } else {
    patterns.push(argument);
  }
}

if (help) {
  const width = Math.max(...RULES.map(({ kind }) => kind.length));
  console.log(
    [
      "valof-lint [--no-<rule>...] [glob...]",
      "",
      "Reports what the type checker cannot:",
      ...RULES.map(({ kind, description }) => `  ${kind.padEnd(width)}  ${description}`),
      "",
      "Defaults to src/**/*.ts. Exits 1 when something is found.",
      "",
      "Leave a rule out of the run:",
      "  valof-lint --no-structural-equals",
      "",
      "Silence one line with a comment in the block above it, by the same names:",
      "  // valof-lint-disable-next-line unused-member, brand-mismatch -- why",
      "",
      "Needs oxc-parser, which valof leaves for you to install:",
      "  pnpm add -D oxc-parser",
    ].join("\n"),
  );
  process.exit(0);
}

const files = globSync(patterns.length > 0 ? patterns : "src/**/*.ts");
if (files.length === 0) {
  console.error("valof-lint: no files matched");
  process.exit(2);
}

let findings: Finding[];
try {
  findings = await lint(files, { skip });
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
    ? err("green", `valof-lint: nothing to report in ${files.length} file(s)`)
    : err("red", `valof-lint: ${findings.length} finding(s) in ${files.length} file(s)`),
);
process.exit(findings.length === 0 ? 0 : 1);
