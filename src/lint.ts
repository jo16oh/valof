import { readFileSync } from "node:fs";
import { child, children, isNode, keyName, lineIndex, rootPath, type Node } from "./ast.ts";
import { resolver } from "./definitions.ts";
import {
  structuralEquals,
  type Alias,
  type CompanionSite,
  type StructuralEquals,
} from "./equals-rule.ts";

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

export type Finding = UnusedMember | DuplicateBrand | StructuralEquals;

/**
 * Wired by the library, each through a step of its own. `.impl` rejects them at the type level,
 * so this only keeps a plain-JS caller from getting a finding for one.
 */
const BUILTIN = new Set(["equals", "patch", "update", "seal", "create"]);

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
  const left = child(typeName, "left");
  const right = child(typeName, "right");
  if (!left || !right || left.type !== "Identifier") return undefined;
  if (!namespaces.has(left["name"] as string)) return undefined;
  // Qualified by a namespace import, so the name is already the exporting module's own.
  return right.type === "Identifier" ? (right["name"] as string) : undefined;
}

/**
 * The kinds one comment silences, or `undefined` when it carries no directive. An empty set
 * stands for every kind, which is what a bare `valof-lint-disable-next-line` means.
 */
function directive(text: string): Set<string> | undefined {
  const match = /(?:^|\s)valof-lint-disable-next-line(?:[^\S\n]+([^\n]*))?/.exec(text);
  if (!match) return undefined;
  // Everything after `--` is a note for the reader, the way other linters spell it.
  const listed = (match[1] ?? "").split("--")[0] ?? "";
  return new Set(listed.split(/[\s,]+/).filter(Boolean));
}

/** Whether nothing but whitespace precedes `start` on its line. */
function ownLine(source: string, start: number): boolean {
  for (let index = start - 1; index >= 0; index--) {
    const character = source[index];
    if (character === "\n") return true;
    if (character !== " " && character !== "\t" && character !== "\r") return false;
  }
  return true;
}

/** An empty set already covers every kind, so it wins over any list. */
function widen(left: Set<string>, right: Set<string>): Set<string> {
  if (left.size === 0 || right.size === 0) return new Set();
  return new Set([...left, ...right]);
}

/**
 * 1-based line -> the kinds a directive silences there.
 *
 * The whole comment block above a line is read, not only the comment touching it, so a
 * `valof-lint-disable-next-line` may sit among another linter's directives in any order. A block
 * is a run of own-line comments with no blank line and no code between them; a trailing comment
 * after code belongs to no block, and a blank line starts a new one.
 */
function disabledLines(
  comments: readonly { value: string; start: number; end: number }[],
  source: string,
  lineOf: (offset: number) => number,
): Map<number, Set<string>> {
  const byLine = new Map<number, Set<string>>();
  /** The last line of the block being read, or -1 when the previous comment closed one. */
  let blockEnd = -1;
  /** Where that comment ended, so code written after it on its own line breaks the block. */
  let blockEndOffset = 0;
  /** What the block has silenced so far, or `undefined` while it holds no directive. */
  let kinds: Set<string> | undefined;

  for (const comment of comments) {
    if (!ownLine(source, comment.start)) {
      blockEnd = -1;
      kinds = undefined;
      continue;
    }
    const joins =
      blockEnd !== -1 &&
      lineOf(comment.start) <= blockEnd + 1 &&
      source.slice(blockEndOffset, comment.start).trim() === "";
    if (!joins) kinds = undefined;
    const found = directive(comment.value);
    if (found) kinds = kinds ? widen(kinds, found) : found;
    blockEnd = lineOf(comment.end);
    blockEndOffset = comment.end;
    // Rewritten as the block grows, so the entry lands on the line that follows all of it.
    if (kinds) byLine.set(blockEnd + 1, kinds);
  }
  return byLine;
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
 * A finding is dropped when the comment block directly above its line holds a
 * `valof-lint-disable-next-line`, optionally followed by the kinds to silence.
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
  /** Every top-level Val alias, for the structural-equals rule to resolve references against. */
  const valAliases: Alias[] = [];
  /** Every `Val.sealer<X>()` / `Val.companion<X>()` chain, and what it registered. */
  const sites: CompanionSite[] = [];
  /** file -> the lines a comment directive silences there, applied once every file is read. */
  const disabled = new Map<string, Map<number, Set<string>>>();

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

    /**
     * Reads a builder chain from the outside in: the steps it called, and the type argument at
     * its root. `Val.companion<Order>().implSeal(f).implEquals(spec).impl({…})` gives both
     * `implEquals` and `Order`.
     *
     * A call whose receiver is not itself a call is the root, which is what tells
     * `Val.sealer<X>()` apart from the steps chained onto it.
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
          const id = node["id"];
          const init = node["init"];
          if (!isNode(id) || !isNode(init)) break;
          site(init);
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

    const parsed = parseSync(file, source);
    const program = parsed.program as unknown as Node;
    disabled.set(file, disabledLines(parsed.comments, source, lineOf));
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
      if ((imported.get(named) ?? named) === "Val") {
        // The payload is the second argument. Absent on `Val<K, T>` inside a helper, which
        // describes no particular value.
        const payload = children(args, "params")[1];
        valAliases.push({
          file,
          alias: id["name"] as string,
          span: [node["start"] as number, node["end"] as number],
          payload,
        });
      }
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

  /**
   * A directive silences the report, not the fact behind it: the other alias claiming a duplicate
   * brand is still reported, since silencing it is its own line's decision.
   */
  const silenced = ({ file, line, kind }: Finding): boolean => {
    const kinds = disabled.get(file)?.get(line);
    return kinds !== undefined && (kinds.size === 0 || kinds.has(kind));
  };

  // Last, and only this rule needs it: resolving a type reference costs a TypeScript, which the
  // project may not have. Absent one, `structuralEquals` reports nothing.
  //
  // Started only once something could dispatch. With no `.implEquals` in the scanned files there
  // is no custom equality to miss, so a project that never writes one pays nothing for the rule.
  const types = sites.some(({ spec }) => spec) ? resolver(process.cwd(), files) : undefined;
  let structural: StructuralEquals[] = [];
  try {
    structural = await structuralEquals(valAliases, sites, types);
  } finally {
    types?.close();
  }

  return [
    ...declared.filter(({ companion, member }) => !read.get(companion)?.has(member)),
    ...duplicates,
    ...structural,
  ]
    .filter((finding) => !silenced(finding))
    .sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind),
    );
}
