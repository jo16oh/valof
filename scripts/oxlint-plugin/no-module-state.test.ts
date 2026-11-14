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
    ],
    invalid: [
      { code: "let parser;", errors: [{ messageId: "let" }] },
      { code: "export let count = 0;", errors: [{ messageId: "let" }] },
      { code: "var count = 0;", errors: [{ messageId: "let" }] },
      // A class holds state, so a module-level instance is module state.
      { code: "const CACHE = new Cache();", errors: [{ messageId: "new" }] },
      { code: "const STORE = open(new Store());", errors: [{ messageId: "new" }] },
      { code: "const SEEN = new WeakMap();", errors: [{ messageId: "new" }] },
      // A collection the types let anyone change.
      { code: 'const KINDS = new Set(["a"]);', errors: [{ messageId: "readonly" }] },
      {
        code: "const STEPS: Map<string, number> = new Map();",
        errors: [{ messageId: "readonly" }],
      },
      { code: "const TABLE = { a: new Set() };", errors: [{ messageId: "readonly" }] },
    ],
  },
);
