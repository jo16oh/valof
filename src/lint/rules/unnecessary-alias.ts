import { Val } from "../../index.ts";
import { Exports, type Scan } from "../scan/index.ts";
import { Kind, Finding, Rule } from "./rule.ts";

/** A type alias which is only another spelling for a Val, a Trait or an Enum. */
export type UnnecessaryAlias = Val<"UnnecessaryAlias", { kind: Kind }, Rule>;
export const UnnecessaryAlias = Val.companion<UnnecessaryAlias>()
  .implCreate(() => ({
    kind: Kind.seal("unnecessary-alias"),
    description: "a type alias that is a second name for a Val, a Trait or an Enum",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: findings }))
  .build();

function findings({ kind }: UnnecessaryAlias, scans: readonly Scan[]): Finding[] {
  const exports = Exports.from(scans);
  const declarations = new Map<string, string>();
  for (const { aliases, traitAliases, enumAliases } of scans) {
    for (const { alias, ref } of [...aliases, ...traitAliases, ...enumAliases]) {
      declarations.set(Exports.identify(exports, ref), alias);
    }
  }
  const links = new Map<string, string>();
  for (const { reAliases } of scans) {
    for (const link of reAliases) {
      links.set(Exports.identify(exports, link.ref), Exports.identify(exports, link.targetRef));
    }
  }
  const endsAt = (start: string): string | undefined => {
    const seen = new Set<string>();
    let current = start;
    while (!seen.has(current)) {
      const declaration = declarations.get(current);
      if (declaration) return declaration;
      seen.add(current);
      const next = links.get(current);
      if (!next) return undefined;
      current = next;
    }
    return undefined;
  };
  return scans.flatMap(({ file, reAliases }) =>
    reAliases.flatMap(({ alias, targetRef, at }) => {
      const declaration = endsAt(Exports.identify(exports, targetRef));
      return declaration
        ? [
            Finding.seal({
              kind,
              file,
              at,
              message: `${alias} is a second name for ${declaration}; use ${declaration}`,
            }),
          ]
        : [];
    }),
  );
}
