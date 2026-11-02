import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

export type UnrelatedAssoc = Val<"UnrelatedAssoc", { kind: "unrelated-assoc" }, Rule>;
export const UnrelatedAssoc = Val.companion<UnrelatedAssoc>()
  .implCreate(() => ({
    kind: "unrelated-assoc",
    description: "an `.implAssoc` member that neither takes nor makes the type",
    warns: true,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings(_rule: UnrelatedAssoc, _scans: readonly Scan[]): Finding[] {
  return [];
}
