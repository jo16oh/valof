import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

export type SplitVariantSteps = Val<"SplitVariantSteps", { kind: "split-variant-steps" }, Rule>;
export const SplitVariantSteps = Val.companion<SplitVariantSteps>()
  .implCreate(() => ({
    kind: "split-variant-steps",
    description: "a variant whose steps are split by another's in the chain",
    warns: true,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings(_rule: SplitVariantSteps, _scans: readonly Scan[]): Finding[] {
  return [];
}
