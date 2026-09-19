import {
  child,
  children,
  keyName,
  rootPath,
  unparenthesized,
  type Node,
  type Where,
} from "../ast.ts";
import { original, symbolRef, type Bindings, type Root, type SymbolRef } from "./bindings.ts";

/** A `Val` / `Trait` / `Enum` companion chain, whatever else it registered. */
export type CompanionSite = Where & {
  file: string;
  /** Which entry point the chain grew from. */
  of: Root;
  /** The name the chain was bound to, or `undefined` when it was not bound to a plain one. */
  name: string | undefined;
  /** Where that name is written. The chain's own position stands in when there is no name. */
  nameAt: Where;
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
  typeAt: Where;
  /** The namespace it was reached through, for `Val.sealer<ns.User>()`. */
  qualifier: string | undefined;
  /** The argument to `.implEquals(…)`, when the chain called it. */
  spec: Node | undefined;
  /** Which of the two the chain grew from. A sealer is callable; a companion is not. */
  root: "sealer" | "companion";
  /** Whether the chain registered a seal of its own, with `.implSeal`. */
  seals: boolean;
};

/** Which entry point a chain grows from, however the name was bound. */
export function fromRoot(node: Node, bound: Bindings): Root | undefined {
  const path = rootPath(node);
  if (!path || path.length === 0) return undefined;
  const [first, second, third] = path as [string, string?, string?];
  if (path.length === 1) return bound.builders.get(first);
  // `valof.Val.sealer`: step past the namespace, which only says where the name came from.
  const qualified = bound.namespaces.has(first);
  const name = qualified ? second : original(bound, first);
  const step = qualified ? third : second;
  if (step !== "sealer" && step !== "companion") return undefined;
  return name === "Val" || name === "Trait" || name === "Enum" ? name : undefined;
}

/**
 * A `Val.of(…)` call, which brands a payload with the default seal.
 *
 * `typeName` is absent where the call named no type and took one from its target. It sits at the
 * type argument when there is one, and at `of` when there is not.
 */
export type Lift = Where & {
  typeName: string | undefined;
  typeRef: SymbolRef | undefined;
  qualifier: string | undefined;
  /**
   * The variant a `VariantOf<E, "N">` argument named, where the lift named one. `typeName` and
   * `typeRef` are then the enum's, which is what holds that variant's frame.
   */
  variant: string | undefined;
};

/** The lift at this call, or `undefined` when the call is not `Val.of<X>(…)`. */
export function valOf(
  node: Node,
  file: string,
  bound: Bindings,
  at: (offset: number) => Where,
): Lift | undefined {
  const callee = child(node, "callee");
  if (!callee || callee.type !== "MemberExpression") return undefined;
  const path = rootPath(callee);
  if (!path || path.length < 2) return undefined;
  const [first, second, third] = path as [string, string?, string?];
  const qualified = bound.namespaces.has(first);
  const name = qualified ? second : original(bound, first);
  const step = qualified ? third : second;
  if (name !== "Val" || step !== "of") return undefined;
  const args = child(node, "typeArguments");
  const param = unparenthesized(args ? children(args, "params")[0] : undefined);
  if (!param) {
    const property = child(callee, "property");
    if (!property) return undefined;
    return {
      ...at(property["start"] as number),
      typeName: undefined,
      typeRef: undefined,
      qualifier: undefined,
      variant: undefined,
    };
  }
  // A type argument that is not a plain reference, `Val.of<{ … }>`, names no Val to key it by.
  if (param.type !== "TSTypeReference") return undefined;
  const written = child(param, "typeName");
  const named = written && typeReference(written, bound.namespaces);
  if (!named) return undefined;
  const of = variantArgument(param, named, bound);
  const reached = of ?? named;
  return {
    ...at(reached.node["start"] as number),
    typeName: reached.node["name"] as string,
    typeRef: symbolRef(file, bound, reached.node["name"] as string, reached.qualifier),
    qualifier: reached.qualifier,
    variant: of?.variant,
  };
}

/** The enum and variant a `VariantOf<E, "N">` argument names, which stand in for the reference. */
function variantArgument(
  param: Node,
  named: { node: Node; qualifier: string | undefined },
  bound: Bindings,
): { node: Node; qualifier: string | undefined; variant: string } | undefined {
  const written = named.node["name"] as string;
  // A name reached through a namespace is already the exporting module's own.
  if ((named.qualifier === undefined ? original(bound, written) : written) !== "VariantOf")
    return undefined;
  const args = child(param, "typeArguments");
  const [enumType, variantType] = args ? children(args, "params").map(unparenthesized) : [];
  if (enumType?.type !== "TSTypeReference" || !variantType) return undefined;
  const literal = child(variantType, "literal");
  const enumName = child(enumType, "typeName");
  const held = enumName && typeReference(enumName, bound.namespaces);
  if (!held || typeof literal?.["value"] !== "string") return undefined;
  return { ...held, variant: literal["value"] };
}

