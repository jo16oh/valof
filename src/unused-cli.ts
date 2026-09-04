#!/usr/bin/env node
import { globSync } from "node:fs";
import { findUnused, type Unused } from "./unused.ts";

const patterns = process.argv.slice(2);
if (patterns.includes("--help") || patterns.includes("-h")) {
  console.log(
    [
      "valof-unused [glob...]",
      "",
      "Reports functions and constants registered with `.impl({…})` that nothing reads.",
      "Defaults to src/**/*.ts. Exits 1 when something is found.",
      "",
      "Needs @ast-grep/napi, which valof leaves for you to install:",
      "  pnpm add -D @ast-grep/napi",
    ].join("\n"),
  );
  process.exit(0);
}

const files = globSync(patterns.length > 0 ? patterns : "src/**/*.ts");
if (files.length === 0) {
  console.error("valof-unused: no files matched");
  process.exit(2);
}

let unused: Unused[];
try {
  unused = await findUnused(files);
} catch (error) {
  if ((error as { code?: string }).code !== "ERR_MODULE_NOT_FOUND") throw error;
  console.error(
    "valof-unused needs @ast-grep/napi, which valof does not install for you.\n" +
      "  pnpm add -D @ast-grep/napi",
  );
  process.exit(2);
}
for (const { companion, member, file, line } of unused) {
  console.log(`${file}:${line}  ${companion}.${member}`);
}
console.error(
  unused.length === 0
    ? `valof-unused: no unused companion members in ${files.length} file(s)`
    : `valof-unused: ${unused.length} unused companion member(s) in ${files.length} file(s)`,
);
process.exit(unused.length === 0 ? 0 : 1);
