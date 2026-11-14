import { expect, test } from "vite-plus/test";

import {
  BrandMismatch,
  DuplicateBrand,
  VagueDisable,
  UnusedDisable,
  UnusedMember,
  fixtures,
} from "../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("silences every kind when the directive lists none", async () => {
  expect(await lint("whole-line")).toEqual([
    {
      rule: VagueDisable,
      at: "whole-line.ts:3:3",
    },
    { rule: UnusedMember, at: "whole-line.ts:5:3" },
  ]);
});

test("silences the kind it lists, and ignores the note after `--`", async () => {
  expect(await lint("by-kind")).toEqual([]);
});

test("leaves a finding of another kind alone", async () => {
  expect(await lint("wrong-kind")).toEqual([
    {
      rule: UnusedDisable,
      at: "wrong-kind.ts:3:3",
    },
    { rule: UnusedMember, at: "wrong-kind.ts:4:3" },
  ]);
});

test("silences what every directive in a block lists, in either order", async () => {
  expect(await lint("two-in-a-block")).toEqual([
    { rule: UnusedDisable, at: "two-in-a-block.ts:4:3" },
    { rule: UnusedDisable, at: "two-in-a-block.ts:6:3" },
  ]);
});

test("takes more than one kind on a line, separated by a space or a comma", async () => {
  expect(await lint("two-kinds")).toEqual([
    {
      rule: BrandMismatch,
      at: "two-kinds.ts:8:13",
    },
    {
      rule: DuplicateBrand,
      at: "two-kinds.ts:8:13",
    },
  ]);
});

test("reads the whole comment block, not only the comment touching the line", async () => {
  expect(await lint("comment-block")).toEqual([]);
});

test("lets a directive for every kind cover one naming a kind in the same block, in either order", async () => {
  expect(await lint("every-widens")).toEqual([
    { rule: UnusedDisable, at: "every-widens.ts:3:3" },
    { rule: VagueDisable, at: "every-widens.ts:4:3" },
    { rule: VagueDisable, at: "every-widens.ts:6:3" },
    { rule: UnusedDisable, at: "every-widens.ts:7:3" },
  ]);
});

test("silences a duplicate brand, and only at the alias that asked", async () => {
  expect(await lint("no-duplicate-brand")).toEqual([
    {
      rule: DuplicateBrand,
      at: "no-duplicate-brand/orders.ts:2:13",
    },
  ]);
});

test("silences the whole file, its own report with it, when the directive says so", async () => {
  expect(await lint("whole-file")).toEqual([]);
});

test("silences nothing when the directive names no scope, and says which to write", async () => {
  expect(await lint("no-scope")).toEqual([
    {
      rule: VagueDisable,
      at: "no-scope.ts:2:1",
    },
    { rule: UnusedMember, at: "no-scope.ts:5:3" },
  ]);
  expect((await messages("no-scope"))[0]).toBe(
    "valof-lint-disable names no scope; write valof-lint-disable-next-line or " +
      "valof-lint-disable-whole-file",
  );
});

test("silences the whole file for the kind it names, and leaves the others reporting", async () => {
  expect(await lint("whole-file-kind")).toEqual([
    {
      rule: BrandMismatch,
      at: "whole-file-kind.ts:4:13",
    },
  ]);
});

test("silences every kind that two whole-file directives name", async () => {
  expect(await lint("two-whole-file")).toEqual([]);
});

test("takes no spelling that something touches, which is a typo and not a directive", async () => {
  expect(await lint("misspelled")).toEqual([
    { rule: UnusedMember, at: "misspelled.ts:4:3" },
    { rule: UnusedMember, at: "misspelled.ts:6:3" },
  ]);
});

test("stops at a blank line, which starts a block of its own", async () => {
  expect(await lint("not-a-block")).toEqual([
    {
      rule: VagueDisable,
      at: "not-a-block.ts:3:3",
    },
    { rule: UnusedMember, at: "not-a-block.ts:6:3" },
  ]);
});

test("stops a comment block when code follows a comment", async () => {
  expect(await lint("code-breaks-block")).toEqual([
    { rule: VagueDisable, at: "code-breaks-block.ts:3:3" },
    { rule: UnusedMember, at: "code-breaks-block.ts:3:38" },
    { rule: UnusedMember, at: "code-breaks-block.ts:5:3" },
  ]);
});

test("ignores a directive trailing code, which belongs to no block", async () => {
  expect(await lint("after-code")).toEqual([{ rule: UnusedMember, at: "after-code.ts:3:3" }]);
});
