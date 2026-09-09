import { expect, test } from "vite-plus/test";

import { kinds, skippable } from "../../../src/lint/index.ts";
import {
  DuplicateBrand,
  IncompleteDisable,
  UnusedDisable,
  UnusedMember,
  cli,
  fixtures,
} from "../support.ts";

const { lint } = fixtures(import.meta.url);

const glob = "tests/lint/skip/fixtures/mixed/**/*.ts";

test("leaves out the kind the flag names, and only that one", async () => {
  expect(await lint("mixed")).toEqual([
    {
      rule: DuplicateBrand,
      at: "mixed/orders.ts:3:13",
    },
    {
      rule: DuplicateBrand,
      at: "mixed/users.ts:3:13",
    },
    { rule: UnusedMember, at: "mixed/users.ts:6:3" },
  ]);
  expect(await lint("mixed", { skip: [DuplicateBrand] })).toEqual([
    { rule: UnusedMember, at: "mixed/users.ts:6:3" },
  ]);
  expect(await lint("mixed", { skip: [UnusedMember] })).toEqual([
    {
      rule: DuplicateBrand,
      at: "mixed/orders.ts:3:13",
    },
    {
      rule: DuplicateBrand,
      at: "mixed/users.ts:3:13",
    },
  ]);
});

test("takes more than one, and leaves nothing once every kind is out", async () => {
  expect(await lint("mixed", { skip: [DuplicateBrand, UnusedMember] })).toEqual([]);
});

test("keeps a rule guarding the directives in, whatever the caller asks", async () => {
  expect(await lint("guarded", { skip: [IncompleteDisable, UnusedDisable] })).toEqual([
    {
      rule: IncompleteDisable,
      at: "guarded.ts:1:1",
    },
    {
      rule: UnusedDisable,
      at: "guarded.ts:3:1",
    },
  ]);
});

test("refuses the flag for one of those, and says which rules take it", () => {
  const { status, stderr } = cli("--no-incomplete-disable", glob);
  expect(status).toBe(2);
  expect(stderr).toBe(
    "valof-lint: incomplete-disable always runs, since it guards the disable comments\n" +
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
    `tests/lint/skip/fixtures/mixed/users.ts:6:3  ${UnusedMember.kind}  User.shout is never read\n`,
  );
});
