import { Val } from "../../lib/index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Kind, Rule } from "./rule.ts";

/** A step function that declares something beside the members, which every member shares unseen. */
export type HiddenSharedStateInImpl = Val<"HiddenSharedStateInImpl", { kind: Kind }, Rule>;
export const HiddenSharedStateInImpl = Val.companion<HiddenSharedStateInImpl>()
  .implCreate(() => ({
    kind: Kind.seal("no-hidden-shared-state-in-impl"),
    description: "state declared in a function passed to `.impl`, `.implTrait` or `.implAssoc`",
    warns: true,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

/**
 * Reports a member step whose function declares a variable, a function or a class in its body:
 * `() => { const n = 0; … }` or `function () { … }` alike.
 *
 * What it declares is state every member shares and no reader of a member sees. A body that only
 * returns the object is not reported. `implSeal` and `implCreate` are not reported, since a check
 * or the code that builds a payload is written as statements.
 */
function findings({ kind }: HiddenSharedStateInImpl, scans: readonly Scan[]): Finding[] {
  return scans.flatMap(({ file, stepStates }) =>
    stepStates.map(({ step, at }) =>
      Finding.seal({
        kind,
        file,
        at,
        message: `the function passed to .${step} declares state its members share; move what it declares out of the companion, and return the object itself: () => ({ … })`,
      }),
    ),
  );
}
