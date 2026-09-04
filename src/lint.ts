import { readFileSync } from "node:fs";

/** Where a finding sits. `line` is 1-based, for an editor. */
type Where = { file: string; line: number };

/** A companion member that nothing in the scanned files reads. */
export type UnusedMember = Where & {
  kind: "unused-member";
  /** The companion's declared name, as written at its declaration site. */
  companion: string;
  /** The member's key. */
  member: string;
};

/**
 * A brand string that more than one type alias claims. Two Vals with the same brand and the
 * same payload are silently assignable to each other, which is the whole failure the brand
 * exists to prevent.
 */
export type DuplicateBrand = Where & {
  kind: "duplicate-brand";
  brand: string;
  /** The alias that claims it, as written. */
  alias: string;
};

export type Finding = UnusedMember | DuplicateBrand;

/**
 * Attached by `attach` rather than written in `.impl`, or written there as an override of one.
 * An override is part of the type's contract even when this project never calls it, so none of
 * these are ever reported.
 */
const BUILTIN = new Set(["equals", "with", "update", "seal", "create"]);

/** The ESTree subset this walks. Narrow by `type` before reading anything past `type`. */
type Node = { type: string; [key: string]: unknown };

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as Node).type === "string";

/** The name a key node contributes, for `k: v`, `"k": v`, `k(){}` and shorthand alike. */
function keyName(node: Node, computed: boolean): string | undefined {
  // `[expr]: v` names nothing statically; `["k"]: v` is a literal and does.
  if (node.type === "Identifier" && !computed) return node["name"] as string;
  if (node.type === "Literal" && typeof node["value"] === "string") return node["value"];
  return undefined;
}

/**
 * The name a type reference is written under, or `undefined` when it is not a plain one.
 *
 * `Val<…>` gives `Val`, and `valof.Val<…>` through a namespace import gives the same, since the
 * namespace only says where the name came from. The caller still resolves the result against
 * the file's import aliases, which is what tells `Val` apart from something else bound to that
 * name.
 */
function valName(typeName: Node, namespaces: ReadonlySet<string>): string | undefined {
  if (typeName.type === "Identifier") return typeName["name"] as string;
  if (typeName.type !== "TSQualifiedName") return undefined;
  const left = typeName["left"];
  const right = typeName["right"];
  if (!isNode(left) || !isNode(right) || left.type !== "Identifier") return undefined;
  if (!namespaces.has(left["name"] as string)) return undefined;
  // Qualified by a namespace import, so the name is already the exporting module's own.
  return right.type === "Identifier" ? (right["name"] as string) : undefined;
}

/**
 * The dotted name a call chain is rooted at: `Val.sealer<X>().impl` gives `Val.sealer`, and
 * `valof.Val.companion<X>().implSeal(f)` gives `valof.Val.companion`. Type arguments and call
 * parentheses carry no name, so they drop out.
 */
function rootPath(node: Node): string[] | undefined {
  if (node.type === "Identifier") return [node["name"] as string];
  if (node.type === "CallExpression") {
    const callee = node["callee"];
    return isNode(callee) ? rootPath(callee) : undefined;
  }
  if (node.type !== "MemberExpression") return undefined;
  const object = node["object"];
  const property = node["property"];
  if (!isNode(object) || !isNode(property)) return undefined;
  const left = rootPath(object);
  const name = keyName(property, node["computed"] === true);
  return left && name ? [...left, name] : left;
}

