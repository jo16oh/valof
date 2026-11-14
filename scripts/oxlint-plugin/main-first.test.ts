import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vite-plus/test";

import { mainFirst } from "./main-first.ts";

RuleTester.describe = describe;
RuleTester.it = it;

new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } }).run(
  "main-first",
  mainFirst,
  {
    valid: [
      'import { a } from "a";\nasync function main() {}\nconst X = 1;\nawait main();',
      "function main() {}\nmain();",
      "const X = 1;\nfunction f() {}",
      // A module without `main` is not an entry point, and exports what it likes.
      "export const X = 1;\nexport default function f() {}",
    ],
    invalid: [
      { code: "const X = 1;\nfunction main() {}\nmain();", errors: [{ messageId: "first" }] },
      { code: "function main() {}\nconst X = 1;", errors: [{ messageId: "last" }] },
      { code: "function main() {}\nmain();\nconst X = 1;", errors: [{ messageId: "last" }] },
      { code: "function main() {}\nfoo();", errors: [{ messageId: "last" }] },
      // Nothing imports an entry point, so nothing needs to guard its call.
      {
        code: "function main() {}\nif (import.meta.main) {\n  main();\n}",
        errors: [{ messageId: "last" }],
      },
      { code: "export function main() {}\nmain();", errors: [{ messageId: "export" }] },
      {
        code: "function main() {}\nexport const X = 1;\nmain();",
        errors: [{ messageId: "export" }],
      },
      {
        code: "function main() {}\nexport type T = 1;\nmain();",
        errors: [{ messageId: "export" }],
      },
      {
        code: "function main() {}\nexport default function f() {}\nmain();",
        errors: [{ messageId: "export" }],
      },
      {
        code: "function main() {}\nconst X = 1;\nexport { X };\nmain();",
        errors: [{ messageId: "export" }],
      },
      {
        code: 'import { a } from "a";\nexport * from "a";\nfunction main() {}\nmain();',
        errors: [{ messageId: "export" }, { messageId: "first" }],
      },
    ],
  },
);
