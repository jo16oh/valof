import { expect, test } from "vite-plus/test";

import { hidesParameter } from "../../src/dual/parameters.ts";

// Built from strings, since the test transform drops comments and rewrites the source.
const hides = (member: unknown) =>
  hidesParameter(
    typeof member == "string"
      ? // oxlint-disable-next-line typescript/no-implied-eval -- the source has to survive the transform
        (new Function(`let key; return ${member}`)() as object)
      : (member as object),
  );

test("a default or a rest at the top level of the parameter list, at any position", () => {
  const hiding = [
    String.raw`(u, sep = "/") => sep`,
    String.raw`(u, ...seps) => u`,
    String.raw`(...args) => args`,
    String.raw`({ id } = {}, sep) => id + sep`,
    String.raw`({ [(() => "m")()](u, sep = "/") { return sep; } }).m`,
    "({ a = `${`}`}` }, sep = 1) => sep",
    "({ a = `$` }, sep = 1) => sep",
  ];
  expect(hiding.filter((source) => !hides(source))).toEqual([]);
});

test("but not one inside a destructured parameter, nor `=` or `(` elsewhere", () => {
  const passing = [
    String.raw`({ name, ...rest }, sep) => name + sep`,
    String.raw`([first = (1), ...rest], sep) => first + sep`,
    "(u /* = */, sep // ...\n) => u.name + sep",
    String.raw`u => Math.max(...u.scores)`,
    String.raw`async (u, sep) => sep`,
    String.raw`function (u, sep) { sep = u.name; return sep; }`,
    String.raw`({ method(u, sep) { return sep; } }).method`,
    String.raw`({ "a(b="(u, sep) { return sep; } })["a(b="]`,
    String.raw`({ [key = "m"](u, sep) { return sep; } }).m`,
    String.raw`({ a = "\"", b = "}=" }, sep) => sep`,
    String.raw`({ re = /}/, n = 1 }, sep) => sep`,
    String.raw`({ re = /[a/]/, n = 1 }, sep) => sep`,
    String.raw`({ a = [/]/], b = 1 }, sep) => sep`,
    String.raw`({ a = 4 / 2, b = { c: 4 / 2 }.c, d = 1 }, sep) => sep`,
    String.raw`({ a = { b: "6" / 2 }.b, c = 1 / 3 }, sep) => sep`,
    "({ a = { b: `6` / 2 }.b, c = 1 / 3 }, sep) => sep",
    "({ a = `\\`} = `, b = 1 }, sep) => sep",
    "({ a = `${x}}=`, b = 1 }, sep) => sep",
    "({ a = String.raw`${/]}=/.source}`, b = 1 }, sep) => sep",
    ((u: unknown, sep: string) => sep).bind(null),
  ];
  expect(passing.filter(hides)).toEqual([]);
});
