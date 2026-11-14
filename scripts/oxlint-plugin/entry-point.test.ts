import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vite-plus/test";

import { entryPoint } from "./entry-point.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const MAIN = "/repo/cli/main.ts";

new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } }).run(
  "entry-point",
  entryPoint,
  {
    valid: [
      {
        code: 'import { a } from "a";\nasync function main() {}\nconst X = 1;\nawait main();',
        filename: MAIN,
      },
      { code: "function main() {}\nmain();", filename: MAIN },
      // A module without `main` is not an entry point, and exports what it likes.
      { code: "export const X = 1;\nexport default function f() {}", filename: "/repo/index.ts" },
    ],
    invalid: [
      // `main.ts` is the entry point, and `index.ts` is what other modules import, as `main.rs` and
      // `lib.rs` are in a Rust crate.
      {
        code: "function main() {}\nmain();",
        filename: "/repo/worker.ts",
        errors: [{ messageId: "name" }],
      },
      { code: "export const X = 1;", filename: MAIN, errors: [{ messageId: "missing" }] },
      { code: "", filename: MAIN, errors: [{ messageId: "missing" }] },
      {
        code: "const X = 1;\nfunction main() {}\nmain();",
        filename: MAIN,
        errors: [{ messageId: "first" }],
      },
      { code: "function main() {}\nconst X = 1;", filename: MAIN, errors: [{ messageId: "last" }] },
      {
        code: "function main() {}\nmain();\nconst X = 1;",
        filename: MAIN,
        errors: [{ messageId: "last" }],
      },
      { code: "function main() {}\nfoo();", filename: MAIN, errors: [{ messageId: "last" }] },
      // Nothing imports an entry point, so nothing needs to guard its call.
      {
        code: "function main() {}\nif (import.meta.main) {\n  main();\n}",
        filename: MAIN,
        errors: [{ messageId: "last" }],
      },
      {
        code: "function main() {}\nif (import.meta.main) main();",
        filename: MAIN,
        errors: [{ messageId: "last" }],
      },
      {
        code: "export function main() {}\nmain();",
        filename: MAIN,
        errors: [{ messageId: "export" }],
      },
      {
        code: "function main() {}\nexport = 1;\nmain();",
        filename: MAIN,
        errors: [{ messageId: "export" }],
      },
      {
        code: 'export { a } from "a";\nfunction main() {}\nmain();',
        filename: MAIN,
        errors: [{ messageId: "export" }, { messageId: "first" }],
      },
      {
        code: "function main() {}\nexport const X = 1;\nmain();",
        filename: MAIN,
        errors: [{ messageId: "export" }],
      },
      {
        code: "function main() {}\nexport type T = 1;\nmain();",
        filename: MAIN,
        errors: [{ messageId: "export" }],
      },
      {
        code: "function main() {}\nexport default function f() {}\nmain();",
        filename: MAIN,
        errors: [{ messageId: "export" }],
      },
      {
        code: "function main() {}\nconst X = 1;\nexport { X };\nmain();",
        filename: MAIN,
        errors: [{ messageId: "export" }],
      },
      {
        code: 'import { a } from "a";\nexport * from "a";\nfunction main() {}\nmain();',
        filename: MAIN,
        errors: [{ messageId: "export" }, { messageId: "first" }],
      },
    ],
  },
);
