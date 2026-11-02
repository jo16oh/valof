import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

export type PayloadOfProperty = Val<"PayloadOfProperty", { kind: "payload-of-property" }, Rule>;
export const PayloadOfProperty = Val.companion<PayloadOfProperty>()
  .implCreate(() => ({
    kind: "payload-of-property",
    description: "a `PayloadOf<X>` inside a payload, which drops the brand and the seal of `X`",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings(_rule: PayloadOfProperty, _scans: readonly Scan[]): Finding[] {
  return [];
}
