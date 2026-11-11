import { normalize, resolve } from "node:path";

import { pipe } from "../../shared/pipe/index.ts";
import { Val } from "../../index.ts";
import type { Enum, EnumCompanion } from "../../enum.ts";
import type { AnyTrait, TraitCompanion } from "../../trait.ts";
import type { Reserved } from "../../val.ts";
import type { FilePath } from "../files.ts";

import { keyName, Lines, typeParams, unparenthesized, type Node, type Position } from "../ast.ts";
import { Parser } from "../parser.ts";
import {
  Aliases,
  type Alias,
  type BrandClaim,
  type EnumAlias,
  type ReAlias,
  type TraitAlias,
} from "./aliases.ts";
import { Bindings, ImportBinding, ImportMap, Modules, SymbolRef } from "./bindings.ts";
import {
  CompanionSite,
  chainRoot,
  fromRoot,
  stepOf,
  variantOf,
  typeReference,
  Lift,
} from "./chains.ts";
import { directives, type Directive } from "./directives.ts";
import { models, type Models } from "./models.ts";

// The pieces a `Scan` is made of, so a rule reads them from the scan rather than reaching past
// it into the walk that produced them.
export { ImportMap } from "./bindings.ts";
export type { ImportBinding, SymbolRef } from "./bindings.ts";
export type {
  Alias,
  BrandClaim,
  DeclaredTrait,
  EnumAlias,
  ReAlias,
  TraitAlias,
} from "./aliases.ts";
export type { CompanionSite, Lift } from "./chains.ts";
export { Directive, DirectiveMap } from "./directives.ts";
export type { Model, Models, Shape, TypeUse } from "./models.ts";

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
    /** The variant it was written for, or `null` where it was written for the whole type. */
    variant: string | null;
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

/** The function a member step takes, `.impl(() => { … })`, where its body declares something. */
export type StepState = Val<"StepState", { at: Position; step: string }>;
export const StepState = Val.companion<StepState>().build();

/**
 * A top-level const whose type annotation may hide a default or a rest parameter of the function
 * it holds: `const toWire: ToWire = (u, sep = ",") => …`, or a property of an annotated object.
 */
export type HiddenParameter = Val<
  "HiddenParameter",
  {
    at: Position;
    name: string;
    ref: SymbolRef;
    /** Where the const's name starts, which is what TypeScript is asked about. */
    offset: number;
    /** The property holding the function, or `null` where the const holds the function. */
    property: string | null;
    /** The index of the first default or rest parameter. */
    parameter: number;
    rest: boolean;
  }
>;
export const HiddenParameter = Val.companion<HiddenParameter>().build();

/** A `Trait.dyn(Val, value)` box: the Trait, and the Val it holds. */
type DynBox = Val<"DynBox", { trait: SymbolRef; val: SymbolRef }>;
const DynBox = Val.companion<DynBox>().build();

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
    file: FilePath;
    imported: ImportMap;
    /** What `.impl(() => ({…}))` registered here. */
    members: Member[];
    /** Trait implementations, including the keys which replace a default implementation. */
    traitImplementations: TraitImplementation[];
    dynReads: DynRead[];
    escapedDyns: EscapedDyn[];
    /** Annotated top-level consts holding a function with a default or a rest parameter. */
    hiddenParameters: HiddenParameter[];
    /** The names a member step takes its members from: `() => fns`, or `() => ({ toWire })`. */
    memberSources: SymbolRef[];
    /** Member steps whose function declares something in its body. */
    stepStates: StepState[];
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
    /** What `data-type-outside-valof` reads. */
    models: Models;
    /** Every `valof-lint-disable-next-line` that takes effect, at its own comment. */
    directives: Directive[];
  }
>;
export const Scan = Val.companion<Scan>()
  .implAssoc(() => ({
    /**
     * Walks one file once, for every rule.
     *
     * One walk rather than one per rule because the rules share their footing: {@link Bindings}
     * resolves a name for all three, and the chain analysis that spots `.impl(() => ({…}))` is the
     * same one that spots `.implSeal`. What comes back is material, not findings; deciding is the
     * rules' job, and they see every file rather than this one.
     */
    walk: scan,
  }))
  .build();

