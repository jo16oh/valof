import { readFileSync } from "node:fs";
import { normalize, resolve } from "node:path";

import {
  child,
  children,
  isNode,
  keyName,
  positions,
  unparenthesized,
  type Node,
  type Where,
} from "../ast.ts";
import {
  valAliases,
  type Alias,
  type BrandClaim,
  type EnumAlias,
  type ReAlias,
  type TraitAlias,
} from "./aliases.ts";
import {
  bindings,
  moduleRef,
  original,
  symbolRef,
  type Bindings,
  type SymbolRef,
} from "./bindings.ts";
import {
  companionSite,
  fromRoot,
  typeReference,
  valOf,
  type CompanionSite,
  type Lift,
} from "./chains.ts";
import { directives, type Directive } from "./directives.ts";

// The pieces a `Scan` is made of, so a rule reads them from the scan rather than reaching past
// it into the walk that produced them.
export { original, symbolRef } from "./bindings.ts";
export type { Bindings, Root, SymbolRef } from "./bindings.ts";
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

/** A member `.impl({…})` registered, under the local name of its companion. */
export type Member = Where & { companion: string; member: string };
/** One implementation attached to a Val companion chain. */
export type TraitImplementation = {
  val: SymbolRef;
  trait: SymbolRef;
  /** Statically known override keys, at their declaration sites. */
  overrides: Member[];
};
/** A member read from a `Trait.dyn(Val, value)` box. */
export type DynRead = { trait: SymbolRef; val: SymbolRef; member: string };

/**
 * A key taken off a companion and held under a local name: `const { Circle } = Shape` and `const
 * Round = Shape.Circle` alike.
 *
 * Whether the companion is an enum's, and whether the key is a variant of it, is left to the
 * rule. Answering either needs the declarations of every file, and this walk reads one.
 */
export type CompanionBinding = Where & {
  /** The local name it was bound to. */
  name: string;
  /** The companion it was taken from, as this file names it. */
  companion: string;
  companionRef: SymbolRef;
  /** The key read off it. */
  key: string;
};

/** An `impl` step written on something that is not a builder chain. */
export type DetachedStep = Where & {
  /** The step, as written. */
  step: string;
  /** What the step was written on, as this file names it. */
  baseName: string;
  base: SymbolRef;
  /** The variant, for `Shape.Circle.implSeal(…)`. */
  variant: string | undefined;
};

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
  /** Trait implementations, including the keys which replace a default implementation. */
  traitImplementations: TraitImplementation[];
  dynReads: DynRead[];
  /** Keys read off a local name. */
  reads: Map<string, Set<string>>;
  /** Keys read through a namespace, already named as the exporting module names them. */
  namespaceReads: Map<string, Set<string>>;
  /** `export { A as B }`: the name outside -> the name at the declaration. */
  exportedAs: Map<string, string>;
  /** Export name -> the local or source-module symbol it exposes. */
  exportedRefs: Map<string, SymbolRef>;
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
  /** `impl` steps that reach no builder chain of their own. */
  detachedSteps: DetachedStep[];
  /** `Val.of<X>(…)` calls. */
  lifts: Lift[];
  /** Every `valof-lint-disable-next-line` that takes effect, at its own comment. */
  directives: Directive[];
};

