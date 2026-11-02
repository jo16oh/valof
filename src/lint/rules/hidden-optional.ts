import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

export type HiddenOptional = Val<"HiddenOptional", { kind: "hidden-optional" }, Rule>;
export const HiddenOptional = Val.companion<HiddenOptional>()
  .implCreate(() => ({
    kind: "hidden-optional",
    description: "a default or rest parameter that the type annotation on a member hides",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings(_rule: HiddenOptional, _scans: readonly Scan[]): Finding[] {
  return [];
}
