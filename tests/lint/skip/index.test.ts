import { expect, test } from "vite-plus/test";

import { cli, fixtures } from "../support.ts";

const { lint } = fixtures(import.meta.url);

const glob = "tests/lint/skip/fixtures/mixed/**/*.ts";

test("leaves out the kind the flag names, and only that one", async () => {
  expect(await lint("mixed")).toEqual([
    'mixed/orders.ts:3:13  duplicate-brand  UserId claims the brand "Id", and so does another type',
    'mixed/users.ts:3:13  duplicate-brand  Id claims the brand "Id", and so does another type',
    "mixed/users.ts:6:3  unused-member  User.shout is never read",
  ]);
  expect(await lint("mixed", { skip: ["duplicate-brand"] })).toEqual([
    "mixed/users.ts:6:3  unused-member  User.shout is never read",
  ]);
  expect(await lint("mixed", { skip: ["unused-member"] })).toEqual([
    'mixed/orders.ts:3:13  duplicate-brand  UserId claims the brand "Id", and so does another type',
    'mixed/users.ts:3:13  duplicate-brand  Id claims the brand "Id", and so does another type',
  ]);
});

test("takes more than one, and leaves nothing once every kind is out", async () => {
  expect(await lint("mixed", { skip: ["duplicate-brand", "unused-member"] })).toEqual([]);
});

test("names the known rules when the flag names none of them", () => {
  const { status, stderr } = cli("--no-typo", glob);
  expect(status).toBe(2);
  expect(stderr).toBe(
    'valof-lint: no rule called "typo"\n' +
      "  known rules: unused-member, duplicate-brand, structural-equals",
  );
});

test("passes the flag through to the run", () => {
  const { stdout } = cli("--no-duplicate-brand", glob);
  expect(stdout).toBe(
    "tests/lint/skip/fixtures/mixed/users.ts:6:3  unused-member  User.shout is never read\n",
  );
});
