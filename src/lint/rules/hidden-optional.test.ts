import { expect, test } from "vite-plus/test";

import { HiddenOptional, cliWithoutTypeScript, fixtures } from "../tests/support.ts";

const { lint, messages } = fixtures(import.meta.url);

const UNDER = "src/lint/rules/fixtures/hidden-optional";

// The rule gives the same verdict as the development check in `build`: any default or rest
// parameter, whatever the annotation declares.
test("reports a default or a rest parameter under an annotation, in this file or another, and none without an annotation", async () => {
  expect(await lint("members")).toEqual([
    { rule: HiddenOptional, at: "members/helpers.ts:3:61" },
    { rule: HiddenOptional, at: "members/user.ts:8:28" },
    { rule: HiddenOptional, at: "members/user.ts:9:52" },
    { rule: HiddenOptional, at: "members/user.ts:11:40" },
    { rule: HiddenOptional, at: "members/user.ts:19:37" },
    { rule: HiddenOptional, at: "members/user.ts:31:33" },
  ]);
  const hides = (name: string, what: string): string =>
    `the annotation on ${name} hides this ${what} from the types. A member cannot have a ${what}, because the argument count decides whether a call passes the value last; drop the ${what}, or write the member inline`;
  expect(await messages("members")).toEqual([
    hides("shout", "default"),
    hides("toWire", "default"),
    hides("tags", "rest parameter"),
    hides("short", "default"),
    hides("labels.label", "default"),
    hides("glue", "default"),
  ]);
});

test("reports nothing on a const that no step takes", async () => {
  expect(await lint("unused")).toEqual([]);
});

test("needs no TypeScript", () => {
  const { status, stdout } = cliWithoutTypeScript(`${UNDER}/members`);
  expect(status).toBe(1);
  expect(stdout).toContain(`${HiddenOptional.kind}  the annotation on toWire hides this default`);
});
