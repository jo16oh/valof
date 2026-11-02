import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

/**
 * A variant whose steps are split by another variant's steps:
 * `.Circle.implSeal(f).Square.impl(g).Circle.impl(h)`. The type accepts the order, and a reader of
 * one variant has to find its steps across the chain.
 */
export type SplitVariantSteps = Val<"SplitVariantSteps", { kind: "split-variant-steps" }, Rule>;
export const SplitVariantSteps = Val.companion<SplitVariantSteps>()
  .implCreate(() => ({
    kind: "split-variant-steps",
    description: "a variant whose steps are split by another variant's steps in the chain",
    warns: true,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings({ kind }: SplitVariantSteps, scans: readonly Scan[]): Finding[] {
  return scans.flatMap(({ file, splitVariants }) =>
    splitVariants.map(({ companion, variant, line, column }) =>
      Finding.seal({
        kind,
        file,
        line,
        column,
        message: `${companion}.${variant}'s steps are split by another variant's; write this one beside them`,
      }),
    ),
  );
}
