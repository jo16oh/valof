import { expect, test } from "vite-plus/test";

import {
  StructuralEquals,
  UnusedMember,
  RULES,
  cli,
  cliWithoutParser,
  cliWithoutTypeScript,
} from "../support.ts";

const under = (fixture: string): string => `tests/lint/command/fixtures/${fixture}`;

test("prints a finding's location and kind, and exits 1 with a summary", () => {
  const { status, stdout, stderr } = cli(under("*.ts"), under("finding.ts"));
  expect(stdout).toMatch(
    new RegExp(`^tests/lint/command/fixtures/finding\\.ts:3:3  ${UnusedMember.kind}  `),
  );
  expect(status).toBe(1);
  expect(stderr).toBe("valof-lint: 1 finding(s) in 1 file(s)");
});

test("exits 0 with a summary when it does not", () => {
  const { status, stderr } = cli(under("*.ts"), under("clean.ts"));
  expect(status).toBe(0);
  expect(stderr).toBe("valof-lint: nothing to report in 1 file(s)");
});

test("starts a TypeScript of its own when the caller hands it none", () => {
  const { status, stdout } = cli(under("equality/**/*.ts"));
  expect(status).toBe(1);
  expect(stdout).toContain(StructuralEquals.kind);
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

test("refuses the run when the project it lints has no TypeScript", () => {
  const { status, stderr } = cliWithoutTypeScript(under("*.ts"));
  expect(status).toBe(2);
  expect(stderr).toContain("typescript");
  expect(stderr).toContain("pnpm add -D typescript");
});

test("asks for oxc-parser when it is not installed", () => {
  const { status, stderr } = cliWithoutParser(under("*.ts"));
  expect(status).toBe(2);
  expect(stderr).toContain("oxc-parser");
  expect(stderr).toContain("pnpm add -D oxc-parser");
});