/** What a chain called, and the type argument at its root. */
type Chain = {
  /** step name -> its first argument. `.implEquals(spec)` gives `implEquals` -> `spec`. */
  steps: Map<string, Node>;
  /** The root call's type arguments, or `undefined` when the chain has no root of ours. */
  typeArguments: Node | undefined;
  /** Which entry point the chain grew from, once it is known to have one. */
  of: Root | undefined;
  /** The step the chain grew from. A sealer is callable; a companion is not. */
  root: "sealer" | "companion" | undefined;
};

/**
 * Reads a builder chain from the outside in.
 * `Val.companion<Order>().implSeal(f).implEquals(spec).impl({…})` gives both `implEquals` and
 * `Order`.
 *
 * A call whose receiver is not itself a call is the root, which is what tells `Val.sealer<X>()`
 * apart from the steps chained onto it.
 */
function readChain(node: Node, bound: Bindings): Chain {
  const steps = new Map<string, Node>();
  let of: Root | undefined;
  let root: "sealer" | "companion" | undefined;

  const walk = (current: Node): Node | undefined => {
    if (current.type !== "CallExpression") return undefined;
    const callee = child(current, "callee");
    if (!callee || callee.type !== "MemberExpression") return undefined;
    const receiver = child(callee, "object");
    if (!receiver) return undefined;
    if (receiver.type !== "CallExpression") {
      of = fromRoot(callee, bound);
      if (!of) return undefined;
      const step = rootPath(callee)?.at(-1);
      root = step === "companion" ? "companion" : "sealer";
      return child(current, "typeArguments");
    }
    const property = child(callee, "property");
    const name = property && keyName(property, callee["computed"] === true);
    const [argument] = children(current, "arguments");
    if (name && argument) steps.set(name, argument);
    return walk(receiver);
  };

  const typeArguments = walk(node);
  return { steps, typeArguments, of, root };
}

/**
 * The name a type reference is written under, with the namespace it was reached through.
 *
 * `valof.Val<…>` in a type position is the alias walk's job; here the qualifier says the type
 * was declared in another module, which nothing else about the site records.
 */
export function typeReference(
  written: Node,
  namespaces: ReadonlyMap<string, string>,
): { node: Node; qualifier: string | undefined } | undefined {
  if (written.type === "Identifier") return { node: written, qualifier: undefined };
  if (written.type !== "TSQualifiedName") return undefined;
  const left = child(written, "left");
  const right = child(written, "right");
  if (!left || !right || left.type !== "Identifier" || right.type !== "Identifier")
    return undefined;
  const qualifier = left["name"] as string;
  return namespaces.has(qualifier) ? { node: right, qualifier } : undefined;
}

/** The chain as a companion site, or `undefined` when it names no type to key it by. */
export function companionSite(
  node: Node,
  file: string,
  where: Where,
  bound: Bindings,
  at: (offset: number) => Where,
): CompanionSite | undefined {
  const { steps, typeArguments, of, root } = readChain(node, bound);
  const first = unparenthesized(typeArguments ? children(typeArguments, "params")[0] : undefined);
  if (!first || first.type !== "TSTypeReference" || !of) return undefined;
  // A type argument taking type arguments of its own, `Val.sealer<VariantOf<Shape, "Circle">>()`,
  // names no declaration this walk knows. The type rejects that one, and reporting `VariantOf` as
  // the type the companion is for would name something the user never declared.
  if (child(first, "typeArguments")) return undefined;
  const written = child(first, "typeName");
  if (!written) return undefined;
  const named = typeReference(written, bound.namespaces);
  if (!named) return undefined;
  return {
    ...where,
    file,
    of,
    name: undefined,
    nameAt: where,
    typeName: named.node["name"] as string,
    typeRef: symbolRef(file, bound, named.node["name"] as string, named.qualifier),
    typeOffset: named.node["start"] as number,
    typeAt: at(named.node["start"] as number),
    qualifier: named.qualifier,
    spec: steps.get("implEquals"),
    // Set whenever the chain has a root of ours, which is the only way it has type arguments.
    root: root ?? "sealer",
    seals: steps.has("implSeal"),
  };
}
