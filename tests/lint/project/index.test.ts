import { expect, test } from "vite-plus/test";

import { cli, cliIn, ROOT } from "../support.ts";

// What the run covers, against what it reports on. Three rules need a second file to say
// anything, so a run narrowed to one file loses their findings and calls the directives holding
// them back unused. The fixture is the smallest of those: two aliases claiming one brand.

const UNDER = "tests/lint/project/fixtures";

test("reports nothing on a file whose finding another file in the project silences", () => {
  const { status, stdout } = cli("--project", `${UNDER}/*.ts`, `${UNDER}/billing.ts`);
  expect(stdout).toBe("");
  expect(status).toBe(0);
});

test("still reports the file it was asked about", () => {
  const { stdout } = cli("--project", `${UNDER}/*.ts`, `${UNDER}/orders.ts`);
  expect(stdout).toBe(
    `${UNDER}/orders.ts:2:13  duplicate-brand  Id claims the brand "Id", and so does another type\n`,
  );
});

test("takes the glob joined by an equals sign too", () => {
  const { stdout } = cli(`--project=${UNDER}/*.ts`, `${UNDER}/orders.ts`);
  expect(stdout).toBe(
    `${UNDER}/orders.ts:2:13  duplicate-brand  Id claims the brand "Id", and so does another type\n`,
  );
});

test("reads src/**/*.ts when no project is named", () => {
  const { stdout } = cliIn(`${ROOT}${UNDER}/default`);
  expect(stdout).toBe(
    'src/billing.ts:2:13  duplicate-brand  Ref claims the brand "Ref", and so does another type\n' +
      'src/orders.ts:2:13  duplicate-brand  Ref claims the brand "Ref", and so does another type\n',
  );
});

test("calls a live directive unused where the project is narrowed with it", () => {
  const { stdout } = cli(`${UNDER}/billing.*`);
  expect(stdout).toBe(
    `${UNDER}/billing.ts:2:1  unused-disable  ` +
      "valof-lint-disable-next-line names duplicate-brand, which reports nothing here\n",
  );
});

test("scans a file it was asked about even where the project glob misses it", () => {
  const { stdout } = cli("--project", `${UNDER}/*.ts`, `${UNDER}/outside/fresh.ts`);
  expect(stdout).toBe(`${UNDER}/outside/fresh.ts:3:3  unused-member  User.shout is never read\n`);
});

test.each([
  ["--report-on", "--report-on"],
  [`--report-on=${UNDER}/orders.ts`, "--report-on"],
  ["-x", "-x"],
])("refuses an option it does not take, rather than read it as a path: %s", (option, named) => {
  const { status, stderr } = cli(UNDER, option);
  expect(status).toBe(2);
  expect(stderr).toBe(`valof-lint: no option called "${named}"`);
});

test("says so when a flag is given no path", () => {
  const { status, stderr } = cli(`${UNDER}/*.ts`, "--project");
  expect(status).toBe(2);
  expect(stderr).toBe("valof-lint: --project needs a path");
});

test("refuses a file where the project goes, since that narrows the run and not the report", () => {
  const { status, stderr } = cli(`${UNDER}/billing.ts`, `${UNDER}/orders.ts`);
  expect(status).toBe(2);
  expect(stderr).toBe(
    `valof-lint: the project must be a directory or a glob, and "${UNDER}/billing.ts" is neither\n` +
      `  valof-lint 'src/**/*.ts' ${UNDER}/billing.ts`,
  );
});

test("takes a directory as the project, and reads the TypeScript under it", () => {
  const { stdout } = cli(UNDER, `${UNDER}/orders.ts`);
  expect(stdout).toBe(
    `${UNDER}/orders.ts:2:13  duplicate-brand  Id claims the brand "Id", and so does another type\n`,
  );
});

test("leaves node_modules out of a directory, which a project of `.` would walk", () => {
  const { status, stdout, stderr } = cli(`${UNDER}/pkg`);
  expect(stdout).toBe("");
  expect(status).toBe(0);
  expect(stderr).toBe("valof-lint: nothing to report in 1 file(s)");
});

test("takes the project by name after the files to report on", () => {
  const { stdout } = cli(`${UNDER}/orders.ts`, "--project", UNDER);
  expect(stdout).toBe(
    `${UNDER}/orders.ts:2:13  duplicate-brand  Id claims the brand "Id", and so does another type\n`,
  );
});

test("drops an excluded path from the run, and the finding that needed it with it", () => {
  const { status, stdout, stderr } = cli(`${UNDER}/*.ts`, `!${UNDER}/billing.ts`);
  expect(stdout).toBe("");
  expect(status).toBe(0);
  expect(stderr).toBe("valof-lint: nothing to report in 1 file(s)");
});

test("excludes a path given to --project, since the mark is on the path", () => {
  const { status, stdout } = cli("--project", `${UNDER}/*.ts`, `--project=!${UNDER}/billing.ts`);
  expect(stdout).toBe("");
  expect(status).toBe(0);
});

test("says so when everything is excluded", () => {
  const { status, stderr } = cli(`${UNDER}/*.ts`, `!${UNDER}/*.ts`);
  expect(status).toBe(2);
  expect(stderr).toBe("valof-lint: no files matched");
});

test("says so when every file named to report on is excluded, rather than report on the project", () => {
  const { status, stderr } = cli(`${UNDER}/*.ts`, `${UNDER}/orders.ts`, `!${UNDER}/orders.ts`);
  expect(status).toBe(2);
  expect(stderr).toBe("valof-lint: no files matched");
});

test("takes an excluded file off the report too, where it was named as a target", () => {
  const both = cli(UNDER, `${UNDER}/orders.ts`, `${UNDER}/outside/fresh.ts`);
  expect(both.stdout.split("\n").filter(Boolean)).toHaveLength(2);

  const { stdout } = cli(
    UNDER,
    `${UNDER}/orders.ts`,
    `${UNDER}/outside/fresh.ts`,
    `!${UNDER}/outside/fresh.ts`,
  );
  expect(stdout).toBe(
    `${UNDER}/orders.ts:2:13  duplicate-brand  Id claims the brand "Id", and so does another type\n`,
  );
});
