import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vite-plus/test";

import plugin from "./braces.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const message = { messageId: "braces" };

new RuleTester().run("braces", plugin.rules.braces, {
  valid: [
    "if (a) { b(); }",
    "if (a) { b(); } else { c(); }",
    "if (a) { b(); } else if (c) { d(); }",
    "function f(a) { if (a) return; }",
    "function f(a) { if (a) return a; }",
    "function f(a) { if (a) throw new Error(); }",
    "for (const a of b) { if (a) continue; }",
    "for (const a of b) { if (a) break; }",
    "for (const a of b) { c(a); }",
  ],
  invalid: [
    { code: "if (a) b();", output: "if (a) {\nb();\n}", errors: [message] },
    // Only a guard clause goes without braces, and a guard clause has no `else`.
    {
      code: "function f(a) { if (a) return 1; else return 2; }",
      output: "function f(a) { if (a) {\nreturn 1;\n} else {\nreturn 2;\n} }",
      errors: [message, message],
    },
    {
      code: "if (a) { b(); } else c();",
      output: "if (a) { b(); } else {\nc();\n}",
      errors: [message],
    },
    {
      code: "for (const a of b) c(a);",
      output: "for (const a of b) {\nc(a);\n}",
      errors: [message],
    },
    {
      code: "for (const a in b) c(a);",
      output: "for (const a in b) {\nc(a);\n}",
      errors: [message],
    },
    { code: "for (;;) a();", output: "for (;;) {\na();\n}", errors: [message] },
    { code: "while (a) b();", output: "while (a) {\nb();\n}", errors: [message] },
    { code: "do a(); while (b);", output: "do {\na();\n} while (b);", errors: [message] },
  ],
});
