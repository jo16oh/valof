#!/usr/bin/env node
import { globSync } from "node:fs";
import { lint, type Finding } from "./index.ts";

const patterns = process.argv.slice(2);
if (patterns.includes("--help") || patterns.includes("-h")) {
  console.log(
    [
      "valof-lint [glob...]",
      "",
      "Reports what the type checker cannot:",
      "  - functions and constants registered with `.impl({…})` that nothing reads",
      "  - a brand string claimed by more than one type alias",
      "  - a payload holding a Val whose own `equals` the parent never dispatches to",
      "",
      "Defaults to src/**/*.ts. Exits 1 when something is found.",
      "",
      "Silence a line with a comment in the block above it:",
      "  // valof-lint-disable-next-line [unused-member] [duplicate-brand]",
      "  //                               [structural-equals] [-- why]",
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
  findings = await lint(files);
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
