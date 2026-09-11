import type { Where } from "../ast.ts";
import { original } from "../scan/index.ts";
import type { Scan } from "../scan/index.ts";
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
  const declarations = new Set<string>();
  for (const { aliases, traitAliases } of scans)
    for (const { alias } of [...aliases, ...traitAliases]) declarations.add(alias);
  const links = new Map<string, string>();
  for (const { bound, reAliases } of scans)
    for (const link of reAliases)
      links.set(link.alias, link.qualified ? link.target : original(bound, link.target));
  const endsAt = (name: string): string | undefined => {
    const seen = new Set<string>();
    let current = name;
    while (!seen.has(current)) {
      if (declarations.has(current)) return current;
      seen.add(current);
      const next = links.get(current);
      if (!next) return undefined;
      current = next;
    }
    return undefined;
  };
  return scans.flatMap(({ file, bound, reAliases }) =>
    reAliases.flatMap(({ alias, target, qualified, line, column }) => {
      const declaration = endsAt(qualified ? target : original(bound, target));
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
