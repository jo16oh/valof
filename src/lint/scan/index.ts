import { readFileSync } from "node:fs";
import { normalize, resolve } from "node:path";

import { Val } from "../../index.ts";
import type { Enum, EnumCompanion } from "../../enum.ts";
import type { AnyTrait, TraitCompanion } from "../../trait.ts";
import type { Reserved } from "../../val.ts";

import {
  child,
  children,
  isNode,
  keyName,
  positions,
  unparenthesized,
  type Node,
  type Position,
} from "../ast.ts";
import { Parser } from "../parser.ts";
import {
  valAliases,
  type Alias,
  type BrandClaim,
  type EnumAlias,
  type ReAlias,
  type TraitAlias,
} from "./aliases.ts";
import {
  moduleRef,
  symbolRef,
  Bindings,
  ImportBinding,
  ImportMap,
  type SymbolRef,
  type Root,
} from "./bindings.ts";
import {
  CompanionSite,
  companionSite,
  fromRoot,
  stepOf,
  variantOf,
  typeReference,
  valOf,
  type Lift,
} from "./chains.ts";
import { directives, type Directive } from "./directives.ts";

// The pieces a `Scan` is made of, so a rule reads them from the scan rather than reaching past
// it into the walk that produced them.
export { symbolRef } from "./bindings.ts";
export { ImportMap } from "./bindings.ts";
export type { ImportBinding, Root, SymbolRef } from "./bindings.ts";
export type {
  Alias,
  BrandClaim,
  DeclaredTrait,
  EnumAlias,
  ReAlias,
  TraitAlias,
} from "./aliases.ts";
export type { CompanionSite, Lift } from "./chains.ts";
export type { Directive, Spelling } from "./directives.ts";
export { silences } from "./directives.ts";

/** A member `.impl(() => ({…}))` registered, under the local name of its companion. */
export type Member = Val<"Member", { at: Position; companion: string; member: string }>;
export const Member = Val.companion<Member>().build();

/** One implementation attached to a Val companion chain. */
export type TraitImplementation = Val<
  "TraitImplementation",
  {
    val: SymbolRef;
    trait: SymbolRef;
    /** Statically known override keys, at their declaration sites. */
    overrides: Member[];
  }
>;
export const TraitImplementation = Val.companion<TraitImplementation>().build();

/**
 * A `Trait.dyn(Val, value)` box that leaves the expression it was made in: passed to a function,
 * held in an array, returned. The scan does not follow what is read off it. `val` is whatever the
 * first argument references, a companion or not.
 */
export type EscapedDyn = Val<"EscapedDyn", { trait: SymbolRef; val: SymbolRef }>;
export const EscapedDyn = Val.companion<EscapedDyn>().build();

/** A member read from a `Trait.dyn(Val, value)` box. */
export type DynRead = Val<"DynRead", { trait: SymbolRef; val: SymbolRef; member: string }>;
export const DynRead = Val.companion<DynRead>().build();

/**
 * A key taken off a companion and held under a local name: `const { Circle } = Shape` and `const
 * Round = Shape.Circle` alike.
 *
 * Whether the companion is an enum's, and whether the key is a variant of it, is left to the
 * rule. Answering either needs the declarations of every file, and this walk reads one.
 */
export type CompanionBinding = Val<
  "CompanionBinding",
  {
    at: Position;
    /** The local name it was bound to. */
    name: string;
    /** The companion it was taken from, as this file names it. */
    companion: string;
    companionRef: SymbolRef;
    /** The key read off it. */
    key: string;
  }
>;
export const CompanionBinding = Val.companion<CompanionBinding>().build();

/**
 * What one file says about itself.
 *
 * Syntactic facts, not any rule's input. Nothing here is named for the rule that happens to read
 * it today, and more than one may: `aliases` and `brands` come from the same pass over the same
 * declarations, and two rules take one each. A new rule needing something new is a reason to add
 * a fact here; it is not a reason for a fact to belong to it.
 */
