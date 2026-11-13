// The repository's own lint rules, which the published plugin does not carry.
import { braces } from "./braces.ts";
import { declarationOrder } from "./declaration-order.ts";
import { functionDeclaration } from "./function-declaration.ts";
import { mainFirst } from "./main-first.ts";
import type { Rule } from "./rule.ts";

// Annotated, so the declaration names `Rule` rather than oxlint's own type, which it does not export.
const plugin: { meta: { name: string }; rules: Record<string, Rule> } = {
  meta: { name: "local" },
  rules: {
    braces,
    "declaration-order": declarationOrder,
    "function-declaration": functionDeclaration,
    "main-first": mainFirst,
  },
};

export default plugin;
