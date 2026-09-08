import { expect, test } from "vite-plus/test";

import { fixtures } from "../../support.ts";

const { lint } = fixtures(import.meta.url);

test("reports a directive that names no rule, and lets it go on silencing", async () => {
  expect(await lint("bare")).toEqual([
    "bare.ts:2:3  incomplete-disable  valof-lint-disable-next-line names no rule; name the ones it silences",
  ]);
});

test("asks a whole-file directive for its rules, or for the spelling that means every one", async () => {
  expect(await lint("whole-file")).toEqual([
    "whole-file.ts:1:1  incomplete-disable  valof-lint-disable-whole-file names no rule; name the ones it silences, or valof-lint-disable-all-whole-file for every one",
    'whole-file.ts:3:13  brand-mismatch  OrderId claims the brand "Id", which should be "OrderId"',
  ]);
});

test("says nothing when the directive names one", async () => {
  expect(await lint("named")).toEqual([]);
});
