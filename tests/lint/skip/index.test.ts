import { expect, test } from "vite-plus/test";

import { kinds } from "../../../src/lint/index.ts";
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

// A rule about the disable comments is left out like any other. The host plugin sets their
// severity like any other too, and refusing here would only differ from that.
test("leaves out a rule about the disable comments, like any other", async () => {
  expect(await lint("guarded")).toEqual([
    "guarded.ts:1:1  incomplete-disable  valof-lint-disable names no scope; write valof-lint-disable-next-line or valof-lint-disable-whole-file",
    "guarded.ts:3:1  unused-disable  valof-lint-disable-whole-file names structural-equals, which reports nothing in this file",
  ]);
  expect(await lint("guarded", { skip: ["incomplete-disable", "unused-disable"] })).toEqual([]);
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
