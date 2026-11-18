import { expect, test } from "vite-plus/test";

import { InferredValOf, fixtures } from "../integration/support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a lift that takes its type from what it is assigned to", async () => {
  expect(await lint("inferred")).toEqual([
    {
      rule: InferredValOf,
      at: "inferred.ts:5:31",
    },
  ]);
  expect(await messages("inferred")).toEqual([
    "Val.of names no type here, and takes one from its target",
  ]);
});

test("reports one that takes it from the parameter it is passed to", async () => {
  expect(await lint("in-an-argument")).toEqual([
    {
      rule: InferredValOf,
      at: "in-an-argument.ts:7:56",
    },
  ]);
});

test("says nothing where the lift names its type", async () => {
  expect(await lint("named")).toEqual([]);
});
