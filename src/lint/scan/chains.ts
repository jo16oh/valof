import { child, children, keyName, rootPath, type Node } from "../ast.ts";
import { original, type Bindings } from "./bindings.ts";

/** A `Val.sealer<X>()` / `Val.companion<X>()` chain, whatever else it registered. */
export type CompanionSite = {
  file: string;
  line: number;
  /** The type argument, resolved to an alias after the walk. */
  typeName: string;
  typeOffset: number;
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

/** The chain as a companion site, or `undefined` when it names no type to key it by. */
export function companionSite(
  node: Node,
  file: string,
  line: number,
  bound: Bindings,
): CompanionSite | undefined {
  const { steps, typeArguments } = readChain(node, bound);
  const [first] = typeArguments ? children(typeArguments, "params") : [];
  if (!first || first.type !== "TSTypeReference") return undefined;
  const typeName = child(first, "typeName");
  if (!typeName || typeName.type !== "Identifier") return undefined;
  return {
    file,
    line,
    typeName: typeName["name"] as string,
    typeOffset: typeName["start"] as number,
    spec: steps.get("implEquals"),
  };
}