/** Byte offset -> 1-based line, from a prefix scan done once per file. */
function lineIndex(source: string): (offset: number) => number {
  const starts = [0];
  for (let i = source.indexOf("\n"); i !== -1; i = source.indexOf("\n", i + 1)) starts.push(i + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((starts[mid] as number) <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}

function collect<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(value);
}

/**
 * Reports what the type checker cannot: companion members nothing reads, and a brand string
 * claimed by more than one type alias.
 *
 * Two passes over the same files: one collects what each `.impl({…})` declares, the other every
 * way a name is read off an identifier. They meet on the companion's declared name, so an import
 * that renames it is resolved through the import specifier.
 *
 * A declaration is kept per site rather than per name, because two modules may each declare a
 * companion called `User`; reads stay keyed by name alone, so a read anywhere counts for both.
 * That is the safe direction: the reads side over-approximates and the declarations side does
 * not lose one.
 *
 * Resolution is by name, not by type. A read is followed across files through a plain import, a
 * renamed one, a namespace import and an `export { X as Y }` rename.
 *
 * A companion is matched by where its chain grows from, `Val.sealer` or `Val.companion`, rather
 * than by the shape of `.impl({…})` alone, so an unrelated library's `.impl` stays out. A
 * builder bound to a local first counts too, since that binding is itself Val-rooted.
 *
 * Two ways it is wrong, in opposite directions. A read that spells no name, `User[method]` or a
 * companion reached through a default export, is not seen, so the member is reported although it
 * is used. And a spread into `.impl({ ...base })` contributes no keys at all, so those members
 * are never reported however dead they are.
 *
 * The parser is loaded here rather than imported at the top: it is an optional peer dependency,
 * and a static import would be hoisted above the caller's own error handling once bundled,
 * turning a missing install into a stack trace instead of an instruction.
 */
export async function lint(files: readonly string[]): Promise<Finding[]> {
  const { parseSync, visitorKeys } = await import("oxc-parser");

  const declared: UnusedMember[] = [];
  /**
   * Every read, as the name it was reached by. Resolved after the walk, because the module that
   * renames a companion on the way out may be parsed after the one that reads it.
   */
  const pending: { name: string; key: string }[] = [];
  /** `export { User as Public }`: the name outside -> the name at the declaration. */
  const exportedAs = new Map<string, string>();
  /** brand string -> every alias that claims it */
  const brands = new Map<string, DuplicateBrand[]>();

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const lineOf = lineIndex(source);
    // File-local, both of them: a name imported here says nothing about the same name elsewhere.
    const imported = new Map<string, string>();
    const reads = new Map<string, Set<string>>();
    /** `import * as ns`: reads through one arrive already named as the other module names them. */
    const namespaces = new Set<string>();
    const namespaceReads = new Map<string, Set<string>>();
    /** Locals holding a builder, so `const seal = Val.sealer<X>(); seal.impl({…})` is seen. */
    const builders = new Set<string>();
    /** Resolved against `imported` once the file is walked, so `Val` may be imported renamed. */
    const aliases: { typeName: string; brand: string; alias: string; line: number }[] = [];

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

    const visit = (node: Node): void => {
      switch (node.type) {
        case "VariableDeclarator": {
          const id = node["id"];
          const init = node["init"];
          if (!isNode(id) || !isNode(init)) break;
          // `const { a, b: c } = X` reads `a` and `b` off `X`.
          if (id.type === "ObjectPattern" && init.type === "Identifier") {
            for (const property of id["properties"] as unknown[]) {
              if (!isNode(property) || property.type !== "Property") continue;
              const key = property["key"];
              if (!isNode(key)) continue;
              const name = keyName(key, property["computed"] === true);
              if (name) collect(reads, init["name"] as string, name);
            }
            break;
          }
          if (id.type !== "Identifier") break;
          // `const seal = Val.sealer<X>()`, whose `.impl` is called later on the binding.
          if (init.type !== "CallExpression") {
            if (fromVal(init)) builders.add(id["name"] as string);
            break;
          }
          const callee = init["callee"];
          if (!isNode(callee) || callee.type !== "MemberExpression") {
            if (fromVal(init)) builders.add(id["name"] as string);
            break;
          }
          const property = callee["property"];
          if (!isNode(property) || keyName(property, callee["computed"] === true) !== "impl") {
            if (fromVal(init)) builders.add(id["name"] as string);
            break;
          }
          const receiver = callee["object"];
          // Matched by where the chain grows from, not by the shape of `.impl` alone, so an
          // unrelated library's `.impl({…})` stays out of the report.
          if (!isNode(receiver) || !fromVal(receiver)) break;
          // `.impl()` takes no argument, and `.impl(fns)` passes a variable this cannot see into.
          const object = (init["arguments"] as unknown[])[0];
          if (!isNode(object) || object.type !== "ObjectExpression") break;
          for (const member of object["properties"] as unknown[]) {
            if (!isNode(member) || member.type !== "Property") continue;
            const key = member["key"];
            if (!isNode(key)) continue;
            const name = keyName(key, member["computed"] === true);
            if (name && !BUILTIN.has(name)) {
              declared.push({
                kind: "unused-member",
                companion: id["name"] as string,
                member: name,
                file,
                line: lineOf(member["start"] as number),
              });
            }
          }
          break;
        }
        case "MemberExpression": {
          const object = node["object"];
          const property = node["property"];
          if (!isNode(object) || !isNode(property)) break;
          const name = keyName(property, node["computed"] === true);
          if (!name) break;
          if (object.type === "Identifier") {
            collect(reads, object["name"] as string, name);
            break;
          }
          // `ns.User.greet`: the companion is the middle name, and it is the exporting module's
          // name for it, so it skips this file's import aliases.
          if (object.type !== "MemberExpression") break;
          const namespace = object["object"];
          const companion = object["property"];
          if (!isNode(namespace) || !isNode(companion)) break;
          if (namespace.type !== "Identifier" || !namespaces.has(namespace["name"] as string))
            break;
          const through = keyName(companion, object["computed"] === true);
          if (through) collect(namespaceReads, through, name);
          break;
        }
        case "ImportNamespaceSpecifier": {
          const local = node["local"];
          if (isNode(local) && local.type === "Identifier") namespaces.add(local["name"] as string);
          break;
        }
        case "ExportSpecifier": {
          const local = node["local"];
          const exported = node["exported"];
          if (!isNode(local) || !isNode(exported)) break;
          const outside = keyName(exported, false);
          const inside = keyName(local, false);
          if (outside && inside) exportedAs.set(outside, inside);
          break;
        }
        case "ImportSpecifier": {
          const original = node["imported"];
          const local = node["local"];
          if (!isNode(original) || !isNode(local)) break;
          const name = keyName(original, false);
          if (name) imported.set(local["name"] as string, name);
          break;
        }
        default:
          break;
      }

      for (const key of visitorKeys[node.type] ?? []) {
        const child = node[key];
        if (Array.isArray(child)) {
          for (const element of child) if (isNode(element)) visit(element);
        } else if (isNode(child)) visit(child);
      }
    };

    const program = parseSync(file, source).program as unknown as Node;
    visit(program);

    // Only a top-level alias can be imported and assigned somewhere else, which is the collision
    // this reports. A `type Point` inside a `describe` block collides with nothing.
    for (const statement of program["body"] as unknown[]) {
      if (!isNode(statement)) continue;
      const node =
        statement.type === "ExportNamedDeclaration" ? statement["declaration"] : statement;
      if (!isNode(node) || node.type !== "TSTypeAliasDeclaration") continue;
      const id = node["id"];
      const annotation = node["typeAnnotation"];
      if (!isNode(id) || !isNode(annotation) || annotation.type !== "TSTypeReference") continue;
      const typeName = annotation["typeName"];
      const args = annotation["typeArguments"];
      if (!isNode(typeName) || !isNode(args)) continue;
      const named = valName(typeName, namespaces);
      if (named === undefined) continue;
      const first = (args["params"] as unknown[])[0];
      if (!isNode(first) || first.type !== "TSLiteralType") continue;
      const literal = first["literal"];
      // A generic brand, `Val<K, T>` inside a helper, names nothing to collide over.
      if (!isNode(literal) || typeof literal["value"] !== "string") continue;
      aliases.push({
        typeName: named,
        brand: literal["value"],
        alias: id["name"] as string,
        line: lineOf(node["start"] as number),
      });
    }

    for (const [local, keys] of reads) {
      const name = imported.get(local) ?? local;
      for (const key of keys) pending.push({ name, key });
    }
    for (const [name, keys] of namespaceReads) {
      for (const key of keys) pending.push({ name, key });
    }

    for (const { typeName, brand, alias, line } of aliases) {
      if ((imported.get(typeName) ?? typeName) !== "Val") continue;
      const claims = brands.get(brand) ?? [];
      claims.push({ kind: "duplicate-brand", brand, alias, file, line });
      brands.set(brand, claims);
    }
  }

  /** Walks `export { A as B }` back to the declared name, tolerating a chain of them. */
  const declaredName = (name: string): string => {
    const seen = new Set<string>();
    let current = name;
    while (!seen.has(current)) {
      seen.add(current);
      const inside = exportedAs.get(current);
      if (inside === undefined || inside === current) break;
      current = inside;
    }
    return current;
  };

  const read = new Map<string, Set<string>>();
  for (const { name, key } of pending) collect(read, declaredName(name), key);

  const duplicates = [...brands.values()].filter((claims) => claims.length > 1).flat();

  return [
    ...declared.filter(({ companion, member }) => !read.get(companion)?.has(member)),
    ...duplicates,
  ].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind));
}