/**
 * What each module of a run exports, keyed by the reference an export makes: a re-export points on
 * to the symbol it exposes.
 */
export type Exports = Val<"Exports", Record<string, SymbolRef>>;
export const Exports = Val.companion<Exports>()
  .implAssoc(({ seal }) => ({
    from: (scans: readonly Scan[]): Exports =>
      pipe(
        scans.flatMap(({ file, exportedRefs }) => {
          const module = normalize(resolve(file));
          return Object.entries(exportedRefs).map(([name, target]) => [
            SymbolRef.fromExport(module, name).key,
            target,
          ]);
        }),
        Object.fromEntries,
        seal,
      ),
  }))
  .impl(() => ({
    /** The key of the symbol `ref` stands for, past every local export and re-export chain. */
    identify: (exports, ref: SymbolRef): string => {
      const seen = new Set<string>();
      let current = ref;
      while (!seen.has(current.key) && Object.hasOwn(exports, current.key)) {
        seen.add(current.key);
        current = exports[current.key]!;
      }
      return current.key;
    },
  }))
  .build();

/** An enum to read keys from. `AnyEnum` widens them to `string`. */
type Sample = Enum<"Sample", { A: { a: 1 } }>;

/** The {@link Reserved} names with no pattern. */
type Unlisted<N extends string> = Reserved extends infer R
  ? R extends unknown
    ? Extract<N, R> extends never
      ? R
      : never
    : never
  : never;

/**
 * Matches a whole name against the patterns. A {@link Reserved} name without a pattern, or a
 * pattern that is not one, is a type error.
 */
// valof-lint-disable-next-line data-type-outside-valof -- a list of Vals, not a new shape
export function reserved<const N extends readonly Reserved[]>(
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
const rejected = (member: string, root?: string): boolean =>
  RESERVED.test(member) ||
  (root === "Enum" && member === ("match" satisfies keyof EnumCompanion<Sample>)) ||
  (root === "Trait" && member === ("dyn" satisfies keyof TraitCompanion<AnyTrait>));

function collect<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(value);
}

