import { expect, test } from "vite-plus/test";

import { BrandMismatch, IncompleteDisable, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a directive that names no rule, and lets it go on silencing", async () => {
  expect(await lint("bare")).toEqual([
    {
      rule: IncompleteDisable,
      at: "bare.ts:2:3",
    },
  ]);
  expect(await messages("bare")).toEqual([
    "valof-lint-disable-next-line names no rule; name the ones it silences",
  ]);
});

test("asks a whole-file directive for its rules, or for the spelling that means every one", async () => {
  expect(await lint("whole-file")).toEqual([
    {
      rule: IncompleteDisable,
      at: "whole-file.ts:1:1",
    },
    {
      rule: BrandMismatch,
      at: "whole-file.ts:3:13",
    },
  ]);
  expect(await messages("whole-file")).toEqual([
    "valof-lint-disable-whole-file names no rule; name the ones it silences, or " +
      "valof-lint-disable-all-whole-file for every one",
    'OrderId claims the brand "Id", which should be "OrderId"',
  ]);
});

test("says nothing when the directive names one", async () => {
  expect(await lint("named")).toEqual([]);
});