/** Resolves local exports and re-export chains to the symbol they expose. */
export function symbolIdentity(scans: readonly Scan[]): (ref: SymbolRef) => string {
  const exports = new Map<string, SymbolRef>();
  for (const scan of scans) {
    const module = normalize(resolve(scan.file));
    for (const [name, target] of scan.exportedRefs)
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
 *
 * `given` is the source to walk in place of the file on disk, for a buffer the editor holds
 * unsaved. The file may not exist at all.
 */
export function scan(
  file: string,
  { parseSync, visitorKeys }: Parser,
  given?: string,
  resolveModule: (file: string, source: string) => string = (_file, source) => source,
): Scan {
  const source = given ?? readFileSync(file, "utf8");
  const at = positions(source);

  const bound = bindings();
  const exportedAs = new Map<string, string>();
  const exportedRefs = new Map<string, SymbolRef>();
  const members: Member[] = [];
  const traitImplementations: TraitImplementation[] = [];
  const dynReads: DynRead[] = [];
  const objects = new Map<string, Node>();
  const dynBindings = new Map<string, { trait: SymbolRef; val: SymbolRef }>();
  const reads = new Map<string, Set<string>>();
  const namespaceReads = new Map<string, Set<string>>();
  const sites: CompanionSite[] = [];
  const companionBindings: CompanionBinding[] = [];
  const detachedSteps: DetachedStep[] = [];
  const lifts: Lift[] = [];

  /** local name -> the dotted key a read off it counts under, `Shape.Circle`. */
  const dotted = new Map<string, string>();
  /** Records one, so that a read off the local name counts for the companion's key as well. */
  const took = (name: string, where: Where, companion: string, key: string): void => {
    companionBindings.push({
      ...where,
      name,
      companion,
      companionRef: symbolRef(file, bound, companion),
      key,
    });
    dotted.set(name, `${original(bound, companion)}.${key}`);
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
          if (dyn) dynBindings.set(id["name"] as string, dyn);
        }
        break;
      }
      case "VariableDeclarator": {
        const id = child(node, "id");
        const init = child(node, "init");
        if (!id || !init) break;
        const site = companionSite(init, file, at(init["start"] as number), bound, at);
        if (site)
          sites.push(
            id.type === "Identifier"
              ? { ...site, name: id["name"] as string, nameAt: at(id["start"] as number) }
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
              if (dyn) dynReads.push({ ...dyn, member: name });
              else {
                collect(reads, from, name);
                const local = child(property, "value");
                if (local?.type === "Identifier")
                  took(local["name"] as string, at(local["start"] as number), from, name);
              }
            }
          }
          break;
        }
        // Destructuring a dyn box is a direct read of its trait member.
        if (id.type === "ObjectPattern") {
          const dyn = dynBox(init, file, bound);
          if (dyn)
            for (const property of children(id, "properties")) {
              if (property.type !== "Property") continue;
              const key = child(property, "key");
              const name = key && keyName(key, property["computed"] === true);
              if (name) dynReads.push({ ...dyn, member: name });
            }
        }
        if (id.type !== "Identifier") break;
        const root = fromRoot(init, bound);
        if (root) bound.builders.set(id["name"] as string, root);
        // `const Round = Shape.Circle` takes the same key the destructuring above takes.
        if (init.type === "MemberExpression") {
          const from = child(init, "object");
          const key = child(init, "property");
          const taken = key && keyName(key, init["computed"] === true);
          if (from?.type === "Identifier" && taken && !bound.namespaces.has(from["name"] as string))
            took(id["name"] as string, at(id["start"] as number), from["name"] as string, taken);
        }
        members.push(...implMembers(init, id["name"] as string, bound, objects, at));
        break;
      }
      case "CallExpression": {
        const lift = valOf(node, file, bound, at);
        if (lift) lifts.push(lift);
        const detached = detachedStep(node, file, bound, at);
        if (detached) detachedSteps.push(detached);
        const implementation = implTrait(node, file, bound, sites, objects, at);
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
            dynReads.push({ ...dyn, member: name });
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
          dynReads.push({ ...dyn, member: name });
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
        if (bound.namespaces.has(namespace["name"] as string)) {
          collect(namespaceReads, through, name);
          break;
        }
        // `Shape.Circle.diameter`: a variant's members are declared under the same dotted key,
        // which is where the two meet.
        collect(reads, `${original(bound, namespace["name"] as string)}.${through}`, name);
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
            bound.namespaces.set(local["name"] as string, module);
          } else if (specifier.type === "ImportSpecifier") {
            const imported = child(specifier, "imported");
            const name = imported && keyName(imported, false);
            if (name) bound.imported.set(local["name"] as string, { name, module });
          }
        }
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
    at,
  );

  return {
    file,
    bound,
    members,
    traitImplementations,
    dynReads,
    reads,
    namespaceReads,
    exportedAs,
    exportedRefs,
    aliases,
    traitAliases,
    enumAliases,
    brands,
    reAliases,
    sites,
    companionBindings,
    detachedSteps,
    lifts,
    directives: directives(parsed.comments, source, at),
  };
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
  if (object?.type !== "Identifier" || !bound.namespaces.has(object["name"] as string) || !property)
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
  at: (offset: number) => Where,
): TraitImplementation | undefined {
  const callee = child(node, "callee");
  if (!callee || callee.type !== "MemberExpression") return undefined;
  const property = child(callee, "property");
  if (!property || keyName(property, callee["computed"] === true) !== "implTrait") return undefined;
  let current = child(callee, "object");
  while (current?.type === "CallExpression") {
    const inner = child(current, "callee");
    if (!inner || inner.type !== "MemberExpression") break;
    const receiver = child(inner, "object");
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
    const valNamed = valRef && typeReference(valRef, bound.namespaces);
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
  const typeArgs = child(node, "typeArguments");
  const traitType = unparenthesized(typeArgs ? children(typeArgs, "params")[0] : undefined);
  const arg = children(node, "arguments");
  const traitRef = traitType?.type === "TSTypeReference" ? child(traitType, "typeName") : arg[0];
  const trait =
    traitRef &&
    (traitType ? typeValueReference(traitRef, file, bound) : valueReference(traitRef, file, bound));
  if (!trait) return undefined;
  const object = traitType ? arg[0] : arg[1];
  const resolved = object ? objectMembers(object, val.name, objects, at, new Set()) : [];
  return { val, trait, overrides: resolved };
}

function typeValueReference(node: Node, file: string, bound: Bindings): SymbolRef | undefined {
  const named = typeReference(node, bound.namespaces);
  if (!named) return undefined;
  const name = named.node["name"] as string;
  return symbolRef(file, bound, name, named.qualifier);
}

/** Resolves inline/const objects and spreads, retaining known keys even beside an unknown spread. */
function objectMembers(
  node: Node,
  companion: string,
  objects: ReadonlyMap<string, Node>,
  at: (offset: number) => Where,
  seen: Set<string>,
): Member[] {
  if (node.type === "Identifier") {
    const name = node["name"] as string;
    if (seen.has(name)) return [];
    const target = objects.get(name);
    if (!target) return [];
    const next = new Set(seen);
    next.add(name);
    return objectMembers(target, companion, objects, at, next);
  }
  if (node.type !== "ObjectExpression") return [];
  const byName = new Map<string, Member>();
  for (const entry of children(node, "properties")) {
    if (entry.type === "SpreadElement") {
      const argument = child(entry, "argument");
      if (!argument) continue;
      for (const member of objectMembers(argument, companion, objects, at, seen))
        byName.set(member.member, member);
      continue;
    }
    if (entry.type !== "Property") continue;
    const key = child(entry, "key");
    const name = key && keyName(key, entry["computed"] === true);
    if (!name) {
      continue;
    }
    byName.set(name, { ...at(entry["start"] as number), companion, member: name });
  }
  return [...byName.values()];
}

/** Every `.impl` in a builder chain of any root, including repeated Trait `.impl` calls. */
function implMembers(
  node: Node,
  companion: string,
  bound: Bindings,
  objects: ReadonlyMap<string, Node>,
  at: (offset: number) => Where,
): Member[] {
  const found = new Map<string, Member>();
  let current: Node = node;
  while (current.type === "CallExpression") {
    const callee = child(current, "callee");
    if (!callee || callee.type !== "MemberExpression") break;
    const receiver = child(callee, "object");
    const property = child(callee, "property");
    if (!receiver || !property) break;
    const step = keyName(property, callee["computed"] === true);
    if (step === "impl" && fromRoot(receiver, bound) !== undefined) {
      const [object] = children(current, "arguments");
      if (object)
        for (const member of objectMembers(object, companion, objects, at, new Set()))
          if (!BUILTIN.has(member.member)) found.set(member.member, member);
    }
    if (step === "implVariant" && fromRoot(receiver, bound) !== undefined)
      for (const member of variantMembers(current, companion, objects, at))
        found.set(`${member.companion}\0${member.member}`, member);
    current = receiver;
  }
  return [...found.values()];
}

/**
 * The members one `implVariant(name, build)` registered, under `` `${enum}.${variant}` ``.
 *
 * The callback's argument is that variant's own builder, so the chain to follow is the one rooted
 * at the first parameter: an expression body, or a block whose one statement is a `return`.
 */
function variantMembers(
  call: Node,
  companion: string,
  objects: ReadonlyMap<string, Node>,
  at: (offset: number) => Where,
): Member[] {
  const [named, body] = children(call, "arguments");
  const variant = named && keyName(named, false);
  if (!variant || !body) return [];
  const builder = children(body, "params")[0];
  const chain = returned(child(body, "body"));
  if (builder?.type !== "Identifier" || !chain) return [];
  return variantImpl(chain, builder["name"] as string, `${companion}.${variant}`, objects, at);
}

/** The expression a callback hands back, for an expression body and a lone `return` alike. */
function returned(body: Node | undefined): Node | undefined {
  if (!body) return undefined;
  if (body.type !== "BlockStatement") return body;
  const [statement] = children(body, "body");
  return statement?.type === "ReturnStatement" ? child(statement, "argument") : undefined;
}

/** Every `.impl` in one variant's chain, which is rooted at the builder the callback took. */
function variantImpl(
  node: Node,
  builder: string,
  companion: string,
  objects: ReadonlyMap<string, Node>,
  at: (offset: number) => Where,
): Member[] {
  const found = new Map<string, Member>();
  let current: Node = node;
  while (current.type === "CallExpression") {
    const callee = child(current, "callee");
    if (!callee || callee.type !== "MemberExpression") break;
    const receiver = child(callee, "object");
    const property = child(callee, "property");
    if (!receiver || !property) break;
    if (keyName(property, callee["computed"] === true) === "impl") {
      const [object] = children(current, "arguments");
      if (object)
        for (const member of objectMembers(object, companion, objects, at, new Set()))
          if (!BUILTIN.has(member.member)) found.set(member.member, member);
    }
    current = receiver;
  }
  // Rooted anywhere else, the chain belongs to something else the callback used.
  return current.type === "Identifier" && current["name"] === builder ? [...found.values()] : [];
}

/** The steps a builder chain takes. One written anywhere else was written on a value. */
const STEPS = new Set([
  "impl",
  "implSeal",
  "implCreate",
  "implEquals",
  "implTrait",
  "implVariant",
  "fixed",
]);

/**
 * A step written on something that is not a builder chain, or `undefined`.
 *
 * Only the step the chain begins with is recorded: the ones after it sit on what that one
 * returned, and reporting each of them would report one chain many times.
 *
 * The rule answers whether the base is a companion at all. A `.impl` on anything else resolves to
 * no declaration and is never reported.
 */
function detachedStep(
  node: Node,
  file: string,
  bound: Bindings,
  at: (offset: number) => Where,
): DetachedStep | undefined {
  const callee = child(node, "callee");
  if (!callee || callee.type !== "MemberExpression") return undefined;
  const property = child(callee, "property");
  const step = property && keyName(property, callee["computed"] === true);
  if (!step || !STEPS.has(step)) return undefined;
  const receiver = child(callee, "object");
  if (!receiver || receiver.type === "CallExpression") return undefined;
  if (fromRoot(callee, bound)) return undefined;
  const where = at(property["start"] as number);
  const direct = valueReference(receiver, file, bound);
  if (direct) return { ...where, step, baseName: direct.name, base: direct, variant: undefined };
  // `Shape.Circle.implSeal(…)`: the base is the companion, and the key is the variant on it.
  if (receiver.type !== "MemberExpression") return undefined;
  const object = child(receiver, "object");
  const key = child(receiver, "property");
  const variant = key && keyName(key, receiver["computed"] === true);
  if (object?.type !== "Identifier" || !variant) return undefined;
  const base = symbolRef(file, bound, object["name"] as string);
  return { ...where, step, baseName: base.name, base, variant };
}
