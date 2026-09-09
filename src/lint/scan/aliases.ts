import { child, children, type Node, type Where } from "../ast.ts";
import { original, type Bindings } from "./bindings.ts";

/**
 * A top-level `type X = Val<"brand", payload>`.
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

/**
 * A top-level `type A = B`, where `B` is a bare reference and nothing more.
 *
 * `A` is a second name for whatever `B` is. Whether that is a Val is not known here: it takes
 * the other file's aliases, which the rule has and this walk does not.
 */
export type ReAlias = Where & {
  alias: string;
  /** The name on the right, as the declaring module names it when it was qualified. */
  target: string;
  /** Whether the target was reached through a namespace, which names the module already. */
  qualified: boolean;
};

/** The brand one alias claims, before anything is known about who else claims it. */
export type BrandClaim = Where & {
  /** The name `Val` was written under here, resolved against the file's imports by the rule. */
  typeName: string;
  brand: string;
  alias: string;
};

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

/**
 * Top-level Val aliases, with the payload for the structural-equals rule and the brand for the
 * duplicate-brand one.
 *
 * Only a top-level alias can be imported and assigned somewhere else, which is the collision the
 * brand rule reports. A `type Point` inside a `describe` block collides with nothing.
 *
 * The alias must spell `Val<…>` itself. A user's helper around it, `type Branded<K, T> =
 * Val<K, T>`, is invisible to both rules.
 */
export function valAliases(
  program: Node,
  file: string,
  bound: Bindings,
  at: (offset: number) => Where,
): { aliases: Alias[]; brands: BrandClaim[]; reAliases: ReAlias[] } {
  const aliases: Alias[] = [];
  const brands: BrandClaim[] = [];
  const reAliases: ReAlias[] = [];

  for (const statement of children(program, "body")) {
    const node =
      statement.type === "ExportNamedDeclaration" ? child(statement, "declaration") : statement;
    if (!node || node.type !== "TSTypeAliasDeclaration") continue;
    const id = child(node, "id");
    const annotation = child(node, "typeAnnotation");
    if (!id || !annotation || annotation.type !== "TSTypeReference") continue;
    const typeName = child(annotation, "typeName");
    const args = child(annotation, "typeArguments");
    if (!typeName) continue;
    const named = valName(typeName, bound.namespaces);
    if (named === undefined) continue;

    if (!args) {
      // `type Wrap<T> = T` describes no particular type, and its right side is a parameter.
      if (child(node, "typeParameters")) continue;
      reAliases.push({
        ...at((id["start"] ?? node["start"]) as number),
        alias: id["name"] as string,
        target: named,
        qualified: typeName.type === "TSQualifiedName",
      });
      continue;
    }

    if (original(bound, named) === "Val") {
      // The payload is the second argument. Absent on `Val<K, T>` inside a helper, which
      // describes no particular value.
      aliases.push({
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
      ...at((id["start"] ?? node["start"]) as number),
      typeName: named,
      brand: literal["value"],
      alias: id["name"] as string,
    });
  }

  return { aliases, brands, reAliases };
}
