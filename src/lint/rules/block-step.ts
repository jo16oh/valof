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

/**
 * Reports a member step whose function has a block body: `() => { … }` or `function () { … }`.
 *
 * A local in the block is state every member shares and no reader of a member sees. `implSeal`
 * and `implCreate` are not reported, since a check or the code that builds a payload is written as
 * statements.
 */
function findings({ kind }: BlockStep, scans: readonly Scan[]): Finding[] {
  return scans.flatMap(({ file, blockSteps }) =>
    blockSteps.map(({ step, line, column }) =>
      Finding.seal({
        kind,
        file,
        line,
        column,
        message: `the function passed to .${step} has a block body; return the object itself: () => ({ … })`,
      }),
    ),
  );
}
