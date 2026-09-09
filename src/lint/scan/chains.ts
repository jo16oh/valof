import { child, children, keyName, rootPath, type Node, type Where } from "../ast.ts";
import { original, type Bindings } from "./bindings.ts";

/** A `Val.sealer<X>()` / `Val.companion<X>()` chain, whatever else it registered. */
export type CompanionSite = Where & {
  file: string;
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

/** Whether a chain grows from `Val.sealer` or `Val.companion`, however `Val` was bound. */
export function fromVal(node: Node, bound: Bindings): boolean {
  const path = rootPath(node);
  if (!path || path.length === 0) return false;
  const [first, second, third] = path as [string, string?, string?];
  if (path.length === 1) return bound.builders.has(first);
  // `valof.Val.sealer`: step past the namespace, which only says where the name came from.
  const qualified = bound.namespaces.has(first);
  const name = qualified ? second : original(bound, first);
  const step = qualified ? third : second;
  return name === "Val" && (step === "sealer" || step === "companion");
}

/**
 * A `Val.of(…)` call, which brands a payload with the default seal.
 *
 * `typeName` is absent where the call named no type and took one from its target. It sits at the
 * type argument when there is one, and at `of` when there is not.
 */
export type Lift = Where & { typeName: string | undefined; qualifier: string | undefined };

/** The lift at this call, or `undefined` when the call is not `Val.of<X>(…)`. */
export function valOf(
  node: Node,
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
  const [param] = args ? children(args, "params") : [];
  if (!param) {
    const property = child(callee, "property");
    if (!property) return undefined;
    return { ...at(property["start"] as number), typeName: undefined, qualifier: undefined };
  }
  // A type argument that is not a plain reference, `Val.of<{ … }>`, names no Val to key it by.
  if (param.type !== "TSTypeReference") return undefined;
  const written = child(param, "typeName");
  const named = written && typeReference(written, bound.namespaces);
  if (!named) return undefined;
  return {
    ...at(named.node["start"] as number),
    typeName: named.node["name"] as string,
    qualifier: named.qualifier,
  };
}

/** What a chain called, and the type argument at its root. */
type Chain = {
  /** step name -> its first argument. `.implEquals(spec)` gives `implEquals` -> `spec`. */
  steps: Map<string, Node>;
  /** The root call's type arguments, or `undefined` when the chain is not Val-rooted. */
  typeArguments: Node | undefined;
  /** The step the chain grew from, once it is known to be Val-rooted. */
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
  let root: "sealer" | "companion" | undefined;

  const walk = (current: Node): Node | undefined => {
    if (current.type !== "CallExpression") return undefined;
    const callee = child(current, "callee");
    if (!callee || callee.type !== "MemberExpression") return undefined;
    const receiver = child(callee, "object");
    if (!receiver) return undefined;
    if (receiver.type !== "CallExpression") {
      if (!fromVal(callee, bound)) return undefined;
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
  return { steps, typeArguments, root };
}

/**
 * The name a type reference is written under, with the namespace it was reached through.
 *
 * `valof.Val<…>` in a type position is the alias walk's job; here the qualifier says the type
 * was declared in another module, which nothing else about the site records.
 */
export function typeReference(
  written: Node,
  namespaces: ReadonlySet<string>,
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
  const { steps, typeArguments, root } = readChain(node, bound);
  const [first] = typeArguments ? children(typeArguments, "params") : [];
  if (!first || first.type !== "TSTypeReference") return undefined;
  const written = child(first, "typeName");
  if (!written) return undefined;
  const named = typeReference(written, bound.namespaces);
  if (!named) return undefined;
  return {
    ...where,
    file,
    name: undefined,
    nameAt: where,
    typeName: named.node["name"] as string,
    typeOffset: named.node["start"] as number,
    typeAt: at(named.node["start"] as number),
    qualifier: named.qualifier,
    spec: steps.get("implEquals"),
    // Set whenever the chain is Val-rooted, which is the only way it has type arguments.
    root: root ?? "sealer",
    seals: steps.has("implSeal"),
  };
}
