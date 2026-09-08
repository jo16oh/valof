import { resolve } from "node:path";

import type { Where } from "../../ast.ts";
import type { Alias, CompanionSite, Scan } from "../../scan/index.ts";
import type { Query, Resolver } from "../../typecheck/index.ts";
import type { Rule } from "../rule.ts";
import { isOverride, payloadPositions, prefixes, specPaths } from "./paths.ts";

/** A parent that structurally compares a child carrying its own equality. */
export type StructuralEquals = Where & {
  kind: "structural-equals";
  file: string;
  /** The parent alias, as written. */
  parent: string;
  /** Where the child sits in the parent's payload: `total`, `shipping.zip`, `lines[]`. */
  path: string;
  /** The child alias, as written. */
  child: string;
  message: string;
};

export const StructuralEquals: Rule<StructuralEquals> = {
  kind: "structural-equals",
  description: "a payload holding a Val whose own `equals` the parent never dispatches to",
  // Asked for only once something could dispatch, so a project that never writes `.implEquals`
  // never starts a language server. See {@link needsTypes}.
  run: (scans, { types }) => (needsTypes(scans) ? findings(scans, types()) : []),
};

/**
 * Whether anything in the scanned files could dispatch.
 *
 * With no `.implEquals` there is no custom equality to miss, so the caller can skip starting a
 * TypeScript at all: a project that never writes one pays nothing for this rule.
 */
const needsTypes = (scans: readonly Scan[]): boolean =>
  scans.some(({ sites }) => sites.some(({ spec }) => spec));

/**
 * Reports a parent whose payload holds a child that carries its own equality, where the parent's
 * spec says nothing about it.
 *
 * Resolution goes through go-to-definition rather than by name, so a Val reached through a
 * helper alias, a re-export or an `interface` is still seen. Names that do not resolve are left
 * alone, which keeps silence the safe direction.
 */
async function findings(scans: readonly Scan[], resolver: Resolver): Promise<StructuralEquals[]> {
  const aliases: Alias[] = scans.flatMap(({ aliases: found }) => found);
  const sites: CompanionSite[] = scans.flatMap(({ sites: found }) => found);

  // Keyed absolute: the scanned paths are whatever the glob produced, while a resolved
  // definition is always absolute.
  const byFile = new Map<string, Alias[]>();
  for (const alias of aliases) {
    const key = resolve(alias.file);
    const list = byFile.get(key);
    if (list) list.push(alias);
    else byFile.set(key, [alias]);
  }
  /** The alias whose declaration contains `offset`. The server points at the name inside it. */
  const aliasAt = ({ file, offset }: { file: string; offset: number }): Alias | undefined =>
    byFile.get(resolve(file))?.find(({ span }) => span[0] <= offset && offset < span[1]);

  const candidates = aliases.map((alias) => (alias.payload ? payloadPositions(alias.payload) : []));
  const queries: Query[] = [];
  for (const [index, list] of candidates.entries())
    for (const candidate of list)
      queries.push({ file: (aliases[index] as Alias).file, offset: candidate.offset });

  // The type argument of every `Val.sealer<X>()`, resolved the same way, so a companion written
  // against a renamed import still meets its alias.
  const siteStart = queries.length;
  for (const site of sites) queries.push({ file: site.file, offset: site.typeOffset });

  const resolved = await resolver.resolveAll(queries);

  /** alias -> the children it holds, as spec paths. */
  const holds = new Map<Alias, { path: string; child: Alias }[]>();
  let cursor = 0;
  for (const [index, list] of candidates.entries()) {
    const parent = aliases[index] as Alias;
    const held: { path: string; child: Alias }[] = [];
    for (const candidate of list) {
      const definitions = resolved[cursor++] ?? [];
      const target = definitions.map(aliasAt).find((found) => found !== undefined);
      if (target) held.push({ path: candidate.path, child: target });
    }
    holds.set(parent, held);
  }

  /** alias -> its companion, once the type argument has been resolved. */
  const companion = new Map<Alias, CompanionSite>();
  for (const [index, site] of sites.entries()) {
    const definitions = resolved[siteStart + index] ?? [];
    const target = definitions.map(aliasAt).find((found) => found !== undefined);
    // Two chains for one alias is not a shape worth reporting on; the first one wins.
    if (target && !companion.has(target)) companion.set(target, site);
  }

  /**
   * Which aliases a parent must dispatch to.
   *
   * Closed transitively, so `Order -> OrderLine -> Money` reports both levels at once. Reporting
   * only the innermost would grow a new finding each time one was fixed.
   */
  const dispatches = new Set<Alias>();
  for (const alias of aliases) {
    const site = companion.get(alias);
    if (site?.spec) dispatches.add(alias);
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const [parent, held] of holds) {
      if (dispatches.has(parent)) continue;
      if (held.some(({ child }) => dispatches.has(child))) {
        dispatches.add(parent);
        changed = true;
      }
    }
  }

  const findings: StructuralEquals[] = [];
  for (const [parent, held] of holds) {
    const site = companion.get(parent);
    // No companion in the scanned files means no `equals` anyone can call.
    if (!site) continue;
    if (site.spec && isOverride(site.spec)) continue;
    const covered = site.spec ? specPaths(site.spec) : new Set<string>();
    for (const { path, child } of held) {
      if (child === parent || !dispatches.has(child)) continue;
      if (prefixes(path).some((prefix) => covered.has(prefix))) continue;
      findings.push({
        kind: "structural-equals",
        file: site.file,
        line: site.line,
        column: site.column,
        parent: parent.alias,
        path,
        child: child.alias,
        message: `${parent.alias}.${path} holds ${child.alias}, which has its own equals`,
      });
    }
  }
  return findings;
}
