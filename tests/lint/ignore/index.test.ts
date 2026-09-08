import { expect, test } from "vite-plus/test";

import { fixtures } from "../support.ts";

const { lint } = fixtures(import.meta.url);

test("silences every kind when the directive lists none", async () => {
  expect(await lint("whole-line")).toEqual([
    "whole-line.ts:2:3  bare-disable  valof-lint-disable-next-line names no rule; name the ones it silences",
    "whole-line.ts:4:3  unused-member  User.whisper is never read",
  ]);
});

test("silences the kind it lists, and ignores the note after `--`", async () => {
  expect(await lint("by-kind")).toEqual([]);
});

test("leaves a finding of another kind alone", async () => {
  expect(await lint("wrong-kind")).toEqual([
    "wrong-kind.ts:3:3  unused-member  User.shout is never read",
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

test("stops at a blank line, which starts a block of its own", async () => {
  expect(await lint("not-a-block")).toEqual([
    "not-a-block.ts:2:3  bare-disable  valof-lint-disable-next-line names no rule; name the ones it silences",
    "not-a-block.ts:5:3  unused-member  User.shout is never read",
  ]);
});

test("ignores a directive trailing code, which belongs to no block", async () => {
  expect(await lint("after-code")).toEqual([
    "after-code.ts:2:3  unused-member  User.shout is never read",
  ]);
});
