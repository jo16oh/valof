import { expect, test } from "vite-plus/test";

import { UnnecessaryAlias, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("names the Val a second name stands for", async () => {
  expect(await lint("imported")).toEqual([
    {
      rule: UnnecessaryAlias,
      at: "imported/local.ts:3:13",
    },
  ]);
  expect(await messages("imported")).toEqual(["Account is a second name for User; use User"]);
});

test("follows a chain of them, so fixing one does not uncover the next", async () => {
  expect(await lint("chain")).toEqual([
    {
      rule: UnnecessaryAlias,
      at: "chain/names.ts:3:13",
    },
    {
      rule: UnnecessaryAlias,
      at: "chain/names.ts:4:13",
    },
  ]);
  expect(await messages("chain")).toEqual([
    "Account is a second name for User; use User",
    "Customer is a second name for User; use User",
  ]);
});

// The companion sits beside the second name, so split-companion sees a local type and says
// nothing. This is the rule that covers that hole.
test("reports the local alias a companion was built on", async () => {
  expect(await lint("companion")).toEqual([
    {
      rule: UnnecessaryAlias,
      at: "companion/local.ts:5:6",
    },
  ]);
  expect(await messages("companion")).toEqual(["Local is a second name for User; use User"]);
});

test("leaves a union, a wrapped type and a generic alias alone", async () => {
  expect(await lint("not-a-second-name")).toEqual([]);
});

test("reports a second name for a Trait", async () => {
  expect(await lint("trait")).toEqual([{ rule: UnnecessaryAlias, at: "trait.ts:3:13" }]);
  expect(await messages("trait")).toEqual([
    "Friendly is a second name for Greetable; use Greetable",
  ]);
});

test("looks through parentheses around a second name", async () => {
  expect(await lint("parenthesized")).toEqual([
    { rule: UnnecessaryAlias, at: "parenthesized.ts:4:13" },
    { rule: UnnecessaryAlias, at: "parenthesized.ts:5:13" },
  ]);
});
