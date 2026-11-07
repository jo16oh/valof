import { Val } from "../../index.ts";
import { ImportMap, type Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

/** A companion written in one file for a type declared in another. */
export type SplitCompanion = Val<"SplitCompanion", { kind: "split-companion" }, Rule>;
export const SplitCompanion = Val.companion<SplitCompanion>()
  .implCreate(() => ({
    kind: "split-companion",
    description: "a companion for a type that another file declares",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: findings }))
  .build();

/**
 * Reports every companion chain, of any root, whose type argument came from another module:
 * imported by name or reached through a namespace.
 *
 * The merge is what the API is, and a merge is file-local. `type User` and `const User` in one
 * file give one `User` that is the type, the constructor and the namespace at once. Split over
 * two files, the same pair does not compile: TypeScript answers TS2395 when both are exported
 * and TS2323 when the second file re-exports the type beside its companion. What is left is a
 * companion under another name, which the companion-mismatch rule reports, or one nobody can
 * import under the type's name.
 *
 * An import is the whole test, so no type resolution is needed. A type declared here through a
 * helper of the user's own, `type Local = Imported`, is not seen: the name is local, and silence
 * is the safe direction.
 */
function findings({ kind }: SplitCompanion, scans: readonly Scan[]): Finding[] {
  const found: Finding[] = [];
  for (const { file, sites, imported } of scans) {
    for (const { typeName, typeAt, qualifier } of sites) {
      if (qualifier === null && !ImportMap.has(imported, typeName)) continue;
      found.push(
        Finding.seal({
          kind,
          file,
          at: typeAt,
          message: `${typeName} is declared in another file, where its companion belongs`,
        }),
      );
    }
  }
  return found;
}
