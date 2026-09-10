import { expect, test } from "vite-plus/test";

import { BrandMismatch, DuplicateBrand, fixtures } from "../../support.ts";

const { lint } = fixtures(import.meta.url);

test("reports every alias that claims a brand another one claims", async () => {
  expect(await lint("duplicate")).toEqual([
    {
      rule: DuplicateBrand,
      at: "duplicate/billing.ts:1:13",
    },
    {
      rule: DuplicateBrand,
      at: "duplicate/orders.ts:1:13",
    },
  ]);
});

test("reports colliding aliases in the same file", async () => {
  expect(await lint("same-file", { skip: [BrandMismatch] })).toEqual([
    {
      rule: DuplicateBrand,
      at: "same-file.ts:1:13",
    },
    {
      rule: DuplicateBrand,
      at: "same-file.ts:2:13",
    },
  ]);
});

test("says nothing when each brand is claimed once", async () => {
  expect(await lint("namespaced")).toEqual([]);
});

test("ignores an alias that is not at the top level, which nothing can import", async () => {
  expect(await lint("block-scoped")).toEqual([]);
});

test("ignores a generic brand, which names nothing to collide over", async () => {
  expect(await lint("generic")).toEqual([]);
});
