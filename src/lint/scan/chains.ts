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

/** What a chain called, and the type argument at its root. */
type Chain = {
  /** step name -> its first argument. `.implEquals(spec)` gives `implEquals` -> `spec`. */
  steps: Map<string, Node>;
  /** The root call's type arguments, or `undefined` when the chain is not Val-rooted. */
  typeArguments: Node | undefined;
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

  const walk = (current: Node): Node | undefined => {
    if (current.type !== "CallExpression") return undefined;
    const callee = child(current, "callee");
    if (!callee || callee.type !== "MemberExpression") return undefined;
    const receiver = child(callee, "object");
    if (!receiver) return undefined;
    if (receiver.type !== "CallExpression") {
      return fromVal(callee, bound) ? child(current, "typeArguments") : undefined;
    }
    const property = child(callee, "property");
    const name = property && keyName(property, callee["computed"] === true);
    const [argument] = children(current, "arguments");
    if (name && argument) steps.set(name, argument);
    return walk(receiver);
  };

  return { steps, typeArguments: walk(node) };
}

/**
 * The name a type reference is written under, with the namespace it was reached through.
 *
 * `valof.Val<…>` in a type position is the alias walk's job; here the qualifier says the type
 * was declared in another module, which nothing else about the site records.
 */
function typeReference(
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
  const { steps, typeArguments } = readChain(node, bound);
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
  };
}
