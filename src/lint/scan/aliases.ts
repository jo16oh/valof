import { child, children, keyName, unparenthesized, type Node, type Where } from "../ast.ts";
import { original, symbolRef, type Bindings, type SymbolRef } from "./bindings.ts";

/** A top-level `type X = Val<"brand", payload>`. */
export type Alias = {
  file: string;
  alias: string;
  ref: SymbolRef;
  /** Traits declared in Val's third argument. */
  traits: DeclaredTrait[];
};

/** A top-level `type X = Trait<…>`. Kept separate from Val aliases and their own rules. */
export type TraitAlias = { file: string; alias: string; ref: SymbolRef };

/** A top-level `type X = Enum<…>`, whose variants each derive a Val of their own. */
export type EnumAlias = Alias & {
  /**
   * The variant names, or `undefined` where the syntax does not settle them. Every rule reading
   * them stays silent on `undefined` rather than guessing at a mapped type or an import.
   */
  variants: readonly string[] | undefined;
};

/** One Trait named in a Val's third argument, at the occurrence in the Val declaration. */
export type DeclaredTrait = Where & {
  name: string;
  ref: SymbolRef;
};

/**
 * A top-level `type A = B`, where `B` is a bare reference and nothing more.
 *
 * `A` is a second name for whatever `B` is. Whether that is a Val is not known here: it takes
 * the other file's aliases, which the rule has and this walk does not.
 */
