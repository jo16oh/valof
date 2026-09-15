import { expect, test } from "vite-plus/test";

import { kinds } from "../../../src/lint/index.ts";
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

// A rule about the disable comments is left out like any other. The host plugin sets their
// severity like any other too, and refusing here would only differ from that.
test("leaves out a rule about the disable comments, like any other", async () => {
  expect(await lint("guarded")).toEqual([
    {
      rule: IncompleteDisable,
      at: "guarded.ts:1:1",
    },
    {
      rule: UnusedDisable,
      at: "guarded.ts:3:1",
    },
  ]);
  expect(await lint("guarded", { skip: [IncompleteDisable, UnusedDisable] })).toEqual([]);
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

test("takes more than one flag", () => {
  const { status, stdout, stderr } = cli("--no-duplicate-brand", "--no-unused-member", glob);
  expect(stdout).toBe("");
  expect(status).toBe(0);
  expect(stderr).toBe("valof-lint: nothing to report in 2 file(s)");
});
