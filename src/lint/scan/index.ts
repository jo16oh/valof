import { readFileSync } from "node:fs";

import { child, children, isNode, keyName, positions, type Node, type Where } from "../ast.ts";
import { valAliases, type Alias, type BrandClaim } from "./aliases.ts";
import { bindings, type Bindings } from "./bindings.ts";
import { companionSite, fromVal, type CompanionSite } from "./chains.ts";
import { disabledLines } from "./directives.ts";

// The pieces a `Scan` is made of, so a rule reads them from the scan rather than reaching past
// it into the walk that produced them.
export { original } from "./bindings.ts";
export type { Bindings } from "./bindings.ts";
export type { Alias, BrandClaim } from "./aliases.ts";
export type { CompanionSite } from "./chains.ts";

/** A member `.impl({…})` registered, under the local name of its companion. */
type Member = Where & { companion: string; member: string };

/**
 * What one file says about itself.
 *
 * Syntactic facts, not any rule's input. Nothing here is named for the rule that happens to read
 * it today, and more than one may: `aliases` and `brands` come from the same pass over the same
 * declarations, and two rules take one each. A new rule needing something new is a reason to add
 * a fact here; it is not a reason for a fact to belong to it.
 */
export type Scan = {
  file: string;
  /** How the file bound the names it uses. */
  bound: Bindings;
  /** What `.impl({…})` registered here. */
  members: Member[];
  /** Keys read off a local name. */
  reads: Map<string, Set<string>>;
  /** Keys read through a namespace, already named as the exporting module names them. */
  namespaceReads: Map<string, Set<string>>;
  /** `export { A as B }`: the name outside -> the name at the declaration. */
  exportedAs: Map<string, string>;
  /** Top-level `type X = Val<…>`, with the payload. */
  aliases: Alias[];
  /** The brand each of those claims, where it spelled one as a literal. */
  brands: BrandClaim[];
  /** `Val.sealer<X>()` / `Val.companion<X>()` chains, and what they registered. */
  sites: CompanionSite[];
  /** 1-based line -> the kinds a comment directive silences there. */
  disabled: Map<number, Set<string>>;
};

/** The parser's surface, passed in so the optional import stays at the caller. */
export type Parser = {
  parseSync: (file: string, source: string) => { program: unknown; comments: readonly Comment[] };
  visitorKeys: Record<string, readonly string[] | undefined>;
};

type Comment = { value: string; start: number; end: number };

/**
 * Attached by the library rather than written in `.impl`. `.impl` rejects them at the type level,
 * so this only keeps a plain-JS caller from getting a finding for one.
 */
const BUILTIN = new Set(["equals", "patch", "update", "seal", "create"]);

function collect<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(value);
}

/**
 * Walks one file once, for every rule.
 *
 * One walk rather than one per rule because the rules share their footing: {@link Bindings}
 * resolves a name for all three, and the chain analysis that spots `.impl({…})` is the same one
 * that spots `.implEquals`. What comes back is material, not findings; deciding is the rules'
 * job, and they see every file rather than this one.
 */
export function scan(file: string, { parseSync, visitorKeys }: Parser): Scan {
  const source = readFileSync(file, "utf8");
  const at = positions(source);

  const bound = bindings();
  const exportedAs = new Map<string, string>();
  const members: Member[] = [];
  const reads = new Map<string, Set<string>>();
  const namespaceReads = new Map<string, Set<string>>();
  const sites: CompanionSite[] = [];

  const visit = (node: Node): void => {
    switch (node.type) {
      case "VariableDeclarator": {
        const id = child(node, "id");
        const init = child(node, "init");
        if (!id || !init) break;
        const site = companionSite(init, file, at(init["start"] as number), bound);
        if (site) sites.push(site);
        // `const { a, b: c } = X` reads `a` and `b` off `X`.
        if (id.type === "ObjectPattern" && init.type === "Identifier") {
          for (const property of children(id, "properties")) {
            if (property.type !== "Property") continue;
            const key = child(property, "key");
            if (!key) continue;
            const name = keyName(key, property["computed"] === true);
            if (name) collect(reads, init["name"] as string, name);
          }
          break;
        }
        if (id.type !== "Identifier") break;
        // `const seal = Val.sealer<X>()`, whose `.impl` is called later on the binding.
        const callee = init.type === "CallExpression" ? child(init, "callee") : undefined;
        const property =
          callee?.type === "MemberExpression" ? child(callee, "property") : undefined;
        const named = property && keyName(property, callee?.["computed"] === true);
        if (named !== "impl") {
          if (fromVal(init, bound)) bound.builders.add(id["name"] as string);
          break;
        }
        const receiver = callee && child(callee, "object");
        // Matched by where the chain grows from, not by the shape of `.impl` alone, so an
        // unrelated library's `.impl({…})` stays out of the report.
        if (!receiver || !fromVal(receiver, bound)) break;
        // `.impl()` takes no argument, and `.impl(fns)` passes a variable this cannot see into.
        const [object] = children(init, "arguments");
        if (!object || object.type !== "ObjectExpression") break;
        for (const member of children(object, "properties")) {
          if (member.type !== "Property") continue;
          const key = child(member, "key");
          if (!key) continue;
          const name = keyName(key, member["computed"] === true);
          if (name && !BUILTIN.has(name)) {
            members.push({
              ...at(member["start"] as number),
              companion: id["name"] as string,
              member: name,
            });
          }
        }
        break;
      }
      case "MemberExpression": {
        const object = child(node, "object");
        const property = child(node, "property");
        if (!object || !property) break;
        const name = keyName(property, node["computed"] === true);
        if (!name) break;
        if (object.type === "Identifier") {
          collect(reads, object["name"] as string, name);
          break;
        }
        // `ns.User.greet`: the companion is the middle name, and it is the exporting module's
        // name for it, so it skips this file's import aliases.
        if (object.type !== "MemberExpression") break;
        const namespace = child(object, "object");
        const companion = child(object, "property");
        if (!namespace || !companion) break;
        if (namespace.type !== "Identifier" || !bound.namespaces.has(namespace["name"] as string))
          break;
        const through = keyName(companion, object["computed"] === true);
        if (through) collect(namespaceReads, through, name);
        break;
      }
      case "ImportNamespaceSpecifier": {
        const local = child(node, "local");
        if (local?.type === "Identifier") bound.namespaces.add(local["name"] as string);
        break;
      }
      case "ExportSpecifier": {
        const local = child(node, "local");
        const exported = child(node, "exported");
        if (!local || !exported) break;
        const outside = keyName(exported, false);
        const inside = keyName(local, false);
        if (outside && inside) exportedAs.set(outside, inside);
        break;
      }
      case "ImportSpecifier": {
        const imported = child(node, "imported");
        const local = child(node, "local");
        if (!imported || !local) break;
        const name = keyName(imported, false);
        if (name) bound.imported.set(local["name"] as string, name);
        break;
      }
      default:
        break;
    }

    for (const key of visitorKeys[node.type] ?? []) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (const element of value) if (isNode(element)) visit(element);
      } else if (isNode(value)) visit(value);
    }
  };

  const parsed = parseSync(file, source);
  const program = parsed.program as Node;
  visit(program);

  // After the walk, which is what collected the imports `Val` is resolved against.
  const { aliases, brands } = valAliases(program, file, bound, at);

  return {
    file,
    bound,
    members,
    reads,
    namespaceReads,
    exportedAs,
    aliases,
    brands,
    sites,
    disabled: disabledLines(parsed.comments, source, (offset) => at(offset).line),
  };
}
