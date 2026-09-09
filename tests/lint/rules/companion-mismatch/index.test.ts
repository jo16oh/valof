import { expect, test } from "vite-plus/test";

import { fixtures } from "../../support.ts";

const { lint } = fixtures(import.meta.url);

test("says nothing when the companion carries the name of its type", async () => {
  expect(await lint("matching")).toEqual([]);
});

test("names the type the companion should have been named after", async () => {
  expect(await lint("mismatched")).toEqual([
    "mismatched.ts:5:7  companion-mismatch  Account is the companion for User, and should be named User",
  ]);
});

test("reports a builder held in a variable, which names the constructor twice", async () => {
  expect(await lint("held-in-a-variable")).toEqual([
    "held-in-a-variable.ts:5:7  companion-mismatch  seal is the companion for User, and should be named User",
  ]);
});

// The type is elsewhere, which is the split-companion rule's finding, not this one's.
test("steps past a namespace, so the name it compares is the declaring module's", async () => {
  expect(await lint("namespaced", { skip: ["split-companion"] })).toEqual([]);
});

test("says nothing about a chain bound to no plain name", async () => {
  expect(await lint("no-name")).toEqual([]);
});
