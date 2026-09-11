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
  /** Traits declared in Val's third argument. */
  traits: DeclaredTrait[];
};

/** A top-level `type X = Trait<…>`. Kept separate from Val aliases and their payload rules. */
export type TraitAlias = { file: string; alias: string; span: [number, number] };

/** One Trait named in a Val's third argument, at the occurrence in the Val declaration. */
export type DeclaredTrait = Where & {
  name: string;
  /** Present for `Val<…, ns.Greetable>`. */
  qualifier: string | undefined;
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
 * Top-level Val and Trait aliases, with the payload for the structural-equals rule and the brand for the
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
): {
  aliases: Alias[];
  traitAliases: TraitAlias[];
  brands: BrandClaim[];
  reAliases: ReAlias[];
} {
  const aliases: Alias[] = [];
  const traitAliases: TraitAlias[] = [];
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

    const kind =
      original(bound, named) === "Trait"
        ? "trait"
        : original(bound, named) === "Val"
          ? "val"
          : undefined;
    if (kind === "val") {
      // The payload is the second argument. Absent on `Val<K, T>` inside a helper, which
      // describes no particular value.
      aliases.push({
        file,
        alias: id["name"] as string,
        span: [node["start"] as number, node["end"] as number],
        payload: children(args, "params")[1],
        traits: traitNames(children(args, "params")[2], bound, program, at),
      });
    } else if (kind === "trait") {
      traitAliases.push({
        file,
        alias: id["name"] as string,
        span: [node["start"] as number, node["end"] as number],
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

  return { aliases, traitAliases, brands, reAliases };
}

/** Expands the deliberately small, syntax-only trait-list language used by Val declarations. */
function traitNames(
  node: Node | undefined,
  bound: Bindings,
  program: Node,
  at: (offset: number) => Where,
): DeclaredTrait[] {
  if (!node) return [];
  const aliases = new Map<string, Node>();
  for (const statement of children(program, "body")) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ? child(statement, "declaration") : statement;
    if (declaration?.type !== "TSTypeAliasDeclaration") continue;
    const id = child(declaration, "id");
    const annotation = child(declaration, "typeAnnotation");
    if (id?.type === "Identifier" && annotation) aliases.set(id["name"] as string, annotation);
  }
  const seen = new Set<string>();
  const out = new Map<string, DeclaredTrait>();
  const visit = (one: Node, occurrence = one): void => {
    if (one.type === "TSIntersectionType") {
      for (const part of children(one, "types"))
        visit(part, occurrence === one ? part : occurrence);
      return;
    }
    if (one.type !== "TSTypeReference") return;
    const name = child(one, "typeName");
    const named = name && valName(name, bound.namespaces);
    if (!named || seen.has(named)) return;
    seen.add(named);
    const alias = aliases.get(named);
    if (alias?.type === "TSIntersectionType") {
      visit(alias, occurrence);
      return;
    }
    // A local `type Greetable = Trait<…>` names Greetable, not the `Trait` constructor inside it.
    // A bare alias chain is expanded too; unnecessary-alias reports that spelling separately.
    if (alias?.type === "TSTypeReference") {
      const targetName = child(alias, "typeName");
      const target = targetName && valName(targetName, bound.namespaces);
      if (target && original(bound, target) !== "Trait") {
        visit(alias, occurrence);
        return;
      }
    }
    const occurrenceName = child(occurrence, "typeName") ?? occurrence;
    const written =
      occurrenceName.type === "TSQualifiedName"
        ? (child(occurrenceName, "right") ?? occurrenceName)
        : occurrenceName;
    const qualifier =
      name.type === "TSQualifiedName" ? (child(name, "left")?.["name"] as string) : undefined;
    out.set(named, { ...at(written["start"] as number), name: named, qualifier });
  };
  visit(node);
  return [...out.values()];
}
