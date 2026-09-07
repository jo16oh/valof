import { readFileSync } from "node:fs";

import { child, children, isNode, keyName, lineIndex, rootPath, type Node } from "./ast.ts";
import { disabledLines } from "./directives.ts";

/**
 * A top-level `type X = Val<"brand", payload>`, as the collector found it.
 *
 * `span` is the whole declaration, which is what a resolved definition is tested against: the
 * server points at the name, and containment turns that back into the alias.
 */
export type Alias = {
  file: string;
  alias: string;
  span: [number, number];
  /** The second type argument. Absent when the alias is generic over its payload. */
  payload: Node | undefined;
};

/** A `Val.sealer<X>()` / `Val.companion<X>()` chain, whatever else it registered. */
export type CompanionSite = {
  file: string;
  line: number;
  /** The type argument, resolved to an alias after the walk. */
  typeName: string;
  typeOffset: number;
  /** The argument to `.implEquals(…)`, when the chain called it. */
  spec: Node | undefined;
};

/** What one file contributes, before any rule has an opinion about it. */
export type Scan = {
  file: string;
  /** local name -> the name the exporting module uses. */
  imported: Map<string, string>;
  /** `import * as ns`: reads through one arrive already named as that module names them. */
  namespaces: Set<string>;
  /** `export { A as B }`: the name outside -> the name at the declaration. */
  exportedAs: Map<string, string>;
  /** Members an `.impl({…})` registered here, with the local name of their companion. */
  members: { companion: string; member: string; line: number }[];
  /** Keys read off a local name. */
  reads: Map<string, Set<string>>;
  /** Keys read through a namespace, already named as the exporting module names them. */
  namespaceReads: Map<string, Set<string>>;
  /** Top-level `type X = Val<"brand", …>`, for the duplicate-brand rule. */
  brands: { typeName: string; brand: string; alias: string; line: number }[];
  /** The same aliases with their payload, for the structural-equals rule. */
  valAliases: Alias[];
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

/**
 * The name a type reference is written under, or `undefined` when it is not a plain one.
 *
 * `Val<…>` gives `Val`, and `valof.Val<…>` through a namespace import gives the same, since the
 * namespace only says where the name came from. The caller still resolves the result against the
 * file's import aliases, which is what tells `Val` apart from something else bound to that name.
 */
function valName(typeName: Node, namespaces: ReadonlySet<string>): string | undefined {
  if (typeName.type === "Identifier") return typeName["name"] as string;
  if (typeName.type !== "TSQualifiedName") return undefined;
  const left = child(typeName, "left");
  const right = child(typeName, "right");
  if (!left || !right || left.type !== "Identifier") return undefined;
  if (!namespaces.has(left["name"] as string)) return undefined;
  // Qualified by a namespace import, so the name is already the exporting module's own.
  return right.type === "Identifier" ? (right["name"] as string) : undefined;
}

function collect<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(value);
}

/**
 * Walks one file once, for every rule.
 *
 * One walk rather than one per rule because the rules share their footing: `imported` and
 * `namespaces` resolve a name for all three, and the chain analysis that spots `.impl({…})` is
 * the same one that spots `.implEquals`. What comes back is material, not findings; deciding is
 * the rules' job, and they see every file rather than this one.
 */
