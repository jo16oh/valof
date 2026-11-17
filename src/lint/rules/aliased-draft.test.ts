import { expect, test } from "vite-plus/test";

import { AliasedDraft, fixtures } from "../integration-tests/support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a recipe's draft bound, passed, or put in an array or an object", async () => {
  expect(await lint("aliases")).toEqual(
    ["10:17", "14:9", "17:17", "20:17", "20:23", "24:9"].map((at) => ({
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
