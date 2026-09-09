import { expect, test } from "vite-plus/test";

import { UnusedDisable, UnusedMember, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("says nothing when the directive silenced something", async () => {
  expect(await lint("used")).toEqual([]);
});

test("reports the directive when the rule it names finds nothing there", async () => {
  expect(await lint("unused")).toEqual([
    {
      rule: UnusedDisable,
      at: "unused.ts:2:3",
    },
  ]);
  expect(await messages("unused")).toEqual([
    "valof-lint-disable-next-line names unused-member, which reports nothing here",
  ]);
});

test("names the one that silenced nothing, not the whole directive", async () => {
  expect(await lint("partly-used")).toEqual([
    {
      rule: UnusedDisable,
      at: "partly-used.ts:2:3",
    },
  ]);
  expect(await messages("partly-used")).toEqual([
    "valof-lint-disable-next-line names duplicate-brand, which reports nothing here",
  ]);
});

test("says a whole-file directive reports nothing in the file, not here", async () => {
  expect(await lint("whole-file")).toEqual([
    {
      rule: UnusedDisable,
      at: "whole-file.ts:1:1",
    },
  ]);
});

test("blames no rule that was left out of the run", async () => {
  expect(await lint("unused", { skip: [UnusedMember] })).toEqual([]);
});
