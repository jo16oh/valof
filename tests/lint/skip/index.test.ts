import { expect, test } from "vite-plus/test";

import { kinds, skippable } from "../../../src/lint/index.ts";
import { cli, fixtures } from "../support.ts";

const { lint } = fixtures(import.meta.url);

const glob = "tests/lint/skip/fixtures/mixed/**/*.ts";

test("leaves out the kind the flag names, and only that one", async () => {
  expect(await lint("mixed")).toEqual([
    'mixed/orders.ts:3:13  duplicate-brand  Id claims the brand "Id", and so does another type',
    'mixed/users.ts:3:13  duplicate-brand  Id claims the brand "Id", and so does another type',
    "mixed/users.ts:6:3  unused-member  User.shout is never read",
  ]);
  expect(await lint("mixed", { skip: ["duplicate-brand"] })).toEqual([
    "mixed/users.ts:6:3  unused-member  User.shout is never read",
  ]);
  expect(await lint("mixed", { skip: ["unused-member"] })).toEqual([
    'mixed/orders.ts:3:13  duplicate-brand  Id claims the brand "Id", and so does another type',
    'mixed/users.ts:3:13  duplicate-brand  Id claims the brand "Id", and so does another type',
  ]);
});

test("takes more than one, and leaves nothing once every kind is out", async () => {
  expect(await lint("mixed", { skip: ["duplicate-brand", "unused-member"] })).toEqual([]);
});

test("keeps a rule guarding the directives in, whatever the caller asks", async () => {
  expect(await lint("guarded", { skip: ["bare-disable", "unused-disable"] })).toEqual([
    "guarded.ts:1:1  bare-disable  valof-lint-disable names no scope; write valof-lint-disable-next-line or valof-lint-disable-whole-file",
    "guarded.ts:3:1  unused-disable  valof-lint-disable-whole-file names structural-equals, which reports nothing in this file",
  ]);
});

test("refuses the flag for one of those, and says which rules take it", () => {
  const { status, stderr } = cli("--no-bare-disable", glob);
  expect(status).toBe(2);
  expect(stderr).toBe(
    "valof-lint: bare-disable always runs, since it guards the disable comments\n" +
      `  rules you can leave out: ${skippable.join(", ")}`,
  );
});

// The list read off the registry, not written again: which rules exist is what `--help` names,
// and that is the command's own test.
test("names the known rules when the flag names none of them", () => {
  const { status, stderr } = cli("--no-typo", glob);
  expect(status).toBe(2);
  expect(stderr).toBe('valof-lint: no rule called "typo"\n' + `  known rules: ${kinds.join(", ")}`);
});

test("passes the flag through to the run", () => {
  const { stdout } = cli("--no-duplicate-brand", glob);
  expect(stdout).toBe(
    "tests/lint/skip/fixtures/mixed/users.ts:6:3  unused-member  User.shout is never read\n",
  );
});
