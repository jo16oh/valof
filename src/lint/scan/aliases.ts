import { Val, type VariantOf } from "../../index.ts";
import {
  annotationOf,
  keyName,
  Lines,
  typeParams,
  unparenthesized,
  type Node,
  type Position,
} from "../ast.ts";
import type { FilePath } from "../files.ts";
import { Bindings, type SymbolRef } from "./bindings.ts";

/** One Trait named in a Val's third argument, at the occurrence in the Val declaration. */
export type DeclaredTrait = Val<"DeclaredTrait", { at: Position; name: string; ref: SymbolRef }>;
export const DeclaredTrait = Val.companion<DeclaredTrait>().build();

/** A top-level `type X = Val<"brand", payload>`. */
export type Alias = Val<
  "Alias",
  {
    file: FilePath;
    alias: string;
    ref: SymbolRef;
    /** Traits declared in Val's third argument. */
    traits: DeclaredTrait[];
  }
>;
export const Alias = Val.companion<Alias>().build();

/** A top-level `type X = Trait<…>`. Kept separate from Val aliases and their own rules. */
export type TraitAlias = Val<"TraitAlias", { file: FilePath; alias: string; ref: SymbolRef }>;
export const TraitAlias = Val.companion<TraitAlias>().build();

/** A top-level `type X = Enum<…>`, whose variants each derive a Val of their own. */
export type EnumAlias = Val<
  "EnumAlias",
  {
    file: FilePath;
    alias: string;
    ref: SymbolRef;
    /** Traits declared in the enum's third argument. */
    traits: DeclaredTrait[];
    /**
     * The variant names, `null` where the syntax does not determine them. Every rule reading
     * them reports nothing there rather than guessing at a mapped type or an import.
     */
    variants: string[] | null;
    /** The traits each variant declares in its payload, `{ Book: { pages: number } & Named }`. */
    variantTraits: VariantTraits[];
  }
>;
export const EnumAlias = Val.companion<EnumAlias>().build();

/**
 * A top-level `type A = B`, where `B` is a bare reference and nothing more.
 *
 * `A` is a second name for whatever `B` is. Whether that is a Val is not known here: it takes
 * the other file's aliases, which the rule has and this walk does not.
 */
export type ReAlias = Val<
  "ReAlias",
  {
    at: Position;
    alias: string;
    ref: SymbolRef;
    /** The name on the right, as the declaring module names it when it was qualified. */
    target: string;
    targetRef: SymbolRef;
  }
>;
export const ReAlias = Val.companion<ReAlias>().build();

/** The brand one alias claims, before anything is known about who else claims it. */
export type BrandClaim = Val<
  "BrandClaim",
  {
    at: Position;
    /** The name `Val` was written under here, resolved against the file's imports by the rule. */
    typeName: string;
    brand: string;
    alias: string;
  }
>;
export const BrandClaim = Val.companion<BrandClaim>().build();

/** The traits one variant declares in its payload. */
export type VariantTraits = Val<"VariantTraits", { variant: string; traits: DeclaredTrait[] }>;
export const VariantTraits = Val.companion<VariantTraits>().build();

/** A `PayloadOf<X>` written inside a payload rather than as it, or as its intersected base. */
export type NestedPayloadOf = Val<
  "NestedPayloadOf",
  { at: Position; alias: string; wrapped: string }
>;
export const NestedPayloadOf = Val.companion<NestedPayloadOf>().build();

/**
 * The name a type reference is written under, or `undefined` when it is not a plain one.
 *
 * `Val<…>` gives `Val`, and `valof.Val<…>` through a namespace import gives the same, since the
 * namespace only says where the name came from. The caller still resolves the result against the
 * file's import aliases, which is what tells `Val` apart from something else bound to that name.
 */
function valName(typeName: Node, bound: Bindings): string | undefined {
  if (typeName.type === "Identifier") return typeName.name;
  if (typeName.type !== "TSQualifiedName") return undefined;
  const { left, right } = typeName;
  if (left.type !== "Identifier" || !Bindings.hasNamespace(bound, left.name)) return undefined;
  // Qualified by a namespace import, so the name is already the exporting module's own.
  return right.type === "Identifier" ? right.name : undefined;
}

/**
 * Top-level Val and Trait aliases, and the brands they claim.
 *
 * Only a top-level alias can be imported and assigned somewhere else, which is the collision the
 * brand rule reports. A `type Point` inside a `describe` block collides with nothing.
 */
/** The Valof aliases one file declares, and the brands they claim. */
export type Aliases = Val<
  "Aliases",
  {
    aliases: Alias[];
    traitAliases: TraitAlias[];
    enumAliases: EnumAlias[];
    brands: BrandClaim[];
    reAliases: ReAlias[];
    nestedPayloadOfs: NestedPayloadOf[];
  }
>;
export const Aliases = Val.companion<Aliases>()
  .implAssoc(() => ({
    /** The Valof aliases one program declares, and the brands they claim. */
    fromProgram: valAliases,
  }))
  .build();

