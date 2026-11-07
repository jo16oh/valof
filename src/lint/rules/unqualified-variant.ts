import { Val } from "../../index.ts";
import { symbolIdentity, type Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

/**
 * A variant read from its enum and bound under its own name: `const { Circle } = Shape` and
 * `const Circle = Shape.Circle`. A reader of `Circle({ r: 2 })` cannot tell which enum declared it.
 */
export type UnqualifiedVariant = Val<"UnqualifiedVariant", { kind: "unqualified-variant" }, Rule>;
export const UnqualifiedVariant = Val.companion<UnqualifiedVariant>()
  .implCreate(() => ({
    kind: "unqualified-variant",
    description: "a variant bound to a local name without the name of its enum",
    warns: true,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

/** Reports each such binding. companion-mismatch reports one under another name. */
function findings({ kind }: UnqualifiedVariant, scans: readonly Scan[]): Finding[] {
  const identity = symbolIdentity(scans);
  const variants = new Map<string, ReadonlySet<string>>();
  for (const { enumAliases } of scans)
    for (const { ref, variants: declared } of enumAliases)
      if (declared) variants.set(identity(ref), new Set(declared));
  return scans.flatMap(({ file, companionBindings }) =>
    companionBindings
      .filter(
        ({ name, key, companionRef }) =>
          name === key && variants.get(identity(companionRef))?.has(key) === true,
      )
      .map(({ companion, key, at }) =>
        Finding.seal({
          kind,
          file,
          at,
          message: `${key} is ${companion}.${key} without the enum it comes from; call ${companion}.${key}`,
        }),
      ),
  );
}
