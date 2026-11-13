import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vite-plus/test";

import { declarationOrder } from "./declaration-order.ts";

RuleTester.describe = describe;
RuleTester.it = it;

new RuleTester({ languageOptions: { sourceType: "module", parserOptions: { lang: "ts" } } }).run(
  "declaration-order",
  declarationOrder,
  {
    valid: [
      [
        'import { Val } from "valof";',
        'export { b } from "b";',
        "function main() {}",
        "export const A = 1;",
        "const B = 2;",
        "class E extends ErrorFactory({}) {}",
        "type T = string;",
        'export type V = Val<"V", {}>;',
        "export const V = Val.companion<V>().build();",
        "export function f() {}",
        'type H = Val<"H", {}>;',
        "const H = Val.companion<H>().build();",
        "function g() {}",
        "main();",
        "export default f;",
      ].join("\n"),
    ],
    invalid: [
      {
        code: "function g() {}\nexport const A = 1;",
        errors: [
          {
            messageId: "order",
            data: { kind: "an exported constant", after: "a helper function" },
          },
        ],
      },
      {
        code: "export function f() {}\nconst B = 2;",
        errors: [
          { messageId: "order", data: { kind: "a constant", after: "an exported function" } },
        ],
      },
      {
        code: "type T = string;\nclass E extends ErrorFactory({}) {}",
        errors: [{ messageId: "order", data: { kind: "an error", after: "a type" } }],
      },
      {
        code: 'type H = Val<"H", {}>;\nconst H = Val.companion<H>().build();\nexport function f() {}',
        errors: [
          { messageId: "order", data: { kind: "an exported function", after: "a helper Val" } },
        ],
      },
      {
        code: "function g() {}\nexport function f() {}",
        errors: [
          {
            messageId: "order",
            data: { kind: "an exported function", after: "a helper function" },
          },
        ],
      },
    ],
  },
);
