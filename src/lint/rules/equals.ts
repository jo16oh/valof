import { resolve } from "node:path";

import { child as at, children, keyName, type Node } from "../ast.ts";
import type { Query, Resolver } from "../definitions.ts";
import type { Alias, CompanionSite, Scan } from "../scan.ts";

/** A parent that structurally compares a child carrying its own equality. */
export type StructuralEquals = {
  kind: "structural-equals";
  file: string;
  line: number;
  /** The parent alias, as written. */
  parent: string;
  /** Where the child sits in the parent's payload: `total`, `shipping.zip`, `lines[]`. */
  path: string;
  /** The child alias, as written. */
  child: string;
};

/**
 * Type constructors whose shape a spec can mirror, so the walk descends into them.
 *
 * Anything else is opaque, which is what keeps `PayloadOf<Money>` out. A payload written at a
 * field position loses the brand along with the child's seal and its equality, so the fix is to
 * hold the Val there (see notes §4.3), not to bolt the child's comparison onto a payload. The
 * `PayloadOf` rule reports that; firing here as well would send the reader the other way.
 */
const ARRAY_LIKE = new Set(["Array", "ReadonlyArray"]);

/** A candidate child position, before anything is known about what the name refers to. */
type Candidate = { path: string; offset: number; name: string };

/**
 * Every position in a payload type that a spec could address, paired with the name written
 * there.
 *
 * Positions come out as spec paths, so the two walks meet on a string. `readonly Money[]` and
 * `ReadonlyArray<Money>` both give `[]`, the form `EqElements` takes for an array.
 */
export function payloadPositions(payload: Node): Candidate[] {
  const found: Candidate[] = [];

  const walk = (node: Node, path: string): void => {
    switch (node.type) {
      case "TSTypeLiteral":
        for (const member of children(node, "members")) {
          if (member.type !== "TSPropertySignature") continue;
          const key = at(member, "key");
          const annotation = at(member, "typeAnnotation");
          const inner = annotation && at(annotation, "typeAnnotation");
          if (!key || !inner) continue;
          const name = keyName(key, member["computed"] === true);
          if (name) walk(inner, path ? `${path}.${name}` : name);
        }
        return;
      case "TSInterfaceBody":
        for (const member of children(node, "body")) walk(member, path);
        return;
      case "TSArrayType": {
        const element = at(node, "elementType");
        if (element) walk(element, `${path}[]`);
        return;
      }
      case "TSTupleType": {
        const elements = children(node, "elementTypes");
        elements.forEach((element, index) => walk(element, `${path}[${index}]`));
        return;
      }
      case "TSOptionalType":
      case "TSRestType":
      case "TSNamedTupleMember":
      case "TSParenthesizedType": {
        const inner = at(node, "elementType") ?? at(node, "typeAnnotation");
        if (inner) walk(inner, path);
        return;
      }
      case "TSTypeOperator": {
        // `readonly T[]` wraps the array; the position is the same either way.
        const inner = at(node, "typeAnnotation");
        if (inner) walk(inner, path);
        return;
      }
      case "TSUnionType":
      case "TSIntersectionType":
        for (const member of children(node, "types")) walk(member, path);
        return;
      case "TSTypeReference": {
        const typeName = at(node, "typeName");
        if (!typeName || typeName.type !== "Identifier") return;
        const name = typeName["name"] as string;
        const args = at(node, "typeArguments");
        if (ARRAY_LIKE.has(name) && args) {
          const [element] = children(args, "params");
          if (element) walk(element, `${path}[]`);
          return;
        }
        // A leaf. Whether it names a Val is the resolver's question, not the walk's.
        found.push({ path, offset: typeName["start"] as number, name });
        return;
      }
      default:
        return;
    }
  };

  walk(payload, "");
  return found;
}

/**
 * The paths an `.implEquals` argument speaks for.
 *
 * Any entry counts, whatever its shape. `total: Money` delegates, `updatedAt: () => true` drops
 * the key from equality, and both are the author saying they looked. Only silence is a finding.
 *
 * A path is covered by any prefix of itself, so `shipping: someFn` covers `shipping.zip`: the
 * function owns everything below it.
 */
export function specPaths(spec: Node): Set<string> {
  const covered = new Set<string>();

  const walk = (node: Node, path: string): void => {
    covered.add(path);
    if (node.type === "ObjectExpression") {
      for (const property of children(node, "properties")) {
        if (property.type !== "Property") continue;
        const key = at(property, "key");
        const value = at(property, "value");
        if (!key || !value) continue;
        const name = keyName(key, property["computed"] === true);
        if (name) walk(value, path ? `${path}.${name}` : name);
      }
      return;
    }
    if (node.type === "ArrayExpression") {
      const elements = children(node, "elements");
      // One element compares every position, so it covers `[]`; more compare by index.
      if (elements.length === 1) walk(elements[0] as Node, `${path}[]`);
      else elements.forEach((element, index) => walk(element, `${path}[${index}]`));
      // A tuple spec also answers for the array form, and vice versa: which one the payload
      // uses is the payload's business.
      covered.add(`${path}[]`);
    }
  };

  walk(spec, "");
  return covered;
}

/** Whether the spec is a whole hand-written comparison rather than a per-child description. */
const isOverride = (spec: Node): boolean =>
  spec.type === "ArrowFunctionExpression" || spec.type === "FunctionExpression";

/**
 * Whether anything in the scanned files could dispatch.
 *
 * With no `.implEquals` there is no custom equality to miss, so the caller can skip starting a
 * TypeScript at all: a project that never writes one pays nothing for this rule.
 */
export const needsTypes = (scans: readonly Scan[]): boolean =>
  scans.some(({ sites }) => sites.some(({ spec }) => spec));

/**
 * Reports a parent whose payload holds a child that carries its own equality, where the parent's
 * spec says nothing about it.
 *
 * Resolution goes through go-to-definition rather than by name, so a Val reached through a
 * helper alias, a re-export or an `interface` is still seen. Names that do not resolve are left
 * alone, which keeps silence the safe direction.
 */
export async function structuralEquals(
  scans: readonly Scan[],
  resolver: Resolver | undefined,
): Promise<StructuralEquals[]> {
  if (!resolver) return [];
  const aliases: Alias[] = scans.flatMap(({ valAliases }) => valAliases);
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
        parent: parent.alias,
        path,
        child: child.alias,
      });
    }
  }
  return findings;
}

/** `shipping.zip` -> `shipping.zip`, `shipping`. An entry above a path speaks for it. */
function prefixes(path: string): string[] {
  const found = [path];
  for (let index = path.length - 1; index > 0; index--) {
    const character = path[index];
    if (character === "." || character === "[") found.push(path.slice(0, index));
  }
  return found;
}
