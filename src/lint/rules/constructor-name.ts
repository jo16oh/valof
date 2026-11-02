import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

export type ConstructorName = Val<"ConstructorName", { kind: "constructor-name" }, Rule>;
export const ConstructorName = Val.companion<ConstructorName>()
  .implCreate(() => ({
    kind: "constructor-name",
    description:
      "a constructor in `.implAssoc` not named from*, parse* or create*, or a member of `.impl` that is",
    warns: true,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings(_rule: ConstructorName, _scans: readonly Scan[]): Finding[] {
  return [];
}
