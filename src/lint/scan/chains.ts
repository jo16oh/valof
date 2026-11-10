import {
  keyName,
  rootPath,
  typeParams,
  unparenthesized,
  type Identifier,
  type Node,
  Lines,
  type Position,
} from "../ast.ts";
import type { FilePath } from "../files.ts";
import type { Enum } from "../../enum.ts";
import type { Trait } from "../../trait.ts";
import type { AnyVal, CompanionBuilder } from "../../val.ts";
import { Val, type VariantOf } from "../../index.ts";
import { Bindings, type SymbolRef } from "./bindings.ts";

/** `K`, which must be a key of every member of `T`. */
type On<T, K extends keyof T> = K;

/** The entry points a chain grows from. A rename in the library is a type error here. */
const ENTRY_POINTS: ReadonlySet<string> = new Set([
  "companion" satisfies On<typeof Val | typeof Enum | typeof Trait, "companion">,
]);

/** A `Val` / `Trait` / `Enum` companion chain, whatever else it registered. */
export type CompanionSite = Val<
  "CompanionSite",
  {
    at: Position;
    file: FilePath;
    /** Which entry point the chain grew from: `Val`, `Trait` or `Enum`. */
    of: string;
    /** The name the chain was bound to, or `null` when it was not bound to a plain one. */
    name: string | null;
    /** Where that name is written. The chain's own position stands in when there is no name. */
    nameAt: Position;
    /**
     * The type argument, resolved to an alias after the walk.
     *
     * Named as the declaring module names it, so a namespace qualifier is stepped past: `ns.User`
     * gives `User`, which is also what a read through a namespace is keyed on.
     */
    typeName: string;
    typeRef: SymbolRef;
    typeOffset: number;
    /** Where the type argument is written. */
    typeAt: Position;
    /** The namespace it was reached through, for `Val.companion<ns.User>()`. */
    qualifier: string | null;
    /** Whether the chain registered a seal of its own, with `.implSeal`. */
    seals: boolean;
  }
>;
export const CompanionSite = Val.companion<CompanionSite>()
  .implAssoc(() => ({
    /** The chain as a companion site, or `undefined` when it names no type to key it by. */
    fromChain: companionSite,
  }))
  .build();

/** One step of a builder chain: the name it was called by, and what it was called on. */
type Step = Val<"Step", { name: string | null; property: Node; receiver: Node }>;
const Step = Val.companion<Step>().build();

/** Reads `.implCreate.noseal(f)` as the `implCreate` step. */
export function stepOf(callee: VariantOf<Node, "MemberExpression">): Step {
  const { object: receiver, property } = callee;
  const name = keyName(property, callee.computed) ?? null;
  if (
    name === ("noseal" satisfies keyof CompanionBuilder<AnyVal>["implCreate"]) &&
    receiver.type === "MemberExpression"
  ) {
    const outer = stepOf(receiver);
    if (outer.name === "implCreate") return outer;
  }
  return Step.seal({ name, property, receiver });
}

/**
 * Reads `….Circle` in `….Circle.impl(f)` as the variant an enum's builder names, with the builder
 * it was read off: a call, or a builder held in a variable. The step on it belongs to that variant.
 */
export function variantOf(receiver: Node): { variant: string; builder: Node } | undefined {
  if (receiver.type !== "MemberExpression") return undefined;
  const builder = receiver.object;
  if (builder.type !== "CallExpression" && builder.type !== "Identifier") return undefined;
  const variant = keyName(receiver.property, receiver.computed);
  return variant ? { variant, builder } : undefined;
}

/** Which entry point a chain grows from, however the name was bound. */
export function fromRoot(node: Node, bound: Bindings): string | undefined {
  const path = rootPath(node);
  if (!path || path.length === 0) return undefined;
  const [first, second, third] = path as [string, string?, string?];
  if (path.length === 1) return Bindings.builder(bound, first);
  // `valof.Val.companion`: step past the namespace, which only says where the name came from.
  const qualified = Bindings.isNamespace(bound, first);
  const name = qualified ? second : Bindings.original(bound, first);
  const step = qualified ? third : second;
  if (step === undefined || !ENTRY_POINTS.has(step)) return undefined;
  return name === "Val" || name === "Trait" || name === "Enum" ? name : undefined;
}

/**
 * A `Val.of(…)` call, which brands a payload with the default seal.
 *
 * `typeName` is `null` where the call named no type and took one from its target. It sits at the
 * type argument when there is one, and at `of` when there is not.
 */
export type Lift = Val<
  "Lift",
  {
    at: Position;
    typeName: string | null;
    typeRef: SymbolRef | null;
    qualifier: string | null;
    /**
     * The variant a `VariantOf<E, "N">` argument named, where the lift named one. `typeName` and
     * `typeRef` are then the enum's, which is what holds that variant's frame.
     */
    variant: string | null;
  }
>;
export const Lift = Val.companion<Lift>()
  .implAssoc(() => ({
    /** The lift at this call, or `undefined` when the call is not `Val.of<X>(…)`. */
    fromCall: valOf,
  }))
  .build();

