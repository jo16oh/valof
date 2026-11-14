import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vite-plus/test";

import { declarationOrder } from "./declaration-order.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const EXPORTED_TYPE = "an exported type, Val, Enum or Trait";
const HELPER_TYPE = "a helper type, Val, Enum or Trait";
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
        "export type T = string;",
        'export type V = Val<"V", {}>;',
        "export const V = Val.companion<V>().build();",
        "export class Cache {}",
        "export function f() {}",
        "type U = string;",
        "interface I {}",
        'type H = Val<"H", {}>;',
        "const H = Val.companion<H>().build();",
        "class Pool {}",
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
      // An error is a class that extends an error, by its name.
      [
        "export class A extends Error {}",
        "class B extends TypeError {}",
        "export class C extends errors.BaseError {}",
        "export type T = string;",
      ].join("\n"),
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
        code: "export type T = string;\nclass E extends ErrorFactory({}) {}",
        errors: [order("an error", EXPORTED_TYPE)],
      },
      {
        code: "export type T = string;\nclass E extends Error {}",
        errors: [order("an error", EXPORTED_TYPE)],
      },
      {
        code: "export function f() {}\nexport interface I {}",
        errors: [order(EXPORTED_TYPE, "an exported function")],
      },
      {
        code: "type U = string;\nexport function f() {}",
        errors: [order("an exported function", HELPER_TYPE)],
      },
      {
        code: 'type H = Val<"H", {}>;\nconst H = Val.companion<H>().build();\nexport function f() {}',
        errors: [order("an exported function", HELPER_TYPE)],
      },
      {
        code: "export function f() {}\nexport type V = Val<'V', {}>;\nexport const V = Val.companion<V>().build();",
        errors: [
          order(EXPORTED_TYPE, "an exported function"),
          order(EXPORTED_TYPE, "an exported function"),
        ],
      },
      // A class that is not an error comes after the types, as a container of state.
      {
        code: "export class Cache {}\nexport type T = string;",
        errors: [order(EXPORTED_TYPE, "an exported class")],
      },
      {
        code: "export function f() {}\nexport class Cache {}",
        errors: [order("an exported class", "an exported function")],
      },
      {
        code: "class Pool {}\ntype U = string;",
        errors: [order(HELPER_TYPE, "a helper class")],
      },
      {
        code: "function g() {}\nclass Pool {}",
        errors: [order("a helper class", "a helper function")],
      },
      {
        code: "class Pool {}\nexport class Cache {}",
        errors: [order("an exported class", "a helper class")],
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
      { code: "export default f;\nfunction g() {}", errors: [order("a helper function", END)] },
    ],
  },
);