/** The body of {@link Aliases.fromProgram}. */
function valAliases(program: Node, file: FilePath, bound: Bindings, lines: Lines): Aliases {
  const aliases: Alias[] = [];
  const traitAliases: TraitAlias[] = [];
  const enumAliases: EnumAlias[] = [];
  const brands: BrandClaim[] = [];
  const reAliases: ReAlias[] = [];
  const nestedPayloadOfs: NestedPayloadOf[] = [];
  const locals = localAliases(program);

  for (const node of topLevelAliases(program)) {
    const { id } = node;
    const annotation = unparenthesized(node.typeAnnotation);
    if (id.type !== "Identifier" || annotation?.type !== "TSTypeReference") continue;
    const { typeName } = annotation;
    const named = valName(typeName, bound);
    if (named === undefined) continue;
    const params = typeParams(annotation.typeArguments);

    if (!annotation.typeArguments) {
      // `type Wrap<T> = T` describes no particular type, and its right side is a parameter.
      if (node.generic) continue;
      reAliases.push(
        ReAlias.seal({
          at: Lines.at(lines, id.start),
          alias: id.name,
          ref: Bindings.refOf(bound, file, id.name, undefined),
          target: named,
          targetRef: Bindings.refOf(bound, file, named, qualifierOf(typeName)),
        }),
      );
      continue;
    }

    const kind = Bindings.originalName(bound, named);
    const declared = { file, alias: id.name, ref: Bindings.refOf(bound, file, id.name, undefined) };
    const nested = (payload: Node | null | undefined): void => {
      if (payload) nestedPayloadOfs.push(...payloadOfs(payload, id.name, bound, locals, lines));
    };
    if (kind === "Val") nested(params[1]);
    if (kind === "Enum") {
      // Each variant's payload is a top level of its own.
      const record = unparenthesized(params[1]);
      if (record?.type === "TSTypeLiteral")
        for (const member of record.members) nested(annotationOf(member));
    }
    if (kind === "Val") {
      aliases.push(
        Alias.seal({
          ...declared,
          traits: traitNames(params[2], file, bound, locals, lines),
        }),
      );
    } else if (kind === "Trait") {
      traitAliases.push(TraitAlias.seal(declared));
    } else if (kind === "Enum") {
      const variants = variantNames(params[1], bound, locals);
      enumAliases.push(
        EnumAlias.seal({
          ...declared,
          // The same position as a Val's: an enum's third argument carries the traits, the shared
          // fields and the tag's name, all intersected.
          traits: traitNames(params[2], file, bound, locals, lines),
          variants: variants ?? null,
          variantTraits: variantTraits(params[1], file, bound, locals, lines),
        }),
      );
    }

    const first = unparenthesized(params[0]);
    if (first?.type !== "TSLiteralType") continue;
    const { literal } = first;
    if (literal.type !== "Literal" || literal.value === null) continue;
    brands.push(
      BrandClaim.seal({
        at: Lines.at(lines, id.start),
        typeName: named,
        brand: literal.value,
        alias: id.name,
      }),
    );
  }

  return Aliases.seal({ aliases, traitAliases, enumAliases, brands, reAliases, nestedPayloadOfs });
}

/** Every top-level `type X = …` in the file, which the two syntax-only walks below expand. */
function localAliases(program: Node): Map<string, Node> {
  const aliases = new Map<string, Node>();
  for (const { id, typeAnnotation } of topLevelAliases(program))
    if (id.type === "Identifier") aliases.set(id.name, typeAnnotation);
  return aliases;
}

/** Every top-level `type X = …`, exported or not. */
function topLevelAliases(program: Node): VariantOf<Node, "TSTypeAliasDeclaration">[] {
  if (program.type !== "Program") return [];
  return program.body.flatMap((statement) => {
    const node = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    return node?.type === "TSTypeAliasDeclaration" ? [node] : [];
  });
}

