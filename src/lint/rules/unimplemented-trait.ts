import type { Where } from "../ast.ts";
import { original } from "../scan/index.ts";
import type { Scan } from "../scan/index.ts";
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
  description: "a Trait declared by a Val that its companion does not implement",
  run: findings,
};

function findings(scans: readonly Scan[]): UnimplementedTrait[] {
  const found: UnimplementedTrait[] = [];
  for (const scan of scans)
    for (const alias of scan.aliases) {
      const implemented = new Set(
        scan.traitImplementations.filter((one) => one.val === alias.alias).map((one) => one.trait),
      );
      for (const trait of alias.traits)
        if (
          !implemented.has(
            trait.qualifier === undefined ? original(scan.bound, trait.name) : trait.name,
          )
        ) {
          // The declaration's position is deliberate: it points to the promise that is missing.
          found.push({
            kind: "unimplemented-trait",
            file: scan.file,
            line: trait.line,
            column: trait.column,
            val: alias.alias,
            trait: trait.name,
            message: `${alias.alias} declares ${trait.name}, but its companion does not implement it`,
          });
        }
    }
  return found;
}
