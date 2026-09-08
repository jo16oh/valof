import { afterAll, beforeAll, expect, test } from "vite-plus/test";

import { resolver, type Resolver } from "../../../../src/lint/index.ts";
import { fixtures, root, spy } from "../../support.ts";

const { all, lint: over } = fixtures(import.meta.url);

// The only rule that resolves names, so the only one that needs a language server. One shared
// across the file: starting one costs about 85 ms.
let types: Resolver | undefined;
beforeAll(() => {
  types = resolver(root, all());
});
afterAll(() => types?.close());

const lint = (fixture: string): Promise<string[]> => over(fixture, { types });

test("reports a parent that structurally compares a child carrying its own equality", async () => {
  expect(await lint("plain")).toEqual([
    "plain/order.ts:6:22  structural-equals  Order.total holds Money, which has its own equals",
  ]);
});

test("says nothing when the spec names the key", async () => {
  expect(await lint("covered")).toEqual([]);
});

test("says nothing when an entry above the path speaks for it", async () => {
  expect(await lint("covered-above")).toEqual([]);
});

test("takes a one-element array spec as speaking for every element", async () => {
  expect(await lint("array-spec")).toEqual([]);
});

test("says nothing when the parent wrote the whole comparison itself", async () => {
  expect(await lint("override")).toEqual([]);
});

test("counts dropping a key from equality as having looked at it", async () => {
  expect(await lint("excluded")).toEqual([]);
});

test("names the path through a plain nested object", async () => {
  expect(await lint("nested")).toEqual([
    "nested/order.ts:6:22  structural-equals  Order.shipping.fee holds Money, which has its own equals",
  ]);
});

test("names the element position, spelled `readonly T[]` or `ReadonlyArray<T>`", async () => {
  expect(await lint("array")).toEqual([
    "array/order.ts:6:22  structural-equals  Order.charges[] holds Money, which has its own equals",
    "array/order.ts:6:22  structural-equals  Order.refunds[] holds Money, which has its own equals",
  ]);
});

test("reports every level at once, so fixing one does not uncover another", async () => {
  expect(await lint("cascade")).toEqual([
    "cascade/line.ts:6:26  structural-equals  OrderLine.total holds Money, which has its own equals",
    "cascade/order.ts:6:22  structural-equals  Order.lines[] holds OrderLine, which has its own equals",
  ]);
});

test("leaves a `PayloadOf` field alone, which has no brand to dispatch on", async () => {
  expect(await lint("payload-of")).toEqual([]);
});

test("says nothing about a type whose equals nothing can call", async () => {
  expect(await lint("no-companion")).toEqual([]);
});

test("is silenced by a directive above the companion", async () => {
  expect(await lint("silenced")).toEqual([]);
});

// What the rule costs, rather than what it reports. Both claims are the same one: a TypeScript is
// started only once something could dispatch.

test("asks the type checker nothing where no companion states its equality", async () => {
  const counted = spy();
  await over("no-equality", { types: counted });
  expect(counted.asked()).toBe(0);
});

test("asks it nothing either when the rule is left out of the run", async () => {
  const counted = spy();
  await over("plain", { types: counted, skip: ["structural-equals"] });
  expect(counted.asked()).toBe(0);
  await over("plain", { types: counted });
  expect(counted.asked()).toBeGreaterThan(0);
});
