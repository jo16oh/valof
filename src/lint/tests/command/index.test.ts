import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import {
  UnusedMember,
  RULES,
  cli,
  cliKeepingIn,
  cliWithBrokenParser,
  cliWithoutParser,
  cliWithoutTypeScript,
} from "../support.ts";

function under(fixture: string): string {
  return `src/lint/tests/command/fixtures/${fixture}`;
}

test("prints a finding's location and kind, and exits 1 with a summary", () => {
  const { status, stdout, stderr } = cli(under("*.ts"), under("finding.ts"));
  expect(stdout).toMatch(
    new RegExp(`^src/lint/tests/command/fixtures/finding\\.ts:4:3  ${UnusedMember.kind}  `),
  );
  expect(status).toBe(1);
  expect(stderr).toBe("valof-lint: 1 finding(s) in 1 file(s)");
});

test("exits 0 with a summary when it does not", () => {
  const { status, stderr } = cli(under("*.ts"), under("clean.ts"));
  expect(status).toBe(0);
  expect(stderr).toBe("valof-lint: nothing to report in 1 file(s)");
});

test("does not need TypeScript in the project it lints", () => {
  const { status, stdout } = cliWithoutTypeScript(under("*.ts"), under("finding.ts"));
  expect(status).toBe(1);
  expect(stdout).toContain(`${UnusedMember.kind}  Id.shout is never read`);
});

test("exits 2 when nothing matches the glob", () => {
  const { status, stderr } = cli(under("no-such-directory/**/*.ts"));
  expect(status).toBe(2);
  expect(stderr).toBe("valof-lint: no files matched");
});

test("names every rule and what it looks for, under --help and -h alike", () => {
  const { status, stdout } = cli("--help");
  expect(status).toBe(0);
  const lines = stdout.split("\n");
  for (const { kind, description } of RULES) {
    expect(lines.some((line) => line.includes(kind) && line.includes(description))).toBe(true);
  }
  expect(cli("-h").stdout).toBe(stdout);
});

test("asks for oxc-parser when it is not installed", () => {
  const { status, stderr } = cliWithoutParser(under("*.ts"));
  expect(status).toBe(2);
  expect(stderr).toContain("oxc-parser");
  expect(stderr).toContain("pnpm add -D oxc-parser");
});

test("lets another failure to load the parser surface as itself", () => {
  const { status, stderr } = cliWithBrokenParser(under("*.ts"));
  expect(status).toBe(1);
  expect(stderr).toContain("the parser's binding failed to load");
  expect(stderr).not.toContain("pnpm add -D oxc-parser");
});

test("keeps its scans under node_modules/.cache, and reports the same findings with them", () => {
  const dir = mkdtempSync(join(tmpdir(), "valof-cli-"));
  try {
    cpSync(fileURLToPath(new URL("fixtures/finding.ts", import.meta.url)), join(dir, "finding.ts"));
    mkdirSync(join(dir, "node_modules"));
    const first = cliKeepingIn(dir, "*.ts");
    expect(existsSync(join(dir, "node_modules", ".cache", "valof-lint", "scans.json"))).toBe(true);
    expect(cliKeepingIn(dir, "*.ts")).toEqual(first);
    expect(first.stdout).toContain(`${UnusedMember.kind}  Id.shout is never read`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
