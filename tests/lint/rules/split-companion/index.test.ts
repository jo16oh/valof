import { expect, test } from "vite-plus/test";

import { fixtures } from "../../support.ts";

const { lint } = fixtures(import.meta.url);

test("says nothing when the companion sits beside the type it is for", async () => {
  expect(await lint("beside")).toEqual([]);
});

test("reports a companion for a type another file declares", async () => {
  expect(await lint("imported")).toEqual([
    "imported/companion.ts:5:25  split-companion  User is declared in another file, where its companion belongs",
  ]);
});

test("reports a type reached through a namespace, which is another module by definition", async () => {
  expect(await lint("namespaced")).toEqual([
    "namespaced/companion.ts:5:31  split-companion  User is declared in another file, where its companion belongs",
  ]);
});

test("sees the chain however `Val` was imported", async () => {
  expect(await lint("renamed-val")).toEqual([
    "renamed-val/companion.ts:5:27  split-companion  User is declared in another file, where its companion belongs",
  ]);
});
