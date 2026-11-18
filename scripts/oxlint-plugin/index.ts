// The repository's own lint rules, which the published plugin does not carry.
import { braces } from "./braces.ts";
import { declarationOrder } from "./declaration-order.ts";
import { functionDeclaration } from "./function-declaration.ts";
import { mainFirst } from "./main-first.ts";
import type { Rule } from "./rule.ts";

// Annotated, so the emitted declaration references {@link Rule} rather than oxlint's own type.
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