export type Scan = Val<
  "Scan",
  {
    file: string;
    imported: ImportMap;
    /** What `.impl(() => ({…}))` registered here. */
    members: Member[];
    /** Trait implementations, including the keys which replace a default implementation. */
    traitImplementations: TraitImplementation[];
    dynReads: DynRead[];
    escapedDyns: EscapedDyn[];
    /** Keys read off a local name, each a set. */
    reads: Record<string, Record<string, true>>;
    /** Keys read through a namespace, already named as the exporting module names them. */
    namespaceReads: Record<string, Record<string, true>>;
    /** `export { A as B }`: the name outside -> the name at the declaration. */
    exportedAs: Record<string, string>;
    /** Export name -> the local or source-module symbol it exposes. */
    exportedRefs: Record<string, SymbolRef>;
    /** Top-level `type X = Val<…>`. */
    aliases: Alias[];
    /** Top-level `type X = Trait<…>` declarations. */
    traitAliases: TraitAlias[];
    /** Top-level `type X = Enum<…>` declarations, and the variants each spells. */
    enumAliases: EnumAlias[];
    /** The brand each of those claims, where it spelled one as a literal. */
    brands: BrandClaim[];
    /** Top-level `type A = B`, which gives `B` a second name. */
    reAliases: ReAlias[];
    /** Companion chains of all three roots, and what each registered. */
    sites: CompanionSite[];
    /** Keys taken off a companion and bound to a local name. */
    companionBindings: CompanionBinding[];
    /** `Val.of<X>(…)` calls. */
    lifts: Lift[];
    /** Every `valof-lint-disable-next-line` that takes effect, at its own comment. */
    directives: Directive[];
  }
>;
export const Scan = Val.companion<Scan>().build();

/** Resolves local exports and re-export chains to the symbol they expose. */
export function symbolIdentity(scans: readonly Scan[]): (ref: SymbolRef) => string {
  const exports = new Map<string, SymbolRef>();
  for (const scan of scans) {
    const module = normalize(resolve(scan.file));
    for (const [name, target] of Object.entries(scan.exportedRefs))
      exports.set(moduleRef(module, name).key, target);
  }
  return (ref) => {
    const seen = new Set<string>();
    let current = ref;
    while (!seen.has(current.key)) {
      seen.add(current.key);
      const target = exports.get(current.key);
      if (!target) break;
      current = target;
    }
    return current.key;
  };
}

/** An enum to read keys from. `AnyEnum` widens them to `string`. */
type Sample = Enum<"Sample", { A: { a: 1 } }>;

/** The {@link Reserved} names with no pattern. */
type Unlisted<N extends string> = Reserved extends infer R
  ? R extends unknown
    ? [Extract<N, R>] extends [never]
      ? R
      : never
    : never
  : never;

/**
 * Matches a whole name against the patterns. A {@link Reserved} name without a pattern, or a
 * pattern that is not one, is a type error.
 */
function reserved<const N extends readonly Reserved[]>(
  patterns: N &
    ([Unlisted<N[number]>] extends [never] ? unknown : { unlisted: Unlisted<N[number]> }),
): RegExp {
  return new RegExp(`^(?:${patterns.join("|")})$`);
}

/** The names every `.impl` rejects. The type reports one, so it is not a member to report. */
const RESERVED = reserved(["patch", "seal", "create"]);

/**
 * An enum's `.impl` rejects `match` as well, and a trait's rejects `dyn`. An enum's variant names
 * are left to the rule, which reads every file.
 */
const rejected = (member: string, root?: Root): boolean =>
  RESERVED.test(member) ||
  (root === "Enum" && member === ("match" satisfies keyof EnumCompanion<Sample>)) ||
  (root === "Trait" && member === ("dyn" satisfies keyof TraitCompanion<AnyTrait>));

function collect<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(value);
}

/**
 * Walks one file once, for every rule.
 *
 * One walk rather than one per rule because the rules share their footing: {@link Bindings}
 * resolves a name for all three, and the chain analysis that spots `.impl(() => ({…}))` is the
 * same one that spots `.implSeal`. What comes back is material, not findings; deciding is the
 * rules' job, and they see every file rather than this one.
 *
 * `given` is the source to walk in place of the file on disk, for a buffer the editor holds
 * unsaved. The file may not exist at all.
 */
