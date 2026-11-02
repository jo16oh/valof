import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

export type UnqualifiedVariant = Val<"UnqualifiedVariant", { kind: "unqualified-variant" }, Rule>;
export const UnqualifiedVariant = Val.companion<UnqualifiedVariant>()
  .implCreate(() => ({
    kind: "unqualified-variant",
    description: "a variant bound to a local name, which drops the enum it comes from",
    warns: true,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings(_rule: UnqualifiedVariant, _scans: readonly Scan[]): Finding[] {
  return [];
}
