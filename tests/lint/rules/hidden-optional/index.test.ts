import { expect, test } from "vite-plus/test";

import {
  HiddenOptional,
  cliWithTypeScript70,
  cliWithoutTypeScript,
  fixtures,
} from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

const under = "tests/lint/rules/hidden-optional/fixtures";

test("reports a default or a rest parameter the annotation declares, in this file or another", async () => {
  expect(await lint("members")).toEqual([
    { rule: HiddenOptional, at: "members/helpers.ts:3:61" },
    { rule: HiddenOptional, at: "members/user.ts:8:28" },
    { rule: HiddenOptional, at: "members/user.ts:9:52" },
    { rule: HiddenOptional, at: "members/user.ts:18:37" },
  ]);
  const hides = (name: string, what: string): string =>
    `the annotation on ${name} declares the parameter this ${what} makes optional, so a call with the value last finds the wrong arity; drop the ${what}, or write the member inline`;
  expect(await messages("members")).toEqual([
    hides("shout", "default"),
    hides("toWire", "default"),
    hides("tags", "rest parameter"),
    hides("labels.label", "default"),
  ]);
});

test("reads no annotation on a const that no step takes, and needs no TypeScript for it", async () => {
  expect(await lint("unused")).toEqual([]);
  expect(cliWithoutTypeScript(`${under}/unused`).status).toBe(0);
});

test("asks for TypeScript 7.1 where an annotated member has a default, with none or 7.0 installed", () => {
  for (const run of [cliWithoutTypeScript, cliWithTypeScript70]) {
    const { status, stderr } = run(`${under}/members`);
    expect(status).toBe(2);
    expect(stderr).toBe(
      "valof-lint needs TypeScript 7.1 or later to read the annotations here. valof does not install it for you.\n  pnpm add -D typescript",
    );
  }
});