export function scan(
  file: string,
  parser: Parser,
  given?: string,
  resolveModule: (file: string, source: string) => string = (_file, source) => source,
): Scan {
  const source = given ?? readFileSync(file, "utf8");
  const position = positions(source);

  let bound = Bindings.create();
  const exportedAs = new Map<string, string>();
  const exportedRefs = new Map<string, SymbolRef>();
  const members: Member[] = [];
  const traitImplementations: TraitImplementation[] = [];
  const dynReads: DynRead[] = [];
  const escapedDyns: EscapedDyn[] = [];
  /** The boxes a read is followed from, which therefore do not escape. */
  const followed = new Set<Node>();
  const objects = new Map<string, Node>();
  const dynBindings = new Map<string, { trait: SymbolRef; val: SymbolRef }>();
  const reads = new Map<string, Set<string>>();
  const namespaceReads = new Map<string, Set<string>>();
  const sites: CompanionSite[] = [];
  const companionBindings: CompanionBinding[] = [];
  const lifts: Lift[] = [];

  /** local name -> the dotted key a read off it counts under, `Shape.Circle`. */
  const dotted = new Map<string, string>();
  /** Records one, so that a read off the local name counts for the companion's key as well. */
  const took = (name: string, at: Position, companion: string, key: string): void => {
    companionBindings.push(
      CompanionBinding.seal({
        at,
        name,
        companion,
        companionRef: symbolRef(file, bound, companion),
        key,
      }),
    );
    dotted.set(name, `${Bindings.original(bound, companion)}.${key}`);
  };

  const visit = (node: Node): void => {
    switch (node.type) {
      case "VariableDeclaration": {
        if (node["kind"] !== "const") break;
        for (const declaration of children(node, "declarations")) {
          const id = child(declaration, "id");
          const init = child(declaration, "init");
          if (id?.type !== "Identifier" || !init) continue;
          objects.set(id["name"] as string, init);
          const dyn = dynBox(init, file, bound);
          if (dyn) {
            dynBindings.set(id["name"] as string, dyn);
            followed.add(init);
          }
        }
        break;
      }
      case "VariableDeclarator": {
        const id = child(node, "id");
        const init = child(node, "init");
        if (!id || !init) break;
        const site = companionSite(init, file, position(init["start"] as number), bound, position);
        if (site)
          sites.push(
            id.type === "Identifier"
              ? CompanionSite.patch(site, {
                  name: id["name"] as string,
                  nameAt: position(id["start"] as number),
                })
              : site,
          );
        // `const { a, b: c } = X` reads `a` and `b` off `X`.
        if (id.type === "ObjectPattern" && init.type === "Identifier") {
          const from = init["name"] as string;
          const dyn = dynBindings.get(from);
          for (const property of children(id, "properties")) {
            if (property.type !== "Property") continue;
            const key = child(property, "key");
            if (!key) continue;
            const name = keyName(key, property["computed"] === true);
            if (name) {
              if (dyn) dynReads.push(DynRead.seal({ ...dyn, member: name }));
              else {
                collect(reads, from, name);
                const local = child(property, "value");
                if (local?.type === "Identifier")
                  took(local["name"] as string, position(local["start"] as number), from, name);
              }
            }
          }
          break;
        }
        // Destructuring a dyn box is a direct read of its trait member.
        if (id.type === "ObjectPattern") {
          const dyn = dynBox(init, file, bound);
          if (dyn) followed.add(init);
          if (dyn)
            for (const property of children(id, "properties")) {
              if (property.type !== "Property") continue;
              const key = child(property, "key");
              const name = key && keyName(key, property["computed"] === true);
              if (name) dynReads.push(DynRead.seal({ ...dyn, member: name }));
            }
        }
        if (id.type !== "Identifier") break;
        const root = fromRoot(init, bound);
        if (root) bound = Bindings.patch(bound, { builders: { [id["name"] as string]: root } });
        // `const Round = Shape.Circle` takes the same key the destructuring above takes.
        if (init.type === "MemberExpression") {
          const from = child(init, "object");
          const key = child(init, "property");
          const taken = key && keyName(key, init["computed"] === true);
          if (
            from?.type === "Identifier" &&
            taken &&
            !Bindings.isNamespace(bound, from["name"] as string)
          )
            took(
              id["name"] as string,
              position(id["start"] as number),
              from["name"] as string,
              taken,
            );
        }
        members.push(...implMembers(init, id["name"] as string, bound, objects, position));
        break;
      }
      case "CallExpression": {
        // Visited after whatever contains it, so a box read where it is made is already followed.
        const box = followed.has(node) ? undefined : dynBox(node, file, bound);
        if (box) escapedDyns.push(EscapedDyn.seal(box));
        const lift = valOf(node, file, bound, position);
        if (lift) lifts.push(lift);
        const implementation = implTrait(node, file, bound, sites, objects, position);
        if (implementation) {
          traitImplementations.push(implementation);
          members.push(...implementation.overrides);
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
          const dyn = dynBindings.get(object["name"] as string);
          if (dyn) {
            dynReads.push(DynRead.seal({ ...dyn, member: name }));
            break;
          }
          collect(reads, object["name"] as string, name);
          // A variant bound to a local name is read here and declared under the dotted key.
          const pair = dotted.get(object["name"] as string);
          if (pair) collect(reads, pair, name);
          break;
        }
        const dyn = dynBox(object, file, bound);
        if (dyn) {
          followed.add(object);
          dynReads.push(DynRead.seal({ ...dyn, member: name }));
          break;
        }
        // `ns.User.greet`: the companion is the middle name, and it is the exporting module's
        // name for it, so it skips this file's import aliases.
        if (object.type !== "MemberExpression") break;
        const namespace = child(object, "object");
        const companion = child(object, "property");
        if (!namespace || !companion || namespace.type !== "Identifier") break;
        const through = keyName(companion, object["computed"] === true);
        if (!through) break;
        if (Bindings.isNamespace(bound, namespace["name"] as string)) {
          collect(namespaceReads, through, name);
          break;
        }
        // `Shape.Circle.diameter`: a variant's members are declared under the same dotted key,
        // which is where the two meet.
        collect(reads, `${Bindings.original(bound, namespace["name"] as string)}.${through}`, name);
        break;
      }
      case "ImportDeclaration": {
        const source = child(node, "source");
        if (!source || typeof source["value"] !== "string") break;
        const module = resolveModule(file, source["value"]);
        for (const specifier of children(node, "specifiers")) {
          const local = child(specifier, "local");
          if (local?.type !== "Identifier") continue;
          if (specifier.type === "ImportNamespaceSpecifier") {
            bound = Bindings.patch(bound, { namespaces: { [local["name"] as string]: module } });
          } else if (specifier.type === "ImportSpecifier") {
            const imported = child(specifier, "imported");
            const name = imported && keyName(imported, false);
            if (name)
              bound = Bindings.patch(bound, {
                imported: ImportMap.patch(bound.imported, {
                  [local["name"] as string]: ImportBinding.seal({ name, module }),
                }),
              });
          }
        }
        break;
      }
      default:
        break;
    }

    for (const key of parser.visitorKeys[node.type] ?? []) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (const element of value) if (isNode(element)) visit(element);
      } else if (isNode(value)) visit(value);
    }
  };

  const { program, comments } = Parser.parse(parser, file, source);
  if (!isNode(program)) throw new Error(`valof-lint: ${file} parsed to no program`);
  visit(program);

  // Imports may follow an export declaration. Resolve local exports only after every binding is
  // known, so `export { Imported as Public }` retains Imported's source module either way.
  exportedAs.clear();
  exportedRefs.clear();
  for (const statement of children(program, "body")) {
    if (statement.type !== "ExportNamedDeclaration") continue;
    const sourceNode = child(statement, "source");
    const module =
      sourceNode && typeof sourceNode["value"] === "string"
        ? resolveModule(file, sourceNode["value"])
        : undefined;
    for (const specifier of children(statement, "specifiers")) {
      const local = child(specifier, "local");
      const exported = child(specifier, "exported");
      if (!local || !exported) continue;
      const outside = keyName(exported, false);
      const inside = keyName(local, false);
      if (!outside || !inside) continue;
      exportedAs.set(outside, inside);
      exportedRefs.set(
        outside,
        module ? moduleRef(module, inside) : symbolRef(file, bound, inside),
      );
    }
  }

  // After the walk, which is what collected the imports `Val` is resolved against.
  const { aliases, traitAliases, enumAliases, brands, reAliases } = valAliases(
    program,
    file,
    bound,
    position,
  );

  return Scan.seal({
    file,
    imported: bound.imported,
    members,
    traitImplementations,
    dynReads,
    escapedDyns,
    reads: sets(reads),
    namespaceReads: sets(namespaceReads),
    exportedAs: Object.fromEntries(exportedAs),
    exportedRefs: Object.fromEntries(exportedRefs),
    aliases,
    traitAliases,
    enumAliases,
    brands,
    reAliases,
    sites,
    companionBindings,
    lifts,
    directives: directives(comments, source, position),
  });
}

