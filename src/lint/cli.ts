#!/usr/bin/env node
import { globSync } from "node:fs";
import { isKind, kinds, lint, RULES, type Finding, type Kind } from "./index.ts";

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
      "  // valof-lint-disable-next-line unused-member -- why",
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
  if ((error as { code?: string }).code !== "ERR_MODULE_NOT_FOUND") throw error;
  console.error(
    "valof-lint needs oxc-parser, which valof does not install for you.\n" +
      "  pnpm add -D oxc-parser",
  );
  process.exit(2);
}
for (const finding of findings) {
  const at = `${finding.file}:${finding.line}`;
  console.log(
    finding.kind === "unused-member"
      ? `${at}  ${finding.companion}.${finding.member} is never read`
      : finding.kind === "duplicate-brand"
        ? `${at}  ${finding.alias} claims the brand "${finding.brand}", and so does another type`
        : `${at}  ${finding.parent}.${finding.path} holds ${finding.child}, which has its own equals`,
  );
}
console.error(
  findings.length === 0
    ? `valof-lint: nothing to report in ${files.length} file(s)`
    : `valof-lint: ${findings.length} finding(s) in ${files.length} file(s)`,
);
process.exit(findings.length === 0 ? 0 : 1);
