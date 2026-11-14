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
      // A call's result: what it returns is up to the callee.
      "const run = promisify(execFile);",
      "function f() {\n  const g = () => 1;\n  return [1].map((n) => n + g());\n}",
      // The rule is about `const`. A `let` that holds a function is rare enough to read on review.
      "let f = () => 1;",
      // A method is written as one, in an object and in a class.
      "const RULE = { create(context) {\n  return context;\n} } as const;",
      "class Pool {\n  get size() {\n    return 0;\n  }\n  take() {}\n}",
      // A generator has no arrow form.
      "function f() {\n  const g = function* () {};\n  return g;\n}",
    ],
    invalid: [
      { code: "const f = () => 1;", errors: [DECLARATION] },
      { code: "export const f = (a) => a;", errors: [DECLARATION] },
      { code: "const f = function () {};", errors: [DECLARATION] },
      { code: "const a = 1,\n  f = () => 1;", errors: [DECLARATION] },
      // Inside a function, and anywhere below the top level, a function is an arrow function.
      { code: "function f() {\n  function g() {}\n  return g;\n}", errors: [ARROW] },
      {
        code: "function f() {\n  return [1].map(function (n) {\n    return n;\n  });\n}",
        errors: [ARROW],
      },
      { code: "run(function () {});", errors: [ARROW] },
      { code: "const O = { m: function () {} } as const;", errors: [ARROW] },
    ],
  },
);
