/** The ESTree subset the linter walks. Narrow by `type` before reading anything past `type`. */
export type Node = { type: string; [key: string]: unknown };

export const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as Node).type === "string";

/** Reads a child that must be a node, or `undefined` when it is absent or something else. */
export const child = (node: Node, key: string): Node | undefined => {
  const value = node[key];
  return isNode(value) ? value : undefined;
};

/** Reads a child list, dropping anything that is not a node. */
export const children = (node: Node, key: string): Node[] => {
  const value = node[key];
  return Array.isArray(value) ? value.filter(isNode) : [];
};

/** Removes syntax-only parentheses around a type, however many were written. */
export function unparenthesized(node: Node | undefined): Node | undefined {
  let current = node;
  while (current?.type === "TSParenthesizedType") current = child(current, "typeAnnotation");
  return current;
}

/** The name a key node contributes, for `k: v`, `"k": v`, `k(){}` and shorthand alike. */
export function keyName(node: Node, computed: boolean): string | undefined {
  // `[expr]: v` names nothing statically; `["k"]: v` is a literal and does.
  if (node.type === "Identifier" && !computed) return node["name"] as string;
  if (node.type === "Literal" && typeof node["value"] === "string") return node["value"];
  return undefined;
}

/**
 * The dotted name a call chain is rooted at: `Val.sealer<X>().impl` gives `Val.sealer`, and
 * `valof.Val.companion<X>().implSeal(f)` gives `valof.Val.companion`. Type arguments and call
 * parentheses carry no name, so they drop out.
 */
export function rootPath(node: Node): string[] | undefined {
  if (node.type === "Identifier") return [node["name"] as string];
  if (node.type === "CallExpression") {
    const callee = child(node, "callee");
    return callee ? rootPath(callee) : undefined;
  }
  if (node.type !== "MemberExpression") return undefined;
  const object = child(node, "object");
  const property = child(node, "property");
  if (!object || !property) return undefined;
  const left = rootPath(object);
  const name = keyName(property, node["computed"] === true);
  return left && name ? [...left, name] : left;
}

/** Where something sits, 1-based on both axes, the way an editor and every linter count. */
export type Where = { line: number; column: number };

/** Byte offset -> {@link Where}, from a prefix scan done once per file. */
export function positions(source: string): (offset: number) => Where {
  const starts = [0];
  for (let i = source.indexOf("\n"); i !== -1; i = source.indexOf("\n", i + 1)) starts.push(i + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((starts[mid] as number) <= offset) low = mid;
      else high = mid - 1;
    }
    return { line: low + 1, column: offset - (starts[low] as number) + 1 };
  };
}
