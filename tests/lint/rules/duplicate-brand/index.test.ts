import { expect, test } from "vite-plus/test";

import { BrandMismatch, DuplicateBrand, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports every alias when three claim the same brand", async () => {
  expect(await lint("duplicate")).toEqual([
    {
      rule: DuplicateBrand,
      at: "duplicate/billing.ts:1:13",
    },
    {
      rule: DuplicateBrand,
      at: "duplicate/inventory.ts:1:13",
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

test("reports duplicate Trait brands", async () => {
  expect(await lint("trait", { skip: [BrandMismatch] })).toEqual([
    {
      rule: DuplicateBrand,
      at: "trait/first.ts:3:13",
    },
    {
      rule: DuplicateBrand,
      at: "trait/second.ts:3:13",
    },
  ]);
});

test("keeps Val and Trait brand domains separate", async () => {
  expect(await lint("separate-domains", { skip: [BrandMismatch] })).toEqual([]);
});

test("reports an enum beside a hand-written Val claiming one of its variant brands", async () => {
  expect(await lint("variant", { skip: [BrandMismatch] })).toEqual([
    { rule: DuplicateBrand, at: "variant/circle.ts:3:13" },
    { rule: DuplicateBrand, at: "variant/shape.ts:3:13" },
  ]);
  expect(await messages("variant", { skip: [BrandMismatch] })).toEqual([
    'Circle claims the brand "Shape.Circle", and so does another type',
    'Shape derives the brand "Shape.Circle", and so does another type',
  ]);
});

test("reports each of two enums of one name once, not once per variant", async () => {
  expect(await lint("two-enums")).toEqual([
    { rule: DuplicateBrand, at: "two-enums/first.ts:3:13" },
    { rule: DuplicateBrand, at: "two-enums/second.ts:3:13" },
  ]);
});

test("claims no variant brand where the declaration does not settle the variants", async () => {
  expect(await lint("unsettled", { skip: [BrandMismatch] })).toEqual([]);
});
