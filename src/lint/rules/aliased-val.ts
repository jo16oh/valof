import type { Where } from "../ast.ts";
import { original } from "../scan/index.ts";
import type { Scan } from "../scan/index.ts";
import type { Rule } from "./rule.ts";

/** A type alias that is nothing but a second name for a Val. */
export type AliasedVal = Where & {
  kind: "aliased-val";
  file: string;
  /** The name being declared. */
  alias: string;
  /** The Val it ends at. */
  val: string;
  message: string;
};

export const AliasedVal: Rule<AliasedVal> = {
  kind: "aliased-val",
  description: "a type alias that is a second name for a Val",
  run: findings,
};

/**
 * Reports every top-level `type A = B` where `B` ends at a Val.
 *
 * One Val, one name. A second name splits the type from the companion that carries its
 * behaviour, the same failure the companion-mismatch rule reports from the other side: an error
 * message names `User`, the code says `Local`, and `User.greet` is what the reader has to find.
 *
 * Only a bare reference counts. `type Either = User | Order` claims no single brand and
 * `type Ro = Readonly<User>` is a type of its own, so neither is a second name and neither is
 * read here. A generic alias is left alone too: its right side is a parameter.
 *
 * The chain is followed, so `type A = B` over `type B = User` reports both. Reporting only the
 * one next to the Val would grow a new finding each time one was fixed.
 */
function findings(scans: readonly Scan[]): AliasedVal[] {
  /** Every name a Val alias is declared under, over every scanned file. */
  const vals = new Set<string>();
  for (const { aliases } of scans) for (const { alias } of aliases) vals.add(alias);

  /** A second name -> what it stands for, as the declaring module names it. */
  const links = new Map<string, string>();
  for (const { bound, reAliases } of scans)
    for (const { alias, target, qualified } of reAliases)
      links.set(alias, qualified ? target : original(bound, target));

  /** The Val a name ends at, walking the second names, or `undefined` when it ends elsewhere. */
  const endsAt = (name: string): string | undefined => {
    const seen = new Set<string>();
    let current = name;
    while (!seen.has(current)) {
      if (vals.has(current)) return current;
      seen.add(current);
      const next = links.get(current);
      if (next === undefined) return undefined;
      current = next;
    }
    return undefined;
  };

  const found: AliasedVal[] = [];
  for (const { file, bound, reAliases } of scans) {
    for (const { alias, target, qualified, line, column } of reAliases) {
      const val = endsAt(qualified ? target : original(bound, target));
      if (val === undefined) continue;
      found.push({
        kind: "aliased-val",
        file,
        line,
        column,
        alias,
        val,
        message: `${alias} is a second name for ${val}; use ${val}`,
      });
    }
  }
  return found;
}