/** The body of {@link Lift.fromCall}. */
function valOf(node: Node, file: FilePath, bound: Bindings, lines: Lines): Lift | undefined {
  if (node.type !== "CallExpression") return undefined;
  const { callee } = node;
  if (callee.type !== "MemberExpression") return undefined;
  const path = rootPath(callee);
  if (!path || path.length < 2) return undefined;
  const [first, second, third] = path as [string, string?, string?];
  const qualified = Bindings.isNamespace(bound, first);
  const name = qualified ? second : Bindings.original(bound, first);
  const step = qualified ? third : second;
  if (name !== "Val" || step !== ("of" satisfies keyof typeof Val)) return undefined;
  const param = unparenthesized(typeParams(node.typeArguments)[0]);
  if (!param) {
    return Lift.seal({
      at: Lines.at(lines, callee.property.start),
      typeName: null,
      typeRef: null,
      qualifier: null,
      variant: null,
    });
  }
  // A type argument that is not a plain reference, `Val.of<{ … }>`, names no Val to key it by.
  if (param.type !== "TSTypeReference") return undefined;
  const named = typeReference(param.typeName, bound);
  if (!named) return undefined;
  const of = variantArgument(param, named, bound);
  const reached = of ?? named;
  return Lift.seal({
    at: Lines.at(lines, reached.node.start),
    typeName: reached.node.name,
    typeRef: Bindings.refOf(bound, file, reached.node.name, reached.qualifier),
    qualifier: reached.qualifier ?? null,
    variant: of?.variant ?? null,
  });
}

/** The enum and variant a `VariantOf<E, "N">` argument names, which stand in for the reference. */
function variantArgument(
  param: VariantOf<Node, "TSTypeReference">,
  named: { node: Identifier; qualifier: string | undefined },
  bound: Bindings,
): { node: Identifier; qualifier: string | undefined; variant: string } | undefined {
  const written = named.node.name;
  // A name reached through a namespace is already the exporting module's own.
  if ((named.qualifier === undefined ? Bindings.original(bound, written) : written) !== "VariantOf")
    return undefined;
  const [enumType, variantType] = typeParams(param.typeArguments).map(unparenthesized);
  if (enumType?.type !== "TSTypeReference" || variantType?.type !== "TSLiteralType")
    return undefined;
  const { literal } = variantType;
  const held = typeReference(enumType.typeName, bound);
  if (!held || literal.type !== "Literal" || literal.value === null) return undefined;
  return { ...held, variant: literal.value };
}

/** What a chain called, and the type argument at its root. */
type Chain = Val<
  "Chain",
  {
    /** The steps called with an argument, by name. */
    steps: string[];
    /** The root call's type arguments, or `null` when the chain has no root of ours. */
    typeArguments: Node | null;
    /** Which entry point the chain grew from, once it is known to have one. */
    of: string | null;
  }
>;
const Chain = Val.companion<Chain>().build();

/**
 * Reads a builder chain from the outside in.
 * `Val.companion<Order>().implSeal(f).impl(() => ({…}))` gives both `implSeal` and `Order`. A
 * variant's step, `.Circle.implSeal(f)`, counts as the step.
 *
 * A call whose receiver is not itself a call is the root, which is what tells
 * `Val.companion<X>()` apart from the steps chained onto it.
 */
function readChain(node: Node, bound: Bindings): Chain {
  const steps = new Set<string>();
  let of: string | undefined;

  const walk = (current: Node): Node | null => {
    if (current.type !== "CallExpression") return null;
    const { callee } = current;
    if (callee.type !== "MemberExpression") return null;
    const { name, receiver: stepReceiver } = stepOf(callee);
    const receiver = variantOf(stepReceiver)?.builder ?? stepReceiver;
    if (receiver.type !== "CallExpression") {
      of = fromRoot(callee, bound);
      return of ? current.typeArguments : null;
    }
    if (name !== null && current.arguments.length > 0) steps.add(name);
    return walk(receiver);
  };

  const typeArguments = walk(node);
  return Chain.seal({ steps: [...steps], typeArguments, of: of ?? null });
}

/**
 * The name a type reference is written under, with the namespace it was reached through.
 *
 * `valof.Val<…>` in a type position is the alias walk's job; here the qualifier says the type
 * was declared in another module, which nothing else about the site records.
 */
export function typeReference(
  written: Node,
  bound: Bindings,
): { node: Identifier; qualifier: string | undefined } | undefined {
  if (written.type === "Identifier") return { node: written, qualifier: undefined };
  if (written.type !== "TSQualifiedName") return undefined;
  const { left, right } = written;
  if (left.type !== "Identifier" || right.type !== "Identifier") return undefined;
  const qualifier = left.name;
  return Bindings.isNamespace(bound, qualifier) ? { node: right, qualifier } : undefined;
}

/** The body of {@link CompanionSite.fromChain}. */
function companionSite(
  node: Node,
  file: FilePath,
  at: Position,
  bound: Bindings,
  lines: Lines,
): CompanionSite | undefined {
  const { steps, typeArguments, of } = readChain(node, bound);
  const first = unparenthesized(typeParams(typeArguments)[0]);
  if (first?.type !== "TSTypeReference" || of === null) return undefined;
  // A type argument taking type arguments of its own, `Val.companion<VariantOf<Shape, "Circle">>()`,
  // names no declaration this walk knows. The type rejects that one, and reporting `VariantOf` as
  // the type the companion is for would name something the user never declared.
  if (first.typeArguments) return undefined;
  const named = typeReference(first.typeName, bound);
  if (!named) return undefined;
  return CompanionSite.seal({
    at,
    file,
    of,
    nameAt: at,
    typeName: named.node.name,
    typeRef: Bindings.refOf(bound, file, named.node.name, named.qualifier),
    typeOffset: named.node.start,
    typeAt: Lines.at(lines, named.node.start),
    name: null,
    qualifier: named.qualifier ?? null,
    seals: steps.includes("implSeal"),
  });
}
