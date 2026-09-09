import { expect, test } from "vite-plus/test";

import { cli, cliWithoutParser, cliWithoutTypeScript } from "../support.ts";

const under = (fixture: string): string => `tests/lint/command/fixtures/${fixture}`;

test("prints a finding as location, kind, then message, and exits 1 with a summary", () => {
  const { status, stdout, stderr } = cli(under("*.ts"), under("finding.ts"));
  expect(stdout).toBe(
    "tests/lint/command/fixtures/finding.ts:3:3  unused-member  Id.shout is never read\n",
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
  const { stdout } = cli(under("equality/**/*.ts"));
  expect(stdout).toBe(
    "tests/lint/command/fixtures/equality/order.ts:6:22  structural-equals  " +
      "Order.total holds Money, which has its own equals\n",
  );
});

test("exits 2 when nothing matches the glob", () => {
  const { status, stderr } = cli(under("no-such-directory/**/*.ts"));
  expect(status).toBe(2);
  expect(stderr).toBe("valof-lint: no files matched");
});

test("names every rule and what it looks for, under --help and -h alike", () => {
  const { status, stdout } = cli("--help");
  expect(status).toBe(0);
  expect(stdout).toContain(
    "  unused-member       functions and constants registered with `.impl({…})` that nothing reads\n" +
      "  duplicate-brand     a brand string claimed by more than one type alias\n" +
      "  brand-mismatch      a brand whose last segment is not the name of the type it brands\n" +
      "  structural-equals   a payload holding a Val whose own `equals` the parent never dispatches to\n" +
      "  incomplete-disable  a disable comment leaving out the rules it silences, or its scope\n" +
      "  unused-disable      a disable comment naming a rule that reports nothing there\n",
  );
  expect(cli("-h").stdout).toBe(stdout);
});

test("refuses the run when the project it lints has no TypeScript", () => {
  const { status, stderr } = cliWithoutTypeScript(under("*.ts"));
  expect(status).toBe(2);
  expect(stderr).toBe(
    "valof-lint found no typescript in the project it is linting.\n" + "  pnpm add -D typescript",
  );
});

test("asks for oxc-parser when it is not installed", () => {
  const { status, stderr } = cliWithoutParser(under("*.ts"));
  expect(status).toBe(2);
  expect(stderr).toBe(
    "valof-lint needs oxc-parser, which valof does not install for you.\n" +
      "  pnpm add -D oxc-parser",
  );
});
