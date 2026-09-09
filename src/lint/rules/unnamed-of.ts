import type { Where } from "../ast.ts";
import type { Scan } from "../scan/index.ts";
import type { Rule } from "./rule.ts";

/** A `Val.of(…)` that names no type, and takes one from whatever it is assigned to. */
export type UnnamedOf = Where & {
  kind: "unnamed-of";
  file: string;
  message: string;
};

export const UnnamedOf: Rule<UnnamedOf> = {
  kind: "unnamed-of",
  description: "a `Val.of` that names no type, taking one from its target",
  // The lift itself is sound. What it costs is the name that makes the lift greppable.
  warns: true,
  run: findings,
};

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
function findings(scans: readonly Scan[]): UnnamedOf[] {
  return scans.flatMap(({ file, lifts }) =>
    lifts
      .filter(({ typeName }) => typeName === undefined)
      .map(({ line, column }) => ({
        kind: "unnamed-of" as const,
        file,
        line,
        column,
        message: "Val.of names no type here, and takes one from its target",
      })),
  );
}
