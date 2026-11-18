import { Val } from "../../lib/index.ts";
import { ImportMap, type Scan } from "../scan/index.ts";
import { Kind, Finding, Rule } from "./rule.ts";

/** A companion written in one file for a type declared in another. */
export type SplitCompanion = Val<"SplitCompanion", { kind: Kind }, Rule>;
export const SplitCompanion = Val.companion<SplitCompanion>()
  .implCreate(() => ({
    kind: Kind.seal("split-companion"),
    description: "a companion for a type that another file declares",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: findings }))
  .build();

/**
 * Reports every companion chain, of any root, whose type argument came from another module:
 * imported by name or reached through a namespace. A declaration merge is file-local. Split over
 * two files, the pair does not compile: TS2395 when both are exported, and TS2323 when the second
 * file re-exports the type beside its companion. What is left is a companion under another name,
 * which the companion-mismatch rule reports, or one nobody can import under the type's name.
 *
 * A type declared here as `type Local = Imported` is not seen, since the name is local. Missing it
 * is safer than a false report.
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
