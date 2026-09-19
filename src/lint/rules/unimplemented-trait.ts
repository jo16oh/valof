import type { Where } from "../ast.ts";
import { symbolIdentity, type Alias, type Scan } from "../scan/index.ts";
import type { Rule } from "./rule.ts";

export type UnimplementedTrait = Where & {
  kind: "unimplemented-trait";
  file: string;
  val: string;
  trait: string;
  message: string;
};
export const UnimplementedTrait: Rule<UnimplementedTrait> = {
  kind: "unimplemented-trait",
  description: "a Trait declared by a Val or an Enum that its companion does not implement",
  run: findings,
};

/**
 * Reports a declared trait that no `implTrait` answers for.
 *
 * A Val's third argument carries traits and nothing else, so every reference there is one. An
 * enum's carries the shared fields and the tag's name as well, and a shared field written as an
 * alias of its own reads like a trait from the syntax. Those are reported only where the
 * reference resolves to a `Trait` declaration in the scanned files, which keeps a shared field
 * silent at the cost of missing a trait declared in a file nobody linted.
 */
function findings(scans: readonly Scan[]): UnimplementedTrait[] {
  const found: UnimplementedTrait[] = [];
  const identity = symbolIdentity(scans);
  const traits = new Set(
    scans.flatMap(({ traitAliases }) => traitAliases.map(({ ref }) => identity(ref))),
  );
  for (const scan of scans)
    for (const { alias, ref, traits: declared, onlyDeclared } of [
      ...scan.aliases.map((one: Alias) => ({ ...one, onlyDeclared: false })),
      ...scan.enumAliases.map((one: Alias) => ({ ...one, onlyDeclared: true })),
    ]) {
      const implemented = new Set(
        scan.traitImplementations
          .filter((one) => identity(one.val) === identity(ref))
          .map((one) => identity(one.trait)),
      );
      for (const trait of declared)
        if (!implemented.has(identity(trait.ref))) {
          if (onlyDeclared && !traits.has(identity(trait.ref))) continue;
          // The declaration's position is deliberate: it points to the promise that is missing.
          found.push({
            kind: "unimplemented-trait",
            file: scan.file,
            line: trait.line,
            column: trait.column,
            val: alias,
            trait: trait.name,
            message: `${alias} declares ${trait.name}, but its companion does not implement it`,
          });
        }
    }
  return found;
}
