import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vite-plus/test";

import { functionStyle } from "./function-style.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const DECLARATION = { messageId: "declaration" };
const ARROW = { messageId: "arrow" };

new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } }).run(
  "function-style",
  functionStyle,
  {
    valid: [
      "function f() {}",
      "export async function f() {}",
      "export default function () {}",
      // A call's result passes, because the callee decides what it returns.
      "const run = promisify(execFile);",
      "function f() {\n  const g = () => 1;\n  return [1].map((n) => n + g());\n}",
      // The rule is about `const`. A `let` that holds a function is rare enough to catch in review.
      "let f = () => 1;",
      // A method keeps the method syntax, in an object and in a class.
      "const RULE = { create(context) {\n  return context;\n} } as const;",
      "class Pool {\n  get size() {\n    return 0;\n  }\n  take() {}\n}",
      "const O = { get x() {\n  return 1;\n}, set x(v) {} } as const;",
      // An arrow function inside a field's value is a callback, not the field.
      "class Pool {\n  items = [1].map((n) => n);\n}",
      // A generator has no arrow form.
      "function f() {\n  const g = function* () {};\n  return g;\n}",
      "function f() {\n  function* g() {}\n  return g;\n}",
    ],
    invalid: [
      { code: "const f = () => 1;", errors: [DECLARATION] },
      { code: "export const f = (a) => a;", errors: [DECLARATION] },
      { code: "const f = function () {};", errors: [DECLARATION] },
      { code: "export const f = function () {};", errors: [DECLARATION] },
      { code: "const a = 1,\n  f = () => 1;", errors: [DECLARATION] },
      // Any function other than a top-level declaration is an arrow function.
      { code: "function f() {\n  function g() {}\n  return g;\n}", errors: [ARROW] },
      { code: "run(function () {});", errors: [ARROW] },
      { code: "const O = { m: function () {} } as const;", errors: [ARROW] },
      { code: "namespace N {\n  export function f() {}\n}", errors: [ARROW] },
      // A function in a class field is a method.
      { code: "class Pool {\n  take = function () {};\n}", errors: [{ messageId: "method" }] },
      { code: "class Pool {\n  take = () => 1;\n}", errors: [{ messageId: "method" }] },
      { code: "class Pool {\n  accessor take = () => 1;\n}", errors: [{ messageId: "method" }] },
      {
        code: "class Pool {\n  static make = async () => 1;\n}",
        errors: [{ messageId: "method" }],
      },
    ],
  },
);
