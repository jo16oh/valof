import { expect, test } from "vite-plus/test";

import { BrandMismatch, IncompleteDisable, fixtures } from "../integration/support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("asks a directive that names no rule to name the ones it silences", async () => {
  expect(await messages("bare")).toEqual([
    "valof-lint-disable-next-line names no rule; name the ones it silences",
  ]);
});

test("asks a whole-file directive for its rules, or for the spelling that means every one", async () => {
  expect(await lint("whole-file")).toEqual([
    {
      rule: IncompleteDisable,
      at: "whole-file.ts:2:1",
    },
    {
      rule: BrandMismatch,
      at: "whole-file.ts:4:13",
    },
  ]);
  expect(await messages("whole-file")).toEqual([
    "valof-lint-disable-whole-file names no rule; name the ones it silences, or " +
      "valof-lint-disable-all-whole-file for every one",
    'OrderId claims the brand "Id", which should be "OrderId"',
  ]);
});