/** The uncomplicated `Trait.dyn(Val, value)` form.  Escaping the box is deliberately not traced. */
function dynBox(
  node: Node,
  file: string,
  bound: Bindings,
): { trait: SymbolRef; val: SymbolRef } | undefined {
  if (node.type !== "CallExpression") return undefined;
  const callee = child(node, "callee");
  if (!callee || callee.type !== "MemberExpression") return undefined;
  const property = child(callee, "property");
  const object = child(callee, "object");
  if (!property || keyName(property, callee["computed"] === true) !== "dyn" || !object)
    return undefined;
  const args = children(node, "arguments");
  const trait = valueReference(object, file, bound);
  const val = args[0] && valueReference(args[0], file, bound);
  return trait && val ? { trait, val } : undefined;
}

/** A runtime companion reference with its exporting module retained. */
function valueReference(node: Node, file: string, bound: Bindings): SymbolRef | undefined {
  if (node.type === "Identifier") return symbolRef(file, bound, node["name"] as string);
  if (node.type !== "MemberExpression") return undefined;
  const object = child(node, "object");
  const property = child(node, "property");
  if (
    object?.type !== "Identifier" ||
    !Bindings.isNamespace(bound, object["name"] as string) ||
    !property
  )
    return undefined;
  const name = keyName(property, node["computed"] === true);
  return name ? symbolRef(file, bound, name, object["name"] as string) : undefined;
}

