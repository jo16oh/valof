import { expect, test } from "vite-plus/test";

import { UnusedDisable, UnusedMember, fixtures } from "../integration/support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports the directive when the rule it names finds nothing there", async () => {
  expect(await lint("unused")).toEqual([
    {
      rule: UnusedDisable,
      at: "unused.ts:3:3",
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
      at: "partly-used.ts:3:3",
    },
  ]);
  expect(await messages("partly-used")).toEqual([
    "valof-lint-disable-next-line names duplicate-brand, which reports nothing here",
  ]);
});

test("reports a name written twice once", async () => {
  expect(await messages("repeated")).toEqual([
    "valof-lint-disable-next-line names unused-member, which reports nothing here",
  ]);
});

test("says a whole-file directive reports nothing in the file, not here", async () => {
  expect(await lint("whole-file")).toEqual([
    {
      rule: UnusedDisable,
      at: "whole-file.ts:2:1",
    },
  ]);
  expect(await messages("whole-file")).toEqual([
    "valof-lint-disable-whole-file names duplicate-brand, which reports nothing in this file",
  ]);
});

test("blames no rule that was left out of the run", async () => {
  expect(await lint("unused", { skip: [UnusedMember] })).toEqual([]);
});

test("blames an opt-in rule only when the run turned it on", async () => {
  expect(await lint("opt-in")).toEqual([]);
  expect(await lint("opt-in-unused", { enable: { "data-type-outside-valof": {} } })).toEqual([
    { rule: UnusedDisable, at: "opt-in-unused.ts:1:1" },
  ]);
});

test("reports a name that is an Object.prototype key, which no rule has", async () => {
  expect(await lint("prototype-key")).toEqual([
    { rule: UnusedDisable, at: "prototype-key.ts:2:1" },
  ]);
});
