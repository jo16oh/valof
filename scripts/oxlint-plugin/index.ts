// The repository's own lint rules, which the published plugin does not carry.
import { braces } from "./braces.ts";
import { declarationOrder } from "./declaration-order.ts";
import { entryPoint } from "./entry-point.ts";
import { functionStyle } from "./function-style.ts";
import { noModuleState } from "./no-module-state.ts";
import type { Rule } from "./rule.ts";

// Annotated, so the emitted declaration references {@link Rule} rather than oxlint's own type.
const plugin: Readonly<{ meta: { name: string }; rules: Record<string, Rule> }> = {
  meta: { name: "local" },
  rules: {
    braces,
    "declaration-order": declarationOrder,
    "entry-point": entryPoint,
    "function-style": functionStyle,
    "no-module-state": noModuleState,
  },
};

export default plugin;
