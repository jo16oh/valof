import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vite-plus/test";

import { functionDeclaration } from "./function-declaration.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const MESSAGE = { messageId: "function" };

new RuleTester().run("function-declaration", functionDeclaration, {
  valid: [
    "function f() {}",
    "export async function f() {}",
    "const X = 1;",
    // A call's result: what it returns is up to the callee.
    "const run = promisify(execFile);",
    "function f() { const g = () => 1; return g; }",
  ],
  invalid: [
    { code: "const f = () => 1;", errors: [MESSAGE] },
    { code: "export const f = (a) => a;", errors: [MESSAGE] },
    { code: "const f = async () => {};", errors: [MESSAGE] },
    { code: "const f = function () {};", errors: [MESSAGE] },
  ],
});