/** Reads one `.implTrait` call without collapsing repeated calls in the same chain. */
function implTrait(
  node: Node,
  file: string,
  bound: Bindings,
  sites: readonly CompanionSite[],
  objects: ReadonlyMap<string, Node>,
  position: (offset: number) => Position,
): TraitImplementation | undefined {
  const callee = child(node, "callee");
  if (!callee || callee.type !== "MemberExpression") return undefined;
  const property = child(callee, "property");
  if (!property || keyName(property, callee["computed"] === true) !== "implTrait") return undefined;
  let current = child(callee, "object");
  while (current?.type === "CallExpression") {
    const inner = child(current, "callee");
    if (!inner || inner.type !== "MemberExpression") break;
    const receiver = stepOf(inner)?.receiver;
    if (!receiver || receiver.type !== "CallExpression") break;
    current = receiver;
  }
  if (!current) return undefined;
  const rootCall = current.type === "CallExpression" ? current : node;
  const root = current.type === "CallExpression" ? child(current, "callee") : callee;
  if (!root || root.type !== "MemberExpression") return undefined;
  let val: SymbolRef | undefined;
  if (fromRoot(root, bound)) {
    const rootArgs = child(rootCall, "typeArguments");
    const valNode = unparenthesized(rootArgs ? children(rootArgs, "params")[0] : undefined);
    const valRef = valNode?.type === "TSTypeReference" ? child(valNode, "typeName") : undefined;
    const valNamed = valRef && typeReference(valRef, bound);
    val = valNamed
      ? symbolRef(file, bound, valNamed.node["name"] as string, valNamed.qualifier)
      : undefined;
  } else {
    const receiver = child(root, "object");
    const builder = receiver?.type === "Identifier" ? (receiver["name"] as string) : undefined;
    const site = builder ? sites.find((one) => one.name === builder) : undefined;
    if (site) val = site.typeRef;
  }
  if (!val) return undefined;
  const [traitRef, object] = children(node, "arguments");
  const trait = traitRef && valueReference(traitRef, file, bound);
  if (!trait) return undefined;
  const resolved = object ? stepMembers(object, val.name, objects, position) : [];
  return TraitImplementation.seal({ val, trait, overrides: resolved });
}

