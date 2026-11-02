import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

export type UnreturnedSeal = Val<"UnreturnedSeal", { kind: "unreturned-seal" }, Rule>;
export const UnreturnedSeal = Val.companion<UnreturnedSeal>()
  .implCreate(() => ({
    kind: "unreturned-seal",
    description: "a seal whose default result does not reach its return, beside a noseal create",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings(_rule: UnreturnedSeal, _scans: readonly Scan[]): Finding[] {
  return [];
}
