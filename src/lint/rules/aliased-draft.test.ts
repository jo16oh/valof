import { expect, test } from "vite-plus/test";

import { AliasedDraft, fixtures } from "../integration-tests/support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a recipe's draft bound, passed, or put in an array or an object", async () => {
  expect(await lint("aliases")).toEqual(
    ["10:16", "14:17", "17:27", "20:17", "20:22", "24:9"].map((at) => ({
      rule: AliasedDraft,
      at: `aliases.ts:${at}`,
    })),
  );
  expect((await messages("aliases"))[0]).toBe(
    "a recipe uses its draft only to reach a field; branch on the Val you patch, or pass the field itself (`d.total`)",
  );
});

test("spares a field read, a field write, a spread, and a name the recipe shadows", async () => {
  expect(await lint("fields")).toEqual([]);
});

test("reports a recipe with type parameters, whose draft the types cannot check", async () => {
  expect(await lint("generic")).toEqual(
    ["8:20", "11:20", "14:13"].map((at) => ({ rule: AliasedDraft, at: `generic.ts:${at}` })),
  );
  expect((await messages("generic"))[0]).toBe(
    "a recipe takes no type parameters; leave the draft's type to inference",
  );
});
