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
      // An array or an object the types keep from changing.
      'const KINDS = ["a", "b"] as const;',
      'const NAMES: readonly string[] = ["a"];',
      "export const MODES: readonly [Mode, Mode] = [A, B];",
      "const STEPS = { map: 1, filter: 1 } as const;",
      'const LANGUAGES = ["text"] as const satisfies readonly Language[];',
      "const RULE: Readonly<Rule> = { meta: {}, create() {} };",
      "const TABLE: ReadonlyArray<string> = [];",
      // State inside a function lives as long as the call.
      "function f() {\n  let count = 0;\n  const cache = new Cache();\n  const items = [];\n  return () => count++;\n}",
      "const make = () => new Cache();",
      // A method runs when it is called, as a companion's members do.
      "const O = { m() {\n  return new Cache();\n} } as const;",
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
      { code: "export default new Cache();", errors: [{ messageId: "new" }] },
      // A collection is a container too. A readonly array or object does what it did.
      { code: 'const KINDS = new Set(["a"]);', errors: [{ messageId: "new" }] },
      {
        code: "const STEPS: ReadonlyMap<string, number> = new Map();",
        errors: [{ messageId: "new" }],
      },
      { code: "const SEEN = new WeakMap();", errors: [{ messageId: "new" }] },
      // An array or an object the types let anyone change.
      { code: 'const KINDS = ["a"];', errors: [{ messageId: "readonly" }] },
      { code: "export const STEPS = { map: 1 };", errors: [{ messageId: "readonly" }] },
      { code: 'const NAMES: string[] = ["a"];', errors: [{ messageId: "readonly" }] },
      {
        code: 'const LANGUAGES = ["text"] satisfies readonly Language[];',
        errors: [{ messageId: "readonly" }],
      },
      {
        code: "const RULE: Rule = { meta: {}, create() {} };",
        errors: [{ messageId: "readonly" }],
      },
      { code: "const NAMES = [] as string[];", errors: [{ messageId: "readonly" }] },
      // A static field lives as long as the module.
      { code: "class Pool {\n  static count = 0;\n}", errors: [{ messageId: "static" }] },
      {
        code: "class Pool {\n  static readonly ITEMS = new Map();\n}",
        errors: [{ messageId: "new" }],
      },
      {
        code: "class Pool {\n  static readonly NAMES = [];\n}",
        errors: [{ messageId: "readonly" }],
      },
    ],
  },
);
