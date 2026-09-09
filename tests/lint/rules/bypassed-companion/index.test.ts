import { expect, test } from "vite-plus/test";

import { BypassedCompanion, fixtures } from "../../support.ts";

const { lint } = fixtures(import.meta.url);

test("names the constructor a sealer already gives the type", async () => {
  expect(await lint("constructor")).toEqual([
    {
      rule: BypassedCompanion,
      at: "constructor.ts:9:52",
      message: "Val.of<User> bypasses User, the constructor for it",
    },
  ]);
});

test("names the seal that the lift skips", async () => {
  expect(await lint("seal")).toEqual([
    {
      rule: BypassedCompanion,
      at: "seal.ts:7:39",
      message: "Val.of<Age> bypasses Age.seal, which checks the payload",
    },
  ]);
});

test("says what is missing where the companion has no seal to name", async () => {
  expect(await lint("no-seal")).toEqual([
    {
      rule: BypassedCompanion,
      at: "no-seal.ts:9:68",
      message: "Val.of<Row> brands a payload that no seal checked",
    },
  ]);
});

test("says nothing where the type has no companion", async () => {
  expect(await lint("no-companion")).toEqual([]);
});

test("follows a renamed import to the companion in the other file", async () => {
  expect(await lint("renamed-import")).toEqual([
    {
      rule: BypassedCompanion,
      at: "renamed-import/boundary.ts:6:26",
      message: "Val.of<Account> bypasses User, the constructor for it",
    },
  ]);
});
