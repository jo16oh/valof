import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vite-plus/test";

import { noModuleState } from "./no-module-state.ts";

RuleTester.describe = describe;
RuleTester.it = it;

new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } }).run(
  "no-module-state",
  noModuleState,
  {
    valid: [
      "const ROOT = 1;",
      // A URL and a pattern are values.
      'const HERE = new URL("./", import.meta.url);',
      'const PATH = fileURLToPath(new URL("../", import.meta.url));',
      "const WORD = new RegExp(`^${A}$`);",
      // A collection the types keep from being changed.
      'const KINDS: ReadonlySet<string> = new Set(["a"]);',
      "export const STEPS: ReadonlyMap<string, number> = new Map();",
      // State inside a function lives as long as the call.
      "function f() {\n  let count = 0;\n  const cache = new Cache();\n  return () => count++;\n}",
      "const make = () => new Cache();",
      // A method runs when it is called, as a companion's members do.
      "const O = { m() {\n  return new Cache();\n} };",
      "class Pool {\n  static readonly SIZE = 4;\n  #items = new Map();\n}",
    ],
    invalid: [
      { code: "let parser;", errors: [{ messageId: "let" }] },
      { code: "export let count = 0;", errors: [{ messageId: "let" }] },
      { code: "var count = 0;", errors: [{ messageId: "let" }] },
      // One report, for the binding: making it `const` leaves the instance to report next.
      { code: "let CACHE = new Cache();", errors: [{ messageId: "let" }] },
      // A class holds state, so an instance at the top level is state the whole module shares.
      { code: "const CACHE = new Cache();", errors: [{ messageId: "new" }] },
      { code: "const STORE = open(new Store());", errors: [{ messageId: "new" }] },
      { code: "const SEEN = new WeakMap();", errors: [{ messageId: "new" }] },
      { code: "export default new Cache();", errors: [{ messageId: "new" }] },
      // A static field lives as long as the module.
      { code: "class Pool {\n  static count = 0;\n}", errors: [{ messageId: "static" }] },
      {
        code: "class Pool {\n  static readonly ITEMS = new Map();\n}",
        errors: [{ messageId: "readonly" }],
      },
      // A collection the types let anyone change.
      { code: 'const KINDS = new Set(["a"]);', errors: [{ messageId: "readonly" }] },
      {
        code: "const STEPS: Map<string, number> = new Map();",
        errors: [{ messageId: "readonly" }],
      },
      { code: "const TABLE = { a: new Set() };", errors: [{ messageId: "readonly" }] },
      // `Readonly<Set<…>>` still has `add`.
      {
        code: "const KINDS: Readonly<Set<string>> = new Set();",
        errors: [{ messageId: "readonly" }],
      },
      // The annotation covers the outer collection, not the one inside it.
      {
        code: 'const TABLE: ReadonlyMap<string, Set<string>> = new Map([["a", new Set()]]);',
        errors: [{ messageId: "readonly" }],
      },
    ],
  },
);
