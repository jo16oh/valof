import type { Where } from "../ast.ts";
import { symbolIdentity, type Scan } from "../scan/index.ts";
import type { Rule } from "./rule.ts";

/** A type alias which is only another spelling for a Val or Trait. */
export type UnnecessaryAlias = Where & {
  kind: "unnecessary-alias";
  file: string;
  alias: string;
  /** The Val or Trait this alias ends at. */
  target: string;
  message: string;
};

export const UnnecessaryAlias: Rule<UnnecessaryAlias> = {
  kind: "unnecessary-alias",
  description: "a type alias that is a second name for a Val or Trait",
  run: findings,
};

function findings(scans: readonly Scan[]): UnnecessaryAlias[] {
  const identity = symbolIdentity(scans);
  const declarations = new Map<string, string>();
  for (const { aliases, traitAliases } of scans)
    for (const { alias, ref } of [...aliases, ...traitAliases])
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
            {
              kind: "unnecessary-alias" as const,
              file,
              line,
              column,
              alias,
              target: declaration,
              message: `${alias} is a second name for ${declaration}; use ${declaration}`,
            },
          ]
        : [];
    }),
  );
}
