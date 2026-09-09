import { expect, test } from "vite-plus/test";

import { cli } from "../support.ts";

// What the run covers, against what it reports on. Three rules need a second file to say
// anything, so a run narrowed to one file loses their findings and calls the directives holding
// them back unused. The fixture is the smallest of those: two aliases claiming one brand.

const under = "tests/lint/project/fixtures";

test("reports nothing on a file whose finding another file in the project silences", () => {
  const { status, stdout } = cli("--project", `${under}/*.ts`, `${under}/billing.ts`);
  expect(stdout).toBe("");
  expect(status).toBe(0);
});

test("still reports the file it was asked about", () => {
  const { stdout } = cli("--project", `${under}/*.ts`, `${under}/orders.ts`);
  expect(stdout).toBe(
    `${under}/orders.ts:1:13  duplicate-brand  Id claims the brand "Id", and so does another type\n`,
  );
});

test("takes the glob joined by an equals sign too", () => {
  const { stdout } = cli(`--project=${under}/*.ts`, `${under}/billing.ts`);
  expect(stdout).toBe("");
});

test("calls a live directive unused where the project is narrowed with it", () => {
  const { stdout } = cli(`${under}/billing.*`);
  expect(stdout).toBe(
    `${under}/billing.ts:1:1  unused-disable  ` +
      "valof-lint-disable-next-line names duplicate-brand, which reports nothing here\n",
  );
});

test("scans a file it was asked about even where the project glob misses it", () => {
  const { stdout } = cli("--project", `${under}/*.ts`, `${under}/outside/fresh.ts`);
  expect(stdout).toBe(`${under}/outside/fresh.ts:2:3  unused-member  User.shout is never read\n`);
});

test("says so when a flag is given no path", () => {
  const { status, stderr } = cli(`${under}/*.ts`, "--project");
  expect(status).toBe(2);
  expect(stderr).toBe("valof-lint: --project needs a path");
});

test("refuses a file where the project goes, since that narrows the run and not the report", () => {
  const { status, stderr } = cli(`${under}/billing.ts`, `${under}/orders.ts`);
  expect(status).toBe(2);
  expect(stderr).toBe(
    `valof-lint: the project must be a directory or a glob, and "${under}/billing.ts" is neither\n` +
      `  valof-lint 'src/**/*.ts' ${under}/billing.ts`,
  );
});

test("takes a directory as the project, and reads the TypeScript under it", () => {
  const { stdout } = cli(under, `${under}/orders.ts`);
  expect(stdout).toBe(
    `${under}/orders.ts:1:13  duplicate-brand  Id claims the brand "Id", and so does another type\n`,
  );
});

test("leaves node_modules out of a directory, which a project of `.` would walk", () => {
  const { status, stdout, stderr } = cli(`${under}/pkg`);
  expect(stdout).toBe("");
  expect(status).toBe(0);
  expect(stderr).toBe("valof-lint: nothing to report in 1 file(s)");
});

test("takes either by name, in either order", () => {
  const { stdout } = cli("--report-on", `${under}/orders.ts`, "--project", under);
  expect(stdout).toBe(
    `${under}/orders.ts:1:13  duplicate-brand  Id claims the brand "Id", and so does another type\n`,
  );
});

test("drops an excluded path from the run, and the finding that needed it with it", () => {
  const { status, stdout, stderr } = cli(`${under}/*.ts`, `!${under}/billing.ts`);
  expect(stdout).toBe("");
  expect(status).toBe(0);
  expect(stderr).toBe("valof-lint: nothing to report in 1 file(s)");
});

test("excludes a path given to --project, since the mark is on the path", () => {
  const { stdout } = cli("--project", `${under}/*.ts`, `--project=!${under}/billing.ts`);
  expect(stdout).toBe("");
});

test("says so when everything is excluded", () => {
  const { status, stderr } = cli(`${under}/*.ts`, `!${under}/*.ts`);
  expect(status).toBe(2);
  expect(stderr).toBe("valof-lint: no files matched");
});

test("takes an excluded file off the report too, where it was named as a target", () => {
  const both = cli(under, `${under}/orders.ts`, `${under}/outside/fresh.ts`);
  expect(both.stdout.split("\n").filter(Boolean)).toHaveLength(2);

  const { stdout } = cli(
    under,
    `${under}/orders.ts`,
    `${under}/outside/fresh.ts`,
    `!${under}/outside/fresh.ts`,
  );
  expect(stdout).toBe(
    `${under}/orders.ts:1:13  duplicate-brand  Id claims the brand "Id", and so does another type\n`,
  );
});