export type ReAlias = Where & {
  alias: string;
  ref: SymbolRef;
  /** The name on the right, as the declaring module names it when it was qualified. */
  target: string;
  targetRef: SymbolRef;
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
function valName(typeName: Node, namespaces: ReadonlyMap<string, string>): string | undefined {
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
 * Top-level Val and Trait aliases, and the brands they claim.
 *
 * Only a top-level alias can be imported and assigned somewhere else, which is the collision the
 * brand rule reports. A `type Point` inside a `describe` block collides with nothing.
 *
 * The alias must spell `Val<…>` itself. A user's helper around it, `type Branded<K, T> =
 * Val<K, T>`, is invisible to these facts.
 */
export function valAliases(
  program: Node,
  file: string,
  bound: Bindings,
  at: (offset: number) => Where,
): {
  aliases: Alias[];
  traitAliases: TraitAlias[];
  enumAliases: EnumAlias[];
  brands: BrandClaim[];
  reAliases: ReAlias[];
} {
  const aliases: Alias[] = [];
  const traitAliases: TraitAlias[] = [];
  const enumAliases: EnumAlias[] = [];
  const brands: BrandClaim[] = [];
  const reAliases: ReAlias[] = [];
  const locals = localAliases(program);

  for (const statement of children(program, "body")) {
    const node =
      statement.type === "ExportNamedDeclaration" ? child(statement, "declaration") : statement;
    if (!node || node.type !== "TSTypeAliasDeclaration") continue;
    const id = child(node, "id");
    const annotation = unparenthesized(child(node, "typeAnnotation"));
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
        ref: symbolRef(file, bound, id["name"] as string),
        target: named,
        targetRef: symbolRef(
          file,
          bound,
          named,
          typeName.type === "TSQualifiedName"
            ? (child(typeName, "left")?.["name"] as string)
            : undefined,
        ),
      });
      continue;
    }

    const kind = original(bound, named);
    const declared = {
      file,
      alias: id["name"] as string,
      ref: symbolRef(file, bound, id["name"] as string),
    };
    if (kind === "Val") {
      aliases.push({
        ...declared,
        traits: traitNames(children(args, "params")[2], file, bound, locals, at),
      });
    } else if (kind === "Trait") {
      traitAliases.push(declared);
    } else if (kind === "Enum") {
      enumAliases.push({
        ...declared,
        // The same position as a Val's: an enum's third argument carries the traits, the shared
        // fields and the tag's name, all intersected.
        traits: traitNames(children(args, "params")[2], file, bound, locals, at),
        variants: variantNames(children(args, "params")[1], bound, locals),
      });
    }

    const first = unparenthesized(children(args, "params")[0]);
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

  return { aliases, traitAliases, enumAliases, brands, reAliases };
}

/** Every top-level `type X = …` in the file, which the two syntax-only walks below expand. */
function localAliases(program: Node): Map<string, Node> {
  const aliases = new Map<string, Node>();
  for (const statement of children(program, "body")) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ? child(statement, "declaration") : statement;
    if (declaration?.type !== "TSTypeAliasDeclaration") continue;
    const id = child(declaration, "id");
    const annotation = child(declaration, "typeAnnotation");
    if (id?.type === "Identifier" && annotation) aliases.set(id["name"] as string, annotation);
  }
  return aliases;
}

/**
 * The variants an Enum declaration spells, or `undefined` where the syntax does not settle them.
 *
 * An index signature, a mapped type, `Record<never, never>` and an imported alias all give
 * `undefined`: each of them declares variants this walk cannot name.
 */
function variantNames(
  node: Node | undefined,
  bound: Bindings,
  aliases: ReadonlyMap<string, Node>,
): readonly string[] | undefined {
  let found: readonly string[] | undefined;
  const visit = (one: Node, seen: ReadonlySet<string>): boolean => {
    const inside = unparenthesized(one);
    if (!inside) return false;
    if (inside.type === "TSIntersectionType")
      return children(inside, "types").every((part) => visit(part, seen));
    if (inside.type === "TSTypeReference") {
      const name = child(inside, "typeName");
      const named = name && valName(name, bound.namespaces);
      if (!named) return false;
      // The tag's name arrives as a marker, which declares no variant of its own.
      if (original(bound, named) === "Tag") return true;
      const alias = aliases.get(named);
      if (!alias || seen.has(named)) return false;
      return visit(alias, new Set(seen).add(named));
    }
    if (inside.type !== "TSTypeLiteral" || found) return false;
    const names: string[] = [];
    for (const member of children(inside, "members")) {
      if (member.type !== "TSPropertySignature") return false;
      const key = child(member, "key");
      const name = key && keyName(key, member["computed"] === true);
      if (!name) return false;
      names.push(name);
    }
    found = names;
    return true;
  };
  return node && visit(node, new Set()) ? found : undefined;
}

/** Expands the deliberately small, syntax-only trait-list language used by Val declarations. */
function traitNames(
  node: Node | undefined,
  file: string,
  bound: Bindings,
  aliases: ReadonlyMap<string, Node>,
  at: (offset: number) => Where,
): DeclaredTrait[] {
  if (!node) return [];
  const seen = new Set<string>();
  const out = new Map<string, DeclaredTrait>();
  const visit = (one: Node, occurrence = one): void => {
    const inside = unparenthesized(one);
    if (!inside) return;
    if (inside !== one) return visit(inside, occurrence === one ? inside : occurrence);
    if (one.type === "TSIntersectionType") {
      for (const part of children(one, "types"))
        visit(part, occurrence === one ? part : occurrence);
      return;
    }
    if (one.type !== "TSTypeReference") return;
    const name = child(one, "typeName");
    const named = name && valName(name, bound.namespaces);
    if (!named) return;
    // An enum's tag arrives in the same argument, and the marker carrying it names no trait.
    if (original(bound, named) === "Tag") return;
    const qualifier =
      name.type === "TSQualifiedName" ? (child(name, "left")?.["name"] as string) : undefined;
    const ref = symbolRef(file, bound, named, qualifier);
    if (seen.has(ref.key)) return;
    seen.add(ref.key);
    const alias = unparenthesized(aliases.get(named));
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
    out.set(ref.key, {
      ...at(written["start"] as number),
      name: named,
      ref,
    });
  };
  visit(node);
  return [...out.values()];
}
