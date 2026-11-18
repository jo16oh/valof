import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vite-plus/test";

import { braces } from "./braces.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const MESSAGE = { messageId: "braces" };

new RuleTester().run("braces", braces, {
  valid: [
    "if (a) { b(); } else { c(); }",
    "if (a) { b(); } else if (c) { d(); }",
    "function f(a) { if (a) return a; }",
    "function f(a) { if (a) throw new Error(); }",
    "for (const a of b) { if (a) continue; }",
    "for (const a of b) { if (a) break; }",
  ],
  invalid: [
    { code: "if (a) b();", output: "if (a) {\nb();\n}", errors: [MESSAGE] },
    // Only a guard clause goes without braces, and a guard clause has no `else`.
    {
      code: "function f(a) { if (a) return 1; else return 2; }",
      output: "function f(a) { if (a) {\nreturn 1;\n} else {\nreturn 2;\n} }",
      errors: [MESSAGE, MESSAGE],
    },
    {
      code: "if (a) { b(); } else c();",
      output: "if (a) { b(); } else {\nc();\n}",
      errors: [MESSAGE],
    },
    {
      code: "for (const a of b) c(a);",
      output: "for (const a of b) {\nc(a);\n}",
      errors: [MESSAGE],
    },
    {
      code: "for (const a in b) c(a);",
      output: "for (const a in b) {\nc(a);\n}",
      errors: [MESSAGE],
    },
    { code: "for (;;) a();", output: "for (;;) {\na();\n}", errors: [MESSAGE] },
    { code: "while (a) b();", output: "while (a) {\nb();\n}", errors: [MESSAGE] },
    { code: "do a(); while (b);", output: "do {\na();\n} while (b);", errors: [MESSAGE] },
    { code: "while (a());", output: "while (a()) {}", errors: [MESSAGE] },
  ],
});
