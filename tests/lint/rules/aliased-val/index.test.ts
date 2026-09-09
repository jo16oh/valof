import { expect, test } from "vite-plus/test";

import { fixtures } from "../../support.ts";

const { lint } = fixtures(import.meta.url);

test("names the Val a second name stands for", async () => {
  expect(await lint("imported")).toEqual([
    "imported/local.ts:3:13  aliased-val  Account is a second name for User; use User",
  ]);
});

test("follows a chain of them, so fixing one does not uncover the next", async () => {
  expect(await lint("chain")).toEqual([
    "chain/names.ts:3:13  aliased-val  Account is a second name for User; use User",
    "chain/names.ts:4:13  aliased-val  Customer is a second name for User; use User",
  ]);
});

// The companion sits beside the second name, so split-companion sees a local type and says
// nothing. This is the rule that covers that hole.
test("reports the local alias a companion was built on", async () => {
  expect(await lint("companion")).toEqual([
    "companion/local.ts:5:6  aliased-val  Local is a second name for User; use User",
  ]);
});

test("leaves a union, a wrapped type and a generic alias alone", async () => {
  expect(await lint("not-a-second-name")).toEqual([]);
});
