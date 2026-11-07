import { Val } from "../../index.ts";
import { symbolIdentity, type Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

export type UnimplementedTrait = Val<"UnimplementedTrait", { kind: "unimplemented-trait" }, Rule>;
export const UnimplementedTrait = Val.companion<UnimplementedTrait>()
  .implCreate(() => ({
    kind: "unimplemented-trait",
    description: "a Trait declared by a Val or an Enum that its companion does not implement",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: findings }))
  .build();
/**
 * Reports a declared trait that no `implTrait` answers for.
 *
 * A Val's third argument carries traits and nothing else, so every reference there is one. An
 * enum's carries the shared fields and the tag's name as well, and a shared field written as an
 * alias of its own reads like a trait from the syntax. Those are reported only where the
 * reference resolves to a `Trait` declaration in the scanned files, which keeps a shared field
 * silent at the cost of missing a trait declared in a file nobody linted.
 */
function findings({ kind }: UnimplementedTrait, scans: readonly Scan[]): Finding[] {
  const found: Finding[] = [];
  const identity = symbolIdentity(scans);
  const traits = new Set(
    scans.flatMap(({ traitAliases }) => traitAliases.map(({ ref }) => identity(ref))),
  );
  for (const scan of scans)
    for (const { alias, ref, traits: declared, onlyDeclared } of [
      ...scan.aliases.map((one) => ({ ...one, onlyDeclared: false })),
      ...scan.enumAliases.map((one) => ({ ...one, onlyDeclared: true })),
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
          found.push(
            Finding.seal({
              kind,
              file: scan.file,
              at: trait.at,
              message: `${alias} declares ${trait.name}, but its companion does not implement it`,
            }),
          );
        }
    }
  return found;
}
