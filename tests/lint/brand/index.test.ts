import { expect, test } from "vite-plus/test";

import { fixtures } from "../support.ts";

const { lint } = fixtures(import.meta.url);

test("reports every alias that claims a brand another one claims", async () => {
  expect(await lint("duplicate")).toEqual([
    'duplicate/billing.ts:1:13  duplicate-brand  Id claims the brand "Id", and so does another type',
    'duplicate/orders.ts:1:13  duplicate-brand  OrderId claims the brand "Id", and so does another type',
  ]);
});

test("says nothing when each brand is claimed once", async () => {
  expect(await lint("namespaced")).toEqual([]);
});

test("finds the collision when Val is renamed, or imported for its type alone", async () => {
  expect(await lint("renamed-val")).toEqual([
    'renamed-val/billing.ts:3:13  duplicate-brand  Id claims the brand "Id", and so does another type',
    'renamed-val/orders.ts:3:13  duplicate-brand  OrderId claims the brand "Id", and so does another type',
  ]);
});

test("finds the collision when Val is reached through a namespace import", async () => {
  expect(await lint("namespaced-val")).toEqual([
    'namespaced-val/billing.ts:3:13  duplicate-brand  Id claims the brand "Id", and so does another type',
    'namespaced-val/orders.ts:3:13  duplicate-brand  OrderId claims the brand "Id", and so does another type',
  ]);
});

test("ignores something else bound to the name Val", async () => {
  expect(await lint("shadowed-val")).toEqual([]);
});

test("ignores an alias over something that is not a Val", async () => {
  expect(await lint("not-a-val")).toEqual([]);
});

test("ignores an alias that is not at the top level, which nothing can import", async () => {
  expect(await lint("block-scoped")).toEqual([]);
});

test("ignores a generic brand, which names nothing to collide over", async () => {
  expect(await lint("generic")).toEqual([]);
});
