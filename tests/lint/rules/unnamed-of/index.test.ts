import { expect, test } from "vite-plus/test";

import { UnnamedOf, fixtures } from "../../support.ts";

const { lint } = fixtures(import.meta.url);

test("reports a lift that takes its type from what it is assigned to", async () => {
  expect(await lint("unnamed")).toEqual([
    {
      rule: UnnamedOf,
      at: "unnamed.ts:5:31",
    },
  ]);
});

test("reports one that takes it from the parameter it is passed to", async () => {
  expect(await lint("in-an-argument")).toEqual([
    {
      rule: UnnamedOf,
      at: "in-an-argument.ts:7:56",
    },
  ]);
});

test("says nothing where the lift names its type", async () => {
  expect(await lint("named")).toEqual([]);
});