/** The namespace a `ns.Name` reference was reached through. */
const qualifierOf = (name: Node): string | undefined =>
  name.type === "TSQualifiedName" && name.left.type === "Identifier" ? name.left.name : undefined;

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
): string[] | undefined {
  let found: string[] | undefined;
  const visit = (one: Node, seen: ReadonlySet<string>): boolean => {
    const inside = unparenthesized(one);
    if (!inside) return false;
    if (inside.type === "TSIntersectionType")
      return inside.types.every((part) => visit(part, seen));
    if (inside.type === "TSTypeReference") {
      const named = valName(inside.typeName, bound);
      if (!named) return false;
      // The tag's name arrives as a marker, which declares no variant of its own.
      if (Bindings.originalName(bound, named) === "Tag") return true;
      const alias = aliases.get(named);
      if (!alias || seen.has(named)) return false;
      return visit(alias, new Set(seen).add(named));
    }
    if (inside.type !== "TSTypeLiteral" || found) return false;
    const names: string[] = [];
    for (const member of inside.members) {
      if (member.type !== "TSPropertySignature") return false;
      const name = keyName(member.key, member.computed);
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
  file: FilePath,
  bound: Bindings,
  aliases: ReadonlyMap<string, Node>,
  lines: Lines,
): DeclaredTrait[] {
  if (!node) return [];
  const seen = new Set<string>();
  const out = new Map<string, DeclaredTrait>();
  const visit = (one: Node, occurrence = one): void => {
    const inside = unparenthesized(one);
    if (!inside) return;
    if (inside !== one) return visit(inside, occurrence === one ? inside : occurrence);
    if (one.type === "TSIntersectionType") {
      for (const part of one.types) visit(part, occurrence === one ? part : occurrence);
      return;
    }
    if (one.type !== "TSTypeReference") return;
    const named = valName(one.typeName, bound);
    if (!named) return;
    // An enum's tag arrives in the same argument, and the marker carrying it names no trait.
    if (Bindings.originalName(bound, named) === "Tag") return;
    const ref = Bindings.refOf(bound, file, named, qualifierOf(one.typeName));
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
      const target = valName(alias.typeName, bound);
      if (target && Bindings.originalName(bound, target) !== "Trait") {
        visit(alias, occurrence);
        return;
      }
    }
    const occurrenceName = occurrence.type === "TSTypeReference" ? occurrence.typeName : occurrence;
    const written =
      occurrenceName.type === "TSQualifiedName" ? occurrenceName.right : occurrenceName;
    out.set(
      ref.key,
      DeclaredTrait.seal({
        at: Lines.at(lines, written.start),
        name: named,
        ref,
      }),
    );
  };
  visit(node);
  return [...out.values()];
}

/** The traits each variant of a literal variant record names in its payload. */
function variantTraits(
  node: Node | undefined,
  file: FilePath,
  bound: Bindings,
  aliases: ReadonlyMap<string, Node>,
  lines: Lines,
): VariantTraits[] {
  const record = unparenthesized(node);
  if (record?.type !== "TSTypeLiteral") return [];
  return record.members.flatMap((member) => {
    if (member.type !== "TSPropertySignature") return [];
    const variant = keyName(member.key, member.computed);
    const payload = annotationOf(member);
    if (!variant || !payload) return [];
    const traits = traitNames(payload, file, bound, aliases, lines);
    return traits.length > 0 ? [VariantTraits.seal({ variant, traits })] : [];
  });
}

/**
 * The `PayloadOf<X>` references in a payload below its top. At the top, or intersected there,
 * it builds the payload on `X`'s, which is its purpose. Below, `total: PayloadOf<Money>` holds
 * `Money`'s payload with neither its brand nor its seal.
 */
function payloadOfs(
  payload: Node,
  alias: string,
  bound: Bindings,
  aliases: ReadonlyMap<string, Node>,
  lines: Lines,
): NestedPayloadOf[] {
  /** The reference's name, resolved against the imports, and its first type argument. */
  const referenced = (
    node: Node | undefined,
  ): { name: string; first: Node | undefined } | undefined => {
    const inside = unparenthesized(node);
    if (inside?.type !== "TSTypeReference") return undefined;
    const named = valName(inside.typeName, bound);
    if (!named) return undefined;
    return {
      name: Bindings.originalName(bound, named),
      first: typeParams(inside.typeArguments)[0],
    };
  };
  /** The name a `PayloadOf<X>` argument is written under, or "it" when it is not a plain name. */
  const wrappedName = (wrapped: Node | undefined): string =>
    wrapped?.type === "TSTypeReference" && wrapped.typeName.type === "Identifier"
      ? wrapped.typeName.name
      : "it";
  /** What a local `type M = Payload<PayloadOf<X>>` wraps: `X`, read one step and no further. */
  const wrapping = (name: string): string | undefined => {
    const outer = referenced(aliases.get(name));
    const inner = outer?.name === "Payload" ? referenced(outer.first) : undefined;
    return inner?.name === "PayloadOf" ? wrappedName(inner.first) : undefined;
  };
  const found: NestedPayloadOf[] = [];
  const visit = (node: Node, top: boolean): void => {
    const inside = unparenthesized(node);
    if (!inside) return;
    if (inside.type === "TSIntersectionType") {
      for (const part of inside.types) visit(part, top);
      return;
    }
    if (inside.type === "TSTypeReference") {
      const named = valName(inside.typeName, bound);
      const args = typeParams(inside.typeArguments);
      if (named && Bindings.originalName(bound, named) === "PayloadOf" && !top)
        found.push(
          NestedPayloadOf.seal({
            at: Lines.at(lines, inside.start),
            alias,
            wrapped: wrappedName(args[0]),
          }),
        );
      const through = named && !top ? wrapping(named) : undefined;
      if (through)
        found.push(
          NestedPayloadOf.seal({ at: Lines.at(lines, inside.start), alias, wrapped: through }),
        );
      for (const arg of args) visit(arg, false);
      return;
    }
    for (const one of inside.children) visit(one, false);
  };
  visit(payload, true);
  return found;
}
