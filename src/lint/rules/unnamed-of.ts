import { Val } from "../../index.ts";
import type { Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

/** A `Val.of(…)` that names no type, and takes one from whatever it is assigned to. */
export type UnnamedOf = Val<"UnnamedOf", { kind: "unnamed-of" }, Rule>;
export const UnnamedOf = Val.companion<UnnamedOf>()
  .implCreate(() => ({
    kind: "unnamed-of",
    description: "a `Val.of` that names no type, taking one from its target",
    // The lift itself is sound. What it costs is the name that makes the lift greppable.
    warns: true,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

/**
 * Reports every `Val.of(…)` written without its type argument.
 *
 * The type argument is what makes a lift visible: `Val.of<User>(payload)` is greppable, and the
 * bypassed-companion rule reads that name to say what the lift went around. Without it, the same
 * lift reads as an ordinary call and neither a reader nor that rule sees it.
 *
 * No type is resolved. TypeScript infers the type from the target, so the form only compiles
 * where a target says what it is: `const u: User = Val.of(payload)` and a call passing one as an
 * argument. With nothing to infer from, the parameter resolves to `never` and the compiler
 * rejects the call before this rule is reached.
 */
function findings({ kind }: UnnamedOf, scans: readonly Scan[]): Finding[] {
  return scans.flatMap(({ file, lifts }) =>
    lifts
      .filter(({ typeName }) => typeName === undefined)
      .map(({ line, column }) =>
        Finding.seal({
          kind,
          file,
          line,
          column,
          message: "Val.of names no type here, and takes one from its target",
        }),
      ),
  );
}
