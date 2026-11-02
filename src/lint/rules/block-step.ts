import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

/** A step function with a block body, whose locals every member shares as hidden state. */
export type BlockStep = Val<"BlockStep", { kind: "block-step" }, Rule>;
export const BlockStep = Val.companion<BlockStep>()
  .implCreate(() => ({
    kind: "block-step",
    description: "a function passed to `.impl`, `.implTrait` or `.implAssoc` with a block body",
    warns: true,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings(_rule: BlockStep, _scans: readonly Scan[]): Finding[] {
  return [];
}
