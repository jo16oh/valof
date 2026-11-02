import { Val } from "../../index.ts";
import { symbolIdentity, type Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

/** A type alias which is only another spelling for a Val, a Trait or an Enum. */
export type UnnecessaryAlias = Val<"UnnecessaryAlias", { kind: "unnecessary-alias" }, Rule>;
export const UnnecessaryAlias = Val.companion<UnnecessaryAlias>()
  .implCreate(() => ({
    kind: "unnecessary-alias",
    description: "a type alias that is a second name for a Val, a Trait or an Enum",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: (rule, scans) => findings(rule, scans) }))
  .build();

function findings({ kind }: UnnecessaryAlias, scans: readonly Scan[]): Finding[] {
  const identity = symbolIdentity(scans);
  const declarations = new Map<string, string>();
  for (const { aliases, traitAliases, enumAliases } of scans)
    for (const { alias, ref } of [...aliases, ...traitAliases, ...enumAliases])
      declarations.set(identity(ref), alias);
  const links = new Map<string, { key: string; name: string }>();
  for (const { reAliases } of scans)
    for (const link of reAliases)
      links.set(identity(link.ref), { key: identity(link.targetRef), name: link.targetRef.name });
  const endsAt = (start: { key: string; name: string }): string | undefined => {
    const seen = new Set<string>();
    let current = start;
    while (!seen.has(current.key)) {
      const declaration = declarations.get(current.key);
      if (declaration) return declaration;
      seen.add(current.key);
      const next = links.get(current.key);
      if (!next) return undefined;
      current = next;
    }
    return undefined;
  };
  return scans.flatMap(({ file, reAliases }) =>
    reAliases.flatMap(({ alias, targetRef, line, column }) => {
      const declaration = endsAt({ ...targetRef, key: identity(targetRef) });
      return declaration
        ? [
            Finding.seal({
              kind,
              file,
              line,
              column,
              message: `${alias} is a second name for ${declaration}; use ${declaration}`,
            }),
          ]
        : [];
    }),
  );
}