export function scan(file: string, { parseSync, visitorKeys }: Parser): Scan {
  const source = readFileSync(file, "utf8");
  const lineOf = lineIndex(source);

  // File-local, all of them: a name imported here says nothing about the same name elsewhere.
  const imported = new Map<string, string>();
  const namespaces = new Set<string>();
  const exportedAs = new Map<string, string>();
  const members: Scan["members"] = [];
  const reads = new Map<string, Set<string>>();
  const namespaceReads = new Map<string, Set<string>>();
  const brands: Scan["brands"] = [];
  const valAliases: Alias[] = [];
  const sites: CompanionSite[] = [];
  /** Locals holding a builder, so `const seal = Val.sealer<X>(); seal.impl({…})` is seen. */
  const builders = new Set<string>();

  /** Whether a chain grows from `Val.sealer` or `Val.companion`, however `Val` was bound. */
  const fromVal = (node: Node): boolean => {
    const path = rootPath(node);
    if (!path || path.length === 0) return false;
    const [first, second, third] = path as [string, string?, string?];
    if (path.length === 1) return builders.has(first);
    // `valof.Val.sealer`: step past the namespace, which only says where the name came from.
    const qualified = namespaces.has(first);
    const name = qualified ? second : (imported.get(first) ?? first);
    const step = qualified ? third : second;
    return name === "Val" && (step === "sealer" || step === "companion");
  };

  /**
   * Reads a builder chain from the outside in: the steps it called, and the type argument at its
   * root. `Val.companion<Order>().implSeal(f).implEquals(spec).impl({…})` gives both `implEquals`
   * and `Order`.
   *
   * A call whose receiver is not itself a call is the root, which is what tells `Val.sealer<X>()`
   * apart from the steps chained onto it.
   */
  const chain = (node: Node, steps: Map<string, Node>): Node | undefined => {
    if (node.type !== "CallExpression") return undefined;
    const callee = child(node, "callee");
    if (!callee || callee.type !== "MemberExpression") return undefined;
    const receiver = child(callee, "object");
    if (!receiver) return undefined;
    if (receiver.type !== "CallExpression") {
      return fromVal(callee) ? child(node, "typeArguments") : undefined;
    }
    const property = child(callee, "property");
    const name = property && keyName(property, callee["computed"] === true);
    const [argument] = children(node, "arguments");
    if (name && argument) steps.set(name, argument);
    return chain(receiver, steps);
  };

  /** Records the chain as a companion site, keyed later by resolving its type argument. */
  const site = (node: Node): void => {
    const steps = new Map<string, Node>();
    const args = chain(node, steps);
    const [first] = args ? children(args, "params") : [];
    if (!first || first.type !== "TSTypeReference") return;
    const typeName = child(first, "typeName");
    if (!typeName || typeName.type !== "Identifier") return;
    sites.push({
      file,
      line: lineOf(node["start"] as number),
      typeName: typeName["name"] as string,
      typeOffset: typeName["start"] as number,
      spec: steps.get("implEquals"),
    });
  };

  const visit = (node: Node): void => {
    switch (node.type) {
      case "VariableDeclarator": {
        const id = child(node, "id");
        const init = child(node, "init");
        if (!id || !init) break;
        site(init);
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
          if (fromVal(init)) builders.add(id["name"] as string);
          break;
        }
        const receiver = callee && child(callee, "object");
        // Matched by where the chain grows from, not by the shape of `.impl` alone, so an
        // unrelated library's `.impl({…})` stays out of the report.
        if (!receiver || !fromVal(receiver)) break;
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
              companion: id["name"] as string,
              member: name,
              line: lineOf(member["start"] as number),
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
        if (namespace.type !== "Identifier" || !namespaces.has(namespace["name"] as string)) break;
        const through = keyName(companion, object["computed"] === true);
        if (through) collect(namespaceReads, through, name);
        break;
      }
      case "ImportNamespaceSpecifier": {
        const local = child(node, "local");
        if (local?.type === "Identifier") namespaces.add(local["name"] as string);
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
        const original = child(node, "imported");
        const local = child(node, "local");
        if (!original || !local) break;
        const name = keyName(original, false);
        if (name) imported.set(local["name"] as string, name);
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

  // Only a top-level alias can be imported and assigned somewhere else, which is the collision
  // the brand rule reports. A `type Point` inside a `describe` block collides with nothing.
  for (const statement of children(program, "body")) {
    const node =
      statement.type === "ExportNamedDeclaration" ? child(statement, "declaration") : statement;
    if (!node || node.type !== "TSTypeAliasDeclaration") continue;
    const id = child(node, "id");
    const annotation = child(node, "typeAnnotation");
    if (!id || !annotation || annotation.type !== "TSTypeReference") continue;
    const typeName = child(annotation, "typeName");
    const args = child(annotation, "typeArguments");
    if (!typeName || !args) continue;
    const named = valName(typeName, namespaces);
    if (named === undefined) continue;
    if ((imported.get(named) ?? named) === "Val") {
      // The payload is the second argument. Absent on `Val<K, T>` inside a helper, which
      // describes no particular value.
      valAliases.push({
        file,
        alias: id["name"] as string,
        span: [node["start"] as number, node["end"] as number],
        payload: children(args, "params")[1],
      });
    }
    const [first] = children(args, "params");
    if (!first || first.type !== "TSLiteralType") continue;
    const literal = child(first, "literal");
    // A generic brand, `Val<K, T>` inside a helper, names nothing to collide over.
    if (!literal || typeof literal["value"] !== "string") continue;
    brands.push({
      typeName: named,
      brand: literal["value"],
      alias: id["name"] as string,
      line: lineOf(node["start"] as number),
    });
  }

  return {
    file,
    imported,
    namespaces,
    exportedAs,
    members,
    reads,
    namespaceReads,
    brands,
    valAliases,
    sites,
    disabled: disabledLines(parsed.comments, source, lineOf),
  };
}