/**
 * The members a step's function returns: `() => ({…})`, `() => held`, or a const holding either.
 * A block body is not read.
 */
function stepMembers(
  node: Node,
  companion: string,
  objects: ReadonlyMap<string, Node>,
  position: (offset: number) => Position,
): Member[] {
  const fn = node.type === "Identifier" ? objects.get(node["name"] as string) : node;
  const body =
    fn?.type === "ArrowFunctionExpression" ? unparenthesized(child(fn, "body")) : undefined;
  return body ? objectMembers(body, companion, objects, position, new Set()) : [];
}

/** Resolves inline/const objects and spreads, retaining known keys even beside an unknown spread. */
function objectMembers(
  node: Node,
  companion: string,
  objects: ReadonlyMap<string, Node>,
  position: (offset: number) => Position,
  seen: Set<string>,
): Member[] {
  if (node.type === "Identifier") {
    const name = node["name"] as string;
    if (seen.has(name)) return [];
    const target = objects.get(name);
    if (!target) return [];
    const next = new Set(seen);
    next.add(name);
    return objectMembers(target, companion, objects, position, next);
  }
  if (node.type !== "ObjectExpression") return [];
  const byName = new Map<string, Member>();
  for (const entry of children(node, "properties")) {
    if (entry.type === "SpreadElement") {
      const argument = child(entry, "argument");
      if (!argument) continue;
      for (const member of objectMembers(argument, companion, objects, position, seen))
        byName.set(member.member, member);
      continue;
    }
    if (entry.type !== "Property") continue;
    const key = child(entry, "key");
    const name = key && keyName(key, entry["computed"] === true);
    if (!name) {
      continue;
    }
    byName.set(
      name,
      Member.seal({ at: position(entry["start"] as number), companion, member: name }),
    );
  }
  return [...byName.values()];
}

/**
 * Every `.impl` in a builder chain of any root, including repeated Trait `.impl` calls. A
 * variant's, `.Circle.impl(() => ({…}))`, registers under `` `${enum}.${variant}` ``.
 */
function implMembers(
  node: Node,
  companion: string,
  bound: Bindings,
  objects: ReadonlyMap<string, Node>,
  position: (offset: number) => Position,
): Member[] {
  const found = new Map<string, Member>();
  let current: Node = node;
  while (current.type === "CallExpression") {
    const callee = child(current, "callee");
    const step = callee?.type === "MemberExpression" ? stepOf(callee) : undefined;
    if (!step) break;
    const variant = variantOf(step.receiver);
    const receiver = variant?.builder ?? step.receiver;
    const root = fromRoot(receiver, bound);
    const [object] = children(current, "arguments");
    if (step.name === "impl" && root !== undefined && object) {
      const owner = variant ? `${companion}.${variant.variant}` : companion;
      for (const member of stepMembers(object, owner, objects, position))
        if (!rejected(member.member, variant ? undefined : root))
          found.set(`${owner}\0${member.member}`, member);
    }
    current = receiver;
  }
  return [...found.values()];
}

/** Each set as an object with the member as key, the way a payload holds one. */
function sets(map: ReadonlyMap<string, ReadonlySet<string>>): Record<string, Record<string, true>> {
  return Object.fromEntries(
    [...map].map(([key, members]) => [
      key,
      Object.fromEntries([...members].map((one) => [one, true])),
    ]),
  );
}
