import { expect, test } from "vite-plus/test";

import { fixtures } from "../support.ts";

const { lint } = fixtures(import.meta.url);

test("silences every kind when the directive lists none", async () => {
  expect(await lint("whole-line")).toEqual([
    "whole-line.ts:2:3  incomplete-disable  valof-lint-disable-next-line names no rule; name the ones it silences",
    "whole-line.ts:4:3  unused-member  User.whisper is never read",
  ]);
});

test("silences the kind it lists, and ignores the note after `--`", async () => {
  expect(await lint("by-kind")).toEqual([]);
});

test("leaves a finding of another kind alone", async () => {
  expect(await lint("wrong-kind")).toEqual([
    "wrong-kind.ts:2:3  unused-disable  valof-lint-disable-next-line names duplicate-brand, which reports nothing here",
    "wrong-kind.ts:3:3  unused-member  User.shout is never read",
  ]);
});

test("takes more than one kind on a line, separated by a space or a comma", async () => {
  expect(await lint("two-kinds")).toEqual([
    'two-kinds.ts:7:13  brand-mismatch  CartId claims the brand "Id", which should be "CartId"',
    'two-kinds.ts:7:13  duplicate-brand  CartId claims the brand "Id", and so does another type',
  ]);
});

test("reads the whole comment block, not only the comment touching the line", async () => {
  expect(await lint("comment-block")).toEqual([]);
});

test("silences a duplicate brand, and only at the alias that asked", async () => {
  expect(await lint("duplicate-brand")).toEqual([
    'duplicate-brand/orders.ts:1:13  duplicate-brand  Id claims the brand "Id", and so does another type',
  ]);
});

test("silences the whole file, its own report with it, when the directive says so", async () => {
  expect(await lint("whole-file")).toEqual([]);
});

test("silences nothing when the directive names no scope, and says which to write", async () => {
  expect(await lint("no-scope")).toEqual([
    "no-scope.ts:1:1  incomplete-disable  valof-lint-disable names no scope; write valof-lint-disable-next-line or valof-lint-disable-whole-file",
    "no-scope.ts:4:3  unused-member  User.shout is never read",
  ]);
});

test("silences the whole file for the kind it names, and leaves the others reporting", async () => {
  expect(await lint("whole-file-kind")).toEqual([
    'whole-file-kind.ts:3:13  brand-mismatch  OrderId claims the brand "Id", which should be "OrderId"',
  ]);
});

test("takes neither spelling when something follows it, which is a typo and not a directive", async () => {
  expect(await lint("misspelled")).toEqual([
    "misspelled.ts:3:3  unused-member  User.shout is never read",
  ]);
});

test("stops at a blank line, which starts a block of its own", async () => {
  expect(await lint("not-a-block")).toEqual([
    "not-a-block.ts:2:3  incomplete-disable  valof-lint-disable-next-line names no rule; name the ones it silences",
    "not-a-block.ts:5:3  unused-member  User.shout is never read",
  ]);
});

test("ignores a directive trailing code, which belongs to no block", async () => {
  expect(await lint("after-code")).toEqual([
    "after-code.ts:2:3  unused-member  User.shout is never read",
  ]);
});
