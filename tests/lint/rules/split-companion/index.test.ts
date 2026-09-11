import { expect, test } from "vite-plus/test";

import { SplitCompanion, fixtures } from "../../support.ts";

const { lint } = fixtures(import.meta.url);

test("says nothing when the companion sits beside the type it is for", async () => {
  expect(await lint("beside")).toEqual([]);
});

test("reports a companion for a type another file declares", async () => {
  expect(await lint("imported")).toEqual([
    {
      rule: SplitCompanion,
      at: "imported/companion.ts:5:25",
    },
  ]);
});

test("reports a type reached through a namespace, which is another module by definition", async () => {
  expect(await lint("namespaced")).toEqual([
    {
      rule: SplitCompanion,
      at: "namespaced/companion.ts:5:31",
    },
  ]);
});

test("sees the chain however `Val` was imported", async () => {
  expect(await lint("renamed-val")).toEqual([
    {
      rule: SplitCompanion,
      at: "renamed-val/companion.ts:5:27",
    },
  ]);
});

test("reports a Trait companion split from its declaration", async () => {
  expect(await lint("trait")).toEqual([{ rule: SplitCompanion, at: "trait/companion.ts:3:51" }]);
});
