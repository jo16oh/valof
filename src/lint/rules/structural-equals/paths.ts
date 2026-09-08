import { child as at, children, keyName, type Node } from "../../ast.ts";

// The two walks meet on a string. A payload position and a spec entry are compared as the same
// path, `total` or `shipping.zip` or `charges[]`, so both sides spell `[]` and `.` here rather
// than agreeing by convention across two modules.

/**
 * Type constructors whose shape a spec can mirror, so the walk descends into them.
 *
 * Anything else is opaque, which is what keeps `PayloadOf<Money>` out. A payload written at a
 * field position loses the brand along with the child's seal and its equality, so the fix is to
 * hold the Val there (see notes §4.3), not to bolt the child's comparison onto a payload. The
 * `PayloadOf` rule reports that; firing here as well would send the reader the other way.
 */
const ARRAY_LIKE = new Set(["Array", "ReadonlyArray"]);

/** A candidate child position, before anything is known about what the name refers to. */
type Candidate = { path: string; offset: number; name: string };

/**
 * Every position in a payload type that a spec could address, paired with the name written
 * there.
 *
 * Positions come out as spec paths, so the two walks meet on a string. `readonly Money[]` and
 * `ReadonlyArray<Money>` both give `[]`, the form `EqElements` takes for an array.
 */
export function payloadPositions(payload: Node): Candidate[] {
  const found: Candidate[] = [];

  const walk = (node: Node, path: string): void => {
    switch (node.type) {
      case "TSTypeLiteral":
        for (const member of children(node, "members")) {
          if (member.type !== "TSPropertySignature") continue;
          const key = at(member, "key");
          const annotation = at(member, "typeAnnotation");
          const inner = annotation && at(annotation, "typeAnnotation");
          if (!key || !inner) continue;
          const name = keyName(key, member["computed"] === true);
          if (name) walk(inner, path ? `${path}.${name}` : name);
        }
        return;
      case "TSInterfaceBody":
        for (const member of children(node, "body")) walk(member, path);
        return;
      case "TSArrayType": {
        const element = at(node, "elementType");
        if (element) walk(element, `${path}[]`);
        return;
      }
      case "TSTupleType": {
        const elements = children(node, "elementTypes");
        elements.forEach((element, index) => walk(element, `${path}[${index}]`));
        return;
      }
      case "TSOptionalType":
      case "TSRestType":
      case "TSNamedTupleMember":
      case "TSParenthesizedType": {
        const inner = at(node, "elementType") ?? at(node, "typeAnnotation");
        if (inner) walk(inner, path);
        return;
      }
      case "TSTypeOperator": {
        // `readonly T[]` wraps the array; the position is the same either way.
        const inner = at(node, "typeAnnotation");
        if (inner) walk(inner, path);
        return;
      }
      case "TSUnionType":
      case "TSIntersectionType":
        for (const member of children(node, "types")) walk(member, path);
        return;
      case "TSTypeReference": {
        const typeName = at(node, "typeName");
        if (!typeName || typeName.type !== "Identifier") return;
        const name = typeName["name"] as string;
        const args = at(node, "typeArguments");
        if (ARRAY_LIKE.has(name) && args) {
          const [element] = children(args, "params");
          if (element) walk(element, `${path}[]`);
          return;
        }
        // A leaf. Whether it names a Val is the resolver's question, not the walk's.
        found.push({ path, offset: typeName["start"] as number, name });
        return;
      }
      default:
        return;
    }
  };

  walk(payload, "");
  return found;
}

/**
 * The paths an `.implEquals` argument speaks for.
 *
 * Any entry counts, whatever its shape. `total: Money` delegates, `updatedAt: () => true` drops
 * the key from equality, and both are the author saying they looked. Only silence is a finding.
 *
 * A path is covered by any prefix of itself, so `shipping: someFn` covers `shipping.zip`: the
 * function owns everything below it.
 */
export function specPaths(spec: Node): Set<string> {
  const covered = new Set<string>();

  const walk = (node: Node, path: string): void => {
    covered.add(path);
    if (node.type === "ObjectExpression") {
      for (const property of children(node, "properties")) {
        if (property.type !== "Property") continue;
        const key = at(property, "key");
        const value = at(property, "value");
        if (!key || !value) continue;
        const name = keyName(key, property["computed"] === true);
        if (name) walk(value, path ? `${path}.${name}` : name);
      }
      return;
    }
    if (node.type === "ArrayExpression") {
      const elements = children(node, "elements");
      // One element compares every position, so it covers `[]`; more compare by index.
      if (elements.length === 1) walk(elements[0] as Node, `${path}[]`);
      else elements.forEach((element, index) => walk(element, `${path}[${index}]`));
      // A tuple spec also answers for the array form, and vice versa: which one the payload
      // uses is the payload's business.
      covered.add(`${path}[]`);
    }
  };

  walk(spec, "");
  return covered;
}

/** Whether the spec is a whole hand-written comparison rather than a per-child description. */
export const isOverride = (spec: Node): boolean =>
  spec.type === "ArrowFunctionExpression" || spec.type === "FunctionExpression";

/** `shipping.zip` -> `shipping.zip`, `shipping`. An entry above a path speaks for it. */
export function prefixes(path: string): string[] {
  const found = [path];
  for (let index = path.length - 1; index > 0; index--) {
    const character = path[index];
    if (character === "." || character === "[") found.push(path.slice(0, index));
  }
  return found;
}
