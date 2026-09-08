import { expect, test } from "vite-plus/test";

import { fixtures } from "../../support.ts";

const { lint } = fixtures(import.meta.url);

test("reports a directive that names no rule, and lets it go on silencing", async () => {
  expect(await lint("bare")).toEqual([
    "bare.ts:2:3  bare-disable  valof-lint-disable-next-line names no rule; name the ones it silences",
  ]);
});

test("says nothing when the directive names one", async () => {
  expect(await lint("named")).toEqual([]);
});
