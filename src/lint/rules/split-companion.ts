import type { Where } from "../ast.ts";
import type { Scan } from "../scan/index.ts";
import type { Rule } from "./rule.ts";

/** A companion written in one file for a type declared in another. */
export type SplitCompanion = Where & {
  kind: "split-companion";
  file: string;
  /** The type argument, as written. */
  typeName: string;
  message: string;
};

export const SplitCompanion: Rule<SplitCompanion> = {
  kind: "split-companion",
  description: "a companion for a type that another file declares",
  run: findings,
};

/**
 * Reports every `Val.sealer<X>()` / `Val.companion<X>()` whose `X` was imported.
 *
 * The merge is what the API is, and a merge is file-local. `type User` and `const User` in one
 * file give one `User` that is the type, the constructor and the namespace at once. Split over
 * two files, the same pair does not compile: TypeScript answers TS2395 when both are exported
 * and TS2323 when the second file re-exports the type beside its companion. What is left is a
 * companion under another name, which the companion-mismatch rule reports, or one nobody can
 * import under the type's name.
 *
 * An import is the whole test, so nothing is resolved and no language server starts. A type
 * declared here through a helper of the user's own, `type Local = Imported`, is not seen: the
 * name is local, and silence is the safe direction.
 */
function findings(scans: readonly Scan[]): SplitCompanion[] {
  const found: SplitCompanion[] = [];
  for (const { file, sites, bound } of scans) {
    for (const { typeName, typeAt } of sites) {
      if (!bound.imported.has(typeName)) continue;
      found.push({
        kind: "split-companion",
        file,
        ...typeAt,
        typeName,
        message: `${typeName} is declared in another file, where its companion belongs`,
      });
    }
  }
  return found;
}
