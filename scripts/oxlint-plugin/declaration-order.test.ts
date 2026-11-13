import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vite-plus/test";

import { declarationOrder } from "./declaration-order.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const EXPORTED_VAL = "an exported Val, Enum or Trait";
const HELPER_VAL = "a helper Val, Enum or Trait";
const END = "the call to `main` or `export default`";

function order(kind: string, after: string) {
  return { messageId: "order", data: { kind, after } };
}

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
        "interface I {}",
        'export type V = Val<"V", {}>;',
        "export const V = Val.companion<V>().build();",
        "export function f() {}",
        'type H = Val<"H", {}>;',
        "const H = Val.companion<H>().build();",
        "function g() {}",
        "main();",
        "export default f;",
      ].join("\n"),
      // An Enum's and a Trait's companion sort as a Val's does.
      [
        "export function f() {}",
        "type E = Enum<'E', { A: {} }>;",
        "const E = Enum.companion<E>().build();",
        "type R = Trait<'R', {}>;",
        "const R = Trait.companion<R>().build();",
      ].join("\n"),
      // The type follows its companion: exported alone, it still sorts with a helper.
      'export function f() {}\nexport type X = Val<"X", {}>;\nconst X = Val.companion<X>().build();',
    ],
    invalid: [
      {
        code: "function g() {}\nexport const A = 1;",
        errors: [order("an exported constant", "a helper function")],
      },
      {
        code: "export function f() {}\nconst B = 2;",
        errors: [order("a constant", "an exported function")],
      },
      {
        code: "type T = string;\nclass E extends ErrorFactory({}) {}",
        errors: [order("an error", "a type without a companion")],
      },
      {
        code: "export function f() {}\ninterface I {}",
        errors: [order("a type without a companion", "an exported function")],
      },
      {
        code: 'type H = Val<"H", {}>;\nconst H = Val.companion<H>().build();\nexport function f() {}',
        errors: [order("an exported function", HELPER_VAL)],
      },
      {
        code: "export function f() {}\nexport type V = Val<'V', {}>;\nexport const V = Val.companion<V>().build();",
        errors: [
          order(EXPORTED_VAL, "an exported function"),
          order(EXPORTED_VAL, "an exported function"),
        ],
      },
      {
        code: "function g() {}\nexport function f() {}",
        errors: [order("an exported function", "a helper function")],
      },
      // Every statement out of place is reported, against the latest kind seen.
      {
        code: "function g() {}\nexport const A = 1;\nconst B = 2;",
        errors: [
          order("an exported constant", "a helper function"),
          order("a constant", "a helper function"),
        ],
      },
      { code: "main();\nfunction g() {}", errors: [order("a helper function", END)] },
      {
        code: "if (import.meta.main) {\n  main();\n}\nfunction g() {}",
        errors: [order("a helper function", END)],
      },
      { code: "export default f;\nfunction g() {}", errors: [order("a helper function", END)] },
    ],
  },
);
