import { expect, test } from "vite-plus/test";

import { HiddenOptional, cliWithoutTypeScript, fixtures } from "../../support.ts";

const { lint, messages } = fixtures(import.meta.url);

test("reports a default or a rest parameter the annotation declares, in this file or another", async () => {
  expect(await lint("members")).toEqual([
    { rule: HiddenOptional, at: "members/helpers.ts:3:61" },
    { rule: HiddenOptional, at: "members/user.ts:8:28" },
    { rule: HiddenOptional, at: "members/user.ts:9:52" },
    { rule: HiddenOptional, at: "members/user.ts:18:37" },
  ]);
});

test("says what the annotation hides and what it breaks", async () => {
  expect((await messages("members"))[1]).toBe(
    "the annotation on toWire declares the parameter this default makes optional, so a call with the value last finds the wrong arity; drop the default, or write the member inline",
  );
});

test("needs TypeScript only where an annotation hides something", () => {
  const under = "tests/lint/rules/hidden-optional/fixtures";
  expect(cliWithoutTypeScript(`${under}/plain`).status).toBe(0);
  const { status, stderr } = cliWithoutTypeScript(`${under}/members`);
  expect(status).toBe(2);
  expect(stderr).toContain("pnpm add -D typescript");
});
