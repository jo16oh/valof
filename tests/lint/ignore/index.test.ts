import { expect, test } from "vite-plus/test";

import {
  BrandMismatch,
  DuplicateBrand,
  IncompleteDisable,
  UnusedDisable,
  UnusedMember,
  fixtures,
} from "../support.ts";

const { lint } = fixtures(import.meta.url);

test("silences every kind when the directive lists none", async () => {
  expect(await lint("whole-line")).toEqual([
    {
      rule: IncompleteDisable,
      at: "whole-line.ts:2:3",
    },
    { rule: UnusedMember, at: "whole-line.ts:4:3" },
  ]);
});

test("silences the kind it lists, and ignores the note after `--`", async () => {
  expect(await lint("by-kind")).toEqual([]);
});

test("leaves a finding of another kind alone", async () => {
  expect(await lint("wrong-kind")).toEqual([
    {
      rule: UnusedDisable,
      at: "wrong-kind.ts:2:3",
    },
    { rule: UnusedMember, at: "wrong-kind.ts:3:3" },
  ]);
});

test("takes more than one kind on a line, separated by a space or a comma", async () => {
  expect(await lint("two-kinds")).toEqual([
    {
      rule: BrandMismatch,
      at: "two-kinds.ts:7:13",
    },
    {
      rule: DuplicateBrand,
      at: "two-kinds.ts:7:13",
    },
  ]);
});

test("reads the whole comment block, not only the comment touching the line", async () => {
  expect(await lint("comment-block")).toEqual([]);
});

test("lets a directive for every kind swallow one naming a kind in the same block", async () => {
  expect(await lint("every-widens")).toEqual([
    { rule: UnusedDisable, at: "every-widens.ts:2:3" },
    { rule: IncompleteDisable, at: "every-widens.ts:3:3" },
  ]);
});

test("silences a duplicate brand, and only at the alias that asked", async () => {
  expect(await lint("duplicate-brand")).toEqual([
    {
      rule: DuplicateBrand,
      at: "duplicate-brand/orders.ts:1:13",
    },
  ]);
});

test("silences the whole file, its own report with it, when the directive says so", async () => {
  expect(await lint("whole-file")).toEqual([]);
});

test("silences nothing when the directive names no scope, and says which to write", async () => {
  expect(await lint("no-scope")).toEqual([
    {
      rule: IncompleteDisable,
      at: "no-scope.ts:1:1",
    },
    { rule: UnusedMember, at: "no-scope.ts:4:3" },
  ]);
});

test("silences the whole file for the kind it names, and leaves the others reporting", async () => {
  expect(await lint("whole-file-kind")).toEqual([
    {
      rule: BrandMismatch,
      at: "whole-file-kind.ts:3:13",
    },
  ]);
});

test("takes neither spelling when something follows it, which is a typo and not a directive", async () => {
  expect(await lint("misspelled")).toEqual([{ rule: UnusedMember, at: "misspelled.ts:3:3" }]);
});

test("stops at a blank line, which starts a block of its own", async () => {
  expect(await lint("not-a-block")).toEqual([
    {
      rule: IncompleteDisable,
      at: "not-a-block.ts:2:3",
    },
    { rule: UnusedMember, at: "not-a-block.ts:5:3" },
  ]);
});

test("stops a comment block when code follows a comment", async () => {
  expect(await lint("code-breaks-block")).toEqual([
    { rule: IncompleteDisable, at: "code-breaks-block.ts:2:3" },
    { rule: UnusedMember, at: "code-breaks-block.ts:2:38" },
    { rule: UnusedMember, at: "code-breaks-block.ts:4:3" },
  ]);
});

test("ignores a directive trailing code, which belongs to no block", async () => {
  expect(await lint("after-code")).toEqual([{ rule: UnusedMember, at: "after-code.ts:2:3" }]);
});
