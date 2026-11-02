import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

export type ModelOnlyInValof = Val<"ModelOnlyInValof", { kind: "model-only-in-valof" }, Rule>;
export const ModelOnlyInValof = Val.companion<ModelOnlyInValof>()
  .implCreate(() => ({
    kind: "model-only-in-valof",
    description: "a data type declared outside Valof (off unless enabled)",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings(_rule: ModelOnlyInValof, _scans: readonly Scan[]): Finding[] {
  return [];
}
