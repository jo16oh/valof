import { Val } from "../../lib/index.ts";
import type { Scan } from "../scan/index.ts";
import { Kind, Finding, Rule } from "./rule.ts";

/** A `Val.of(…)` that names no type, and takes one from whatever it is assigned to. */
export type InferredValOf = Val<"InferredValOf", { kind: Kind }, Rule>;
export const InferredValOf = Val.companion<InferredValOf>()
  .implCreate(() => ({
    kind: Kind.seal("inferred-val-of"),
    description: "a `Val.of` that names no type, taking one from its target",
    // The lift itself is sound. What it costs is the name that makes the lift greppable.
    warns: true,
    optIn: false,
  }))
  .implTrait(Rule, () => ({ run: findings }))
  .build();

/**
 * Reports every `Val.of(…)` written without its type argument, which hides the lift from a reader
 * and from the bypassed-companion rule. No type is resolved. The form compiles only where a target
 * gives the type, and elsewhere the compiler rejects the call before this rule runs.
 */
function findings({ kind }: InferredValOf, scans: readonly Scan[]): Finding[] {
  return scans.flatMap(({ file, lifts }) =>
    lifts
      .filter(({ typeName }) => typeName === null)
      .map(({ at }) =>
        Finding.seal({
          kind,
          file,
          at,
          message: "Val.of names no type here, and takes one from its target",
        }),
      ),
  );
}