/** The body of {@link Scan.walk}. */
function scan(file: FilePath, parser: Parser, modules: Modules, source: string): Scan {
  const lines = Lines.from(source);

  let bound = Bindings.create();
  const exportedAs = new Map<string, string>();
  const exportedRefs = new Map<string, SymbolRef>();
  const members: Member[] = [];
  const traitImplementations: TraitImplementation[] = [];
  const dynReads: DynRead[] = [];
  const escapedDyns: EscapedDyn[] = [];
  const stepStates: StepState[] = [];
  const memberSources: SymbolRef[] = [];
  /** The boxes a read is followed from, which therefore do not escape. */
  const followed = new Set<Node>();
  const objects = new Map<string, Node>();
  const dynBindings = new Map<string, DynBox>();
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
        companionRef: Bindings.refOf(bound, file, companion, undefined),
        key,
      }),
    );
    dotted.set(name, `${Bindings.originalName(bound, companion)}.${key}`);
  };

  const visit = (node: Node): void => {
    switch (node.type) {
      case "VariableDeclaration": {
        if (node.kind !== "const") break;
        for (const declaration of node.declarations) {
          if (declaration.type !== "VariableDeclarator") continue;
          const { id, init } = declaration;
          if (id.type !== "Identifier" || !init) continue;
          objects.set(id.name, init);
          const dyn = dynBox(init, file, bound);
          if (dyn) {
            dynBindings.set(id.name, dyn);
            followed.add(init);
          }
        }
        break;
      }
      case "VariableDeclarator": {
        const { id, init } = node;
        if (!init) break;
        const site = CompanionSite.fromChain(init, file, Lines.at(lines, init.start), bound, lines);
        if (site)
          sites.push(
            id.type === "Identifier"
              ? CompanionSite.patch(site, { name: id.name, nameAt: Lines.at(lines, id.start) })
              : site,
          );
        // `const { a, b: c } = X` reads `a` and `b` off `X`.
        if (id.type === "ObjectPattern" && init.type === "Identifier") {
          const from = init.name;
          const dyn = dynBindings.get(from);
          for (const property of id.properties) {
            if (property.type !== "Property") continue;
            const name = keyName(property.key, property.computed);
            if (name) {
              if (dyn) dynReads.push(DynRead.seal({ ...dyn, member: name }));
              else {
                collect(reads, from, name);
                const local = property.value;
                if (local.type === "Identifier")
                  took(local.name, Lines.at(lines, local.start), from, name);
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
            for (const property of id.properties) {
              if (property.type !== "Property") continue;
              const name = keyName(property.key, property.computed);
              if (name) dynReads.push(DynRead.seal({ ...dyn, member: name }));
            }
        }
        if (id.type !== "Identifier") break;
        const root = fromRoot(init, bound);
        if (root) bound = Bindings.patch(bound, { builders: { [id.name]: root } });
        // `const Round = Shape.Circle` takes the same key the destructuring above takes.
        if (init.type === "MemberExpression") {
          const from = init.object;
          const taken = keyName(init.property, init.computed);
          if (from.type === "Identifier" && taken && !Bindings.hasNamespace(bound, from.name))
            took(id.name, Lines.at(lines, id.start), from.name, taken);
        }
        members.push(...implMembers(init, id.name, bound, objects, lines));
        break;
      }
      case "CallExpression": {
        // Visited after whatever contains it, so a box read where it is made is already followed.
        const box = followed.has(node) ? undefined : dynBox(node, file, bound);
        if (box) escapedDyns.push(EscapedDyn.seal(box));
        memberSources.push(...sources(node, file, bound));
        const state = stepState(node, bound);
        if (state)
          stepStates.push(StepState.seal({ at: Lines.at(lines, state.start), step: state.step }));
        const lift = Lift.fromCall(node, file, bound, lines);
        if (lift) lifts.push(lift);
        const implementation = implTrait(node, file, bound, sites, objects, lines);
        if (implementation) {
          traitImplementations.push(implementation);
          members.push(...implementation.overrides);
        }
        break;
      }
      case "MemberExpression": {
        const { object } = node;
        const name = keyName(node.property, node.computed);
        if (!name) break;
        if (object.type === "Identifier") {
          const dyn = dynBindings.get(object.name);
          if (dyn) {
            dynReads.push(DynRead.seal({ ...dyn, member: name }));
            break;
          }
          collect(reads, object.name, name);
          // A variant bound to a local name is read here and declared under the dotted key.
          const pair = dotted.get(object.name);
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
        const namespace = object.object;
        if (namespace.type !== "Identifier") break;
        const through = keyName(object.property, object.computed);
        if (!through) break;
        if (Bindings.hasNamespace(bound, namespace.name)) {
          collect(namespaceReads, through, name);
          break;
        }
        // `Shape.Circle.diameter`: a variant's members are declared under the same dotted key,
        // which is where the two meet.
        collect(reads, `${Bindings.originalName(bound, namespace.name)}.${through}`, name);
        break;
      }
      case "ImportDeclaration": {
        const module = stringOf(node.source);
        if (module === undefined) break;
        const resolved = Modules.resolve(modules, file, module);
        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportNamespaceSpecifier" &&
            specifier.local.type === "Identifier"
          )
            bound = Bindings.patch(bound, { namespaces: { [specifier.local.name]: resolved } });
          else if (specifier.type === "ImportSpecifier" && specifier.local.type === "Identifier") {
            const name = keyName(specifier.imported, false);
            if (name)
              bound = Bindings.patch(bound, {
                imported: ImportMap.patch(bound.imported, {
                  [specifier.local.name]: ImportBinding.seal({ name, module: resolved }),
                }),
              });
          }
        }
        break;
      }
      default:
        break;
    }

    for (const one of node.children) visit(one);
  };

  const { program, comments } = Parser.exec(parser, file, source);
  visit(program);

  // Imports may follow an export declaration. Resolve local exports only after every binding is
  // known, so `export { Imported as Public }` retains Imported's source module either way.
  exportedAs.clear();
  exportedRefs.clear();
  for (const statement of program.type === "Program" ? program.body : []) {
    if (statement.type !== "ExportNamedDeclaration") continue;
    const from = statement.source && stringOf(statement.source);
    const module =
      from === null || from === undefined ? undefined : Modules.resolve(modules, file, from);
    for (const specifier of statement.specifiers) {
      if (specifier.type !== "ExportSpecifier") continue;
      const outside = keyName(specifier.exported, false);
      const inside = keyName(specifier.local, false);
      if (!outside || !inside) continue;
      exportedAs.set(outside, inside);
      exportedRefs.set(
        outside,
        module
          ? SymbolRef.fromExport(module, inside)
          : Bindings.refOf(bound, file, inside, undefined),
      );
    }
  }

  // After the walk, which is what collected the imports `Val` is resolved against.
  const { aliases, traitAliases, enumAliases, brands, reAliases } = Aliases.fromProgram(
    program,
    file,
    bound,
    lines,
  );

  return Scan.seal({
    file,
    imported: bound.imported,
    members,
    traitImplementations,
    dynReads,
    escapedDyns,
    stepStates,
    hiddenParameters: hidden(program, file, bound, lines),
    memberSources,
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
    models: models(file, program, bound, lines),
    directives: directives(comments, source, lines),
  });
}

/** The uncomplicated `Trait.dyn(Val, value)` form.  Escaping the box is deliberately not traced. */
function dynBox(node: Node, file: FilePath, bound: Bindings): DynBox | undefined {
  if (node.type !== "CallExpression") return undefined;
  const { callee } = node;
  if (callee.type !== "MemberExpression" || keyName(callee.property, callee.computed) !== "dyn")
    return undefined;
  const args = node.arguments;
  const trait = valueReference(callee.object, file, bound);
  const val = args[0] && valueReference(args[0], file, bound);
  return trait && val ? DynBox.seal({ trait, val }) : undefined;
}

/** A runtime companion reference with its exporting module retained. */
function valueReference(node: Node, file: FilePath, bound: Bindings): SymbolRef | undefined {
  if (node.type === "Identifier") return Bindings.refOf(bound, file, node.name, undefined);
  if (node.type !== "MemberExpression") return undefined;
  const { object } = node;
  if (object.type !== "Identifier" || !Bindings.hasNamespace(bound, object.name)) return undefined;
  const name = keyName(node.property, node.computed);
  return name ? Bindings.refOf(bound, file, name, object.name) : undefined;
}

/** Reads one `.implTrait` call without collapsing repeated calls in the same chain. */
function implTrait(
  node: Node,
  file: FilePath,
  bound: Bindings,
  sites: readonly CompanionSite[],
  objects: ReadonlyMap<string, Node>,
  lines: Lines,
): TraitImplementation | undefined {
  if (node.type !== "CallExpression") return undefined;
  const { callee } = node;
  if (
    callee.type !== "MemberExpression" ||
    keyName(callee.property, callee.computed) !== "implTrait"
  )
    return undefined;
  // `….Book.implTrait(T, f)` implements the trait for that variant alone.
  const variant = variantOf(callee.object);
  let current = variant?.builder ?? callee.object;
  while (current.type === "CallExpression") {
    const inner = current.callee;
    if (inner.type !== "MemberExpression") break;
    const { receiver } = stepOf(inner);
    const next = variantOf(receiver)?.builder ?? receiver;
    if (next.type !== "CallExpression") break;
    current = next;
  }
  let val: SymbolRef | undefined;
  if (
    current.type === "CallExpression" &&
    current.callee.type === "MemberExpression" &&
    fromRoot(current.callee, bound)
  ) {
    const valNode = unparenthesized(typeParams(current.typeArguments)[0]);
    const valNamed =
      valNode?.type === "TSTypeReference" ? typeReference(valNode.typeName, bound) : undefined;
    val = valNamed
      ? Bindings.refOf(bound, file, valNamed.node.name, valNamed.qualifier ?? undefined)
      : undefined;
  } else if (current.type === "Identifier") {
    const builder = current.name;
    val = sites.find((one) => one.name === builder)?.typeRef;
  }
  if (!val) return undefined;
  const [traitRef, object] = node.arguments;
  const trait = traitRef && valueReference(traitRef, file, bound);
  if (!trait) return undefined;
  const resolved = object ? stepMembers(object, val.name, objects, lines) : [];
  return TraitImplementation.seal({
    val,
    trait,
    overrides: resolved,
    variant: variant?.variant ?? null,
  });
}

/**
 * The members a step's function returns: `() => ({…})`, `() => held`, or a const holding either.
 * A block body is not read.
 */
function stepMembers(
  node: Node,
  companion: string,
  objects: ReadonlyMap<string, Node>,
  lines: Lines,
): Member[] {
  const fn = node.type === "Identifier" ? objects.get(node.name) : node;
  const body = fn?.type === "ArrowFunctionExpression" ? unparenthesized(fn.body) : undefined;
  return body ? objectMembers(body, companion, objects, lines, new Set()) : [];
}

/** Resolves inline/const objects and spreads, retaining known keys even beside an unknown spread. */
function objectMembers(
  node: Node,
  companion: string,
  objects: ReadonlyMap<string, Node>,
  lines: Lines,
  seen: Set<string>,
): Member[] {
  if (node.type === "Identifier") {
    const { name } = node;
    if (seen.has(name)) return [];
    const target = objects.get(name);
    if (!target) return [];
    const next = new Set(seen);
    next.add(name);
    return objectMembers(target, companion, objects, lines, next);
  }
  if (node.type !== "ObjectExpression") return [];
  const byName = new Map<string, Member>();
  for (const entry of node.properties) {
    if (entry.type === "SpreadElement") {
      for (const member of objectMembers(entry.argument, companion, objects, lines, seen))
        byName.set(member.member, member);
      continue;
    }
    if (entry.type !== "Property") continue;
    const name = keyName(entry.key, entry.computed);
    if (name)
      byName.set(name, Member.seal({ at: Lines.at(lines, entry.start), companion, member: name }));
  }
  return [...byName.values()];
}

/**
 * Every `.impl` and `.implAssoc` in a builder chain of any root, including repeated calls. A
 * variant's, `.Circle.impl(() => ({…}))`, registers under `` `${enum}.${variant}` ``.
 */
function implMembers(
  node: Node,
  companion: string,
  bound: Bindings,
  objects: ReadonlyMap<string, Node>,
  lines: Lines,
): Member[] {
  const found = new Map<string, Member>();
  let current: Node = node;
  while (current.type === "CallExpression") {
    const { callee } = current;
    if (callee.type !== "MemberExpression") break;
    const step = stepOf(callee);
    const variant = variantOf(step.receiver);
    const receiver = variant?.builder ?? step.receiver;
    const root = fromRoot(receiver, bound);
    const [object] = current.arguments;
    if ((step.name === "impl" || step.name === "implAssoc") && root !== undefined && object) {
      const owner = variant ? `${companion}.${variant.variant}` : companion;
      for (const member of stepMembers(object, owner, objects, lines))
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

/** The string a literal node spells, or `undefined` for any other node. */
function stringOf(node: Node): string | undefined {
  return node.type === "Literal" ? (node.value ?? undefined) : undefined;
}

/** The steps that take the members, and which argument holds their function. */
const MEMBER_STEPS: ReadonlyMap<string, number> = new Map([
  ["impl", 0],
  ["implTrait", 1],
  ["implAssoc", 0],
]);

/** The function a member step on a companion chain takes, with the step's name. */
function memberStep(
  node: Node,
  bound: Bindings,
): { step: string; fn: Node | undefined } | undefined {
  if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression") return undefined;
  const step = stepOf(node.callee).name;
  const index = step === null ? undefined : MEMBER_STEPS.get(step);
  if (step === null || index === undefined || !chainRoot(node.callee, bound)) return undefined;
  return { step, fn: node.arguments[index] };
}

/** What a function body may declare: each is state the members share. */
const DECLARATIONS = new Set(["VariableDeclaration", "FunctionDeclaration", "ClassDeclaration"]);

/**
 * A member step on a companion chain whose function declares something in its body, where the
 * function starts. Only the body's own statements are read.
 */
function stepState(node: Node, bound: Bindings): { step: string; start: number } | undefined {
  const found = memberStep(node, bound);
  const fn = found?.fn;
  const body =
    fn?.type === "FunctionExpression" || fn?.type === "ArrowFunctionExpression"
      ? fn.body
      : undefined;
  const declares =
    body?.type === "BlockStatement" && body.children.some((one) => DECLARATIONS.has(one.type));
  return found && fn && declares ? { step: found.step, start: fn.start } : undefined;
}

/** The parameters of a function node, none for anything else. */
const paramsOf = (fn: Node | undefined): readonly Node[] =>
  fn?.type === "ArrowFunctionExpression" || fn?.type === "FunctionExpression" ? fn.params : [];

/** The index of a function's first default or rest parameter, and which it is. */
function optional(
  fn: Node | null | undefined,
): { parameter: number; rest: boolean; start: number } | undefined {
  const params = paramsOf(fn ?? undefined);
  const parameter = params.findIndex(
    (one) => one.type === "AssignmentPattern" || one.type === "RestElement",
  );
  const found = params[parameter];
  return found ? { parameter, rest: found.type === "RestElement", start: found.start } : undefined;
}

/** Every annotated top-level const holding a function, or an object of them, with one. */
function hidden(program: Node, file: FilePath, bound: Bindings, lines: Lines): HiddenParameter[] {
  const found: HiddenParameter[] = [];
  for (const statement of program.type === "Program" ? program.body : []) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type !== "VariableDeclaration" || declaration.kind !== "const") continue;
    for (const declarator of declaration.declarations) {
      if (declarator.type !== "VariableDeclarator") continue;
      const { id } = declarator;
      const init = unparenthesized(declarator.init);
      if (id.type !== "Identifier" || !id.annotated || !init) continue;
      const base = {
        name: id.name,
        ref: Bindings.refOf(bound, file, id.name, undefined),
        offset: id.start,
      };
      const own = optional(init);
      if (own)
        found.push(
          HiddenParameter.seal({
            ...base,
            at: Lines.at(lines, own.start),
            property: null,
            parameter: own.parameter,
            rest: own.rest,
          }),
        );
      if (init.type !== "ObjectExpression") continue;
      for (const entry of init.properties) {
        if (entry.type !== "Property") continue;
        const property = keyName(entry.key, entry.computed);
        const inner = optional(entry.value);
        if (property && inner)
          found.push(
            HiddenParameter.seal({
              ...base,
              at: Lines.at(lines, inner.start),
              property,
              parameter: inner.parameter,
              rest: inner.rest,
            }),
          );
      }
    }
  }
  return found;
}

/** The names a member step's function returns, or the object it returns takes its members from. */
function sources(node: Node, file: FilePath, bound: Bindings): SymbolRef[] {
  const fn = memberStep(node, bound)?.fn;
  const body = fn?.type === "ArrowFunctionExpression" ? unparenthesized(fn.body) : undefined;
  const named = (one: Node | undefined): SymbolRef[] =>
    one?.type === "Identifier" ? [Bindings.refOf(bound, file, one.name, undefined)] : [];
  if (body?.type === "Identifier") return named(body);
  if (body?.type !== "ObjectExpression") return [];
  return body.properties.flatMap((entry) => (entry.type === "Property" ? named(entry.value) : []));
}
