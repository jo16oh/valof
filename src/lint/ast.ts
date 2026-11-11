import { Enum, Tag, Val, type Rec, type VariantOf } from "../index.ts";

/**
 * The ESTree nodes the linter reads, each with the fields it reads. Every other node is `Other`.
 *
 * `children` holds every child node in source order, the ones no field names included, so a walk
 * through it reaches the whole file.
 */
export type Node = Enum<
  "Node",
  {
    Program: { body: Rec<Node>[] };
    Identifier: { name: string };
    /** `value` is the string the literal spells, `null` for a literal of any other kind. */
    Literal: { value: string | null };
    MemberExpression: { object: Rec<Node>; property: Rec<Node>; computed: boolean };
    CallExpression: {
      callee: Rec<Node>;
      arguments: Rec<Node>[];
      typeArguments: Rec<Node> | null;
    };
    TSTypeParameterInstantiation: { params: Rec<Node>[] };
    TSTypeReference: { typeName: Rec<Node>; typeArguments: Rec<Node> | null };
    TSQualifiedName: { left: Rec<Node>; right: Rec<Node> };
    TSIntersectionType: { types: Rec<Node>[] };
    TSParenthesizedType: { typeAnnotation: Rec<Node> };
    ParenthesizedExpression: { expression: Rec<Node> };
    /** `generic` says whether the alias takes type parameters. */
    TSTypeAliasDeclaration: { id: Rec<Node>; typeAnnotation: Rec<Node>; generic: boolean };
    TSTypeLiteral: { members: Rec<Node>[] };
    TSPropertySignature: { key: Rec<Node>; computed: boolean };
    TSLiteralType: { literal: Rec<Node> };
    ExportNamedDeclaration: {
      declaration: Rec<Node> | null;
      source: Rec<Node> | null;
      specifiers: Rec<Node>[];
    };
    ExportSpecifier: { local: Rec<Node>; exported: Rec<Node> };
    ImportDeclaration: { source: Rec<Node>; specifiers: Rec<Node>[] };
    ImportSpecifier: { local: Rec<Node>; imported: Rec<Node> };
    ImportNamespaceSpecifier: { local: Rec<Node> };
    VariableDeclaration: { kind: string; declarations: Rec<Node>[] };
    VariableDeclarator: { id: Rec<Node>; init: Rec<Node> | null };
    ObjectPattern: { properties: Rec<Node>[] };
    ObjectExpression: { properties: Rec<Node>[] };
    Property: { key: Rec<Node>; value: Rec<Node>; computed: boolean };
    SpreadElement: { argument: Rec<Node> };
    ArrowFunctionExpression: { body: Rec<Node> };
    Other: {};
  },
  Tag<"type"> & { start: number; children: Rec<Node>[] }
>;
export const Node = Enum.companion<Node>().tag("type").build();

export type Identifier = VariantOf<Node, "Identifier">;

/** The type arguments a `<…>` holds, none when it is absent. */
export const typeParams = (args: Node | null): readonly Node[] =>
  args?.type === "TSTypeParameterInstantiation" ? args.params : [];

/** oxc-parser's tree as {@link Node}s, reaching each node's children through `visitorKeys`. */
export function fromOxc(
  program: import("oxc-parser").Program,
  visitorKeys: Readonly<Record<string, readonly string[]>>,
): Node {
  const converted = new Map<object, Node>();
  const convert = (raw: import("oxc-parser").Node): Node => {
    const done = converted.get(raw);
    if (done) return done;
    const children: Node[] = [];
    for (const key of visitorKeys[raw.type] ?? []) {
      const value: unknown = Reflect.get(raw, key);
      for (const one of Array.isArray(value) ? value : [value])
        if (isOxcNode(one)) children.push(convert(one));
    }
    const node = build(raw, raw.start, children, convert);
    converted.set(raw, node);
    return node;
  };
  return convert(program);
}

// `nocopy`: every payload below is a fresh object, and the nodes inside it are sealed already.
function build(
  raw: import("oxc-parser").Node,
  start: number,
  children: Node[],
  at: (raw: import("oxc-parser").Node) => Node,
): Node {
  const shared = { start, children };
  const maybe = (raw: import("oxc-parser").Node | null | undefined): Node | null =>
    raw ? at(raw) : null;
  switch (raw.type) {
    case "Program":
      return Node.Program.create.nocopy({ ...shared, body: raw.body.map(at) });
    case "Identifier":
      return Node.Identifier.create.nocopy({ ...shared, name: raw.name });
    case "Literal":
      return Node.Literal.create.nocopy({
        ...shared,
        value: typeof raw.value === "string" ? raw.value : null,
      });
    case "MemberExpression":
      return Node.MemberExpression.create.nocopy({
        ...shared,
        object: at(raw.object),
        property: at(raw.property),
        computed: raw.computed,
      });
    case "CallExpression":
      return Node.CallExpression.create.nocopy({
        ...shared,
        callee: at(raw.callee),
        arguments: raw.arguments.map(at),
        typeArguments: maybe(raw.typeArguments),
      });
    case "TSTypeParameterInstantiation":
      return Node.TSTypeParameterInstantiation.create.nocopy({
        ...shared,
        params: raw.params.map(at),
      });
    case "TSTypeReference":
      return Node.TSTypeReference.create.nocopy({
        ...shared,
        typeName: at(raw.typeName),
        typeArguments: maybe(raw.typeArguments),
      });
    case "TSQualifiedName":
      return Node.TSQualifiedName.create.nocopy({
        ...shared,
        left: at(raw.left),
        right: at(raw.right),
      });
    case "TSIntersectionType":
      return Node.TSIntersectionType.create.nocopy({ ...shared, types: raw.types.map(at) });
    case "TSParenthesizedType":
      return Node.TSParenthesizedType.create.nocopy({
        ...shared,
        typeAnnotation: at(raw.typeAnnotation),
      });
    case "ParenthesizedExpression":
      return Node.ParenthesizedExpression.create.nocopy({
        ...shared,
        expression: at(raw.expression),
      });
    case "TSTypeAliasDeclaration":
      return Node.TSTypeAliasDeclaration.create.nocopy({
        ...shared,
        id: at(raw.id),
        typeAnnotation: at(raw.typeAnnotation),
        generic: raw.typeParameters != null,
      });
    case "TSTypeLiteral":
      return Node.TSTypeLiteral.create.nocopy({ ...shared, members: raw.members.map(at) });
    case "TSPropertySignature":
      return Node.TSPropertySignature.create.nocopy({
        ...shared,
        key: at(raw.key),
        computed: raw.computed,
      });
    case "TSLiteralType":
      return Node.TSLiteralType.create.nocopy({ ...shared, literal: at(raw.literal) });
    case "ExportNamedDeclaration":
      return Node.ExportNamedDeclaration.create.nocopy({
        ...shared,
        declaration: maybe(raw.declaration),
        source: maybe(raw.source),
        specifiers: raw.specifiers.map(at),
      });
    case "ExportSpecifier":
      return Node.ExportSpecifier.create.nocopy({
        ...shared,
        local: at(raw.local),
        exported: at(raw.exported),
      });
    case "ImportDeclaration":
      return Node.ImportDeclaration.create.nocopy({
        ...shared,
        source: at(raw.source),
        specifiers: raw.specifiers.map(at),
      });
    case "ImportSpecifier":
      return Node.ImportSpecifier.create.nocopy({
        ...shared,
        local: at(raw.local),
        imported: at(raw.imported),
      });
    case "ImportNamespaceSpecifier":
      return Node.ImportNamespaceSpecifier.create.nocopy({ ...shared, local: at(raw.local) });
    case "VariableDeclaration":
      return Node.VariableDeclaration.create.nocopy({
        ...shared,
        kind: raw.kind,
        declarations: raw.declarations.map(at),
      });
    case "VariableDeclarator":
      return Node.VariableDeclarator.create.nocopy({
        ...shared,
        id: at(raw.id),
        init: maybe(raw.init),
      });
    case "ObjectPattern":
      return Node.ObjectPattern.create.nocopy({ ...shared, properties: raw.properties.map(at) });
    case "ObjectExpression":
      return Node.ObjectExpression.create.nocopy({ ...shared, properties: raw.properties.map(at) });
    case "Property":
      return Node.Property.create.nocopy({
        ...shared,
        key: at(raw.key),
        value: at(raw.value),
        computed: raw.computed,
      });
    case "SpreadElement":
      return Node.SpreadElement.create.nocopy({ ...shared, argument: at(raw.argument) });
    case "ArrowFunctionExpression":
      return Node.ArrowFunctionExpression.create.nocopy({ ...shared, body: at(raw.body) });
    default:
      return Node.Other.create.nocopy(shared);
  }
}

const isOxcNode = (value: unknown): value is import("oxc-parser").Node =>
  typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

/**
 * Removes syntax-only parentheses around a type or an expression, however many were written.
 * oxc-parser keeps them as nodes, ESLint's parsers drop them.
 */
export function unparenthesized(node: Node | null | undefined): Node | undefined {
  let current = node ?? undefined;
  while (current?.type === "TSParenthesizedType" || current?.type === "ParenthesizedExpression")
    current = current.type === "TSParenthesizedType" ? current.typeAnnotation : current.expression;
  return current;
}

/** The name a key node contributes, for `k: v`, `"k": v`, `k(){}` and shorthand alike. */
export function keyName(node: Node, computed: boolean): string | undefined {
  // `[expr]: v` names nothing statically; `["k"]: v` is a literal and does.
  if (node.type === "Identifier" && !computed) return node.name;
  if (node.type === "Literal") return node.value ?? undefined;
  return undefined;
}

/**
 * The dotted name a call chain is rooted at: `Val.companion<X>().impl` gives `Val.companion`, and
 * `valof.Val.companion<X>().implSeal(f)` gives `valof.Val.companion`. Type arguments and call
 * parentheses carry no name, so they drop out.
 */
export function rootPath(node: Node): string[] | undefined {
  if (node.type === "Identifier") return [node.name];
  if (node.type === "CallExpression") return rootPath(node.callee);
  if (node.type !== "MemberExpression") return undefined;
  const left = rootPath(node.object);
  const name = keyName(node.property, node.computed);
  return left && name ? [...left, name] : left;
}

/** Where something sits, 1-based on both axes, the way an editor and every linter count. */
export type Position = Val<"Position", { line: number; column: number }>;
export const Position = Val.companion<Position>().build();

/** Where each line of one file starts, so an offset finds its {@link Position}. */
export type Lines = Val<"Lines", { starts: number[] }>;
export const Lines = Val.companion<Lines>()
  .implAssoc(({ seal }) => ({
    /** Scans the source once for line breaks. */
    from: (source: string): Lines => {
      const starts = [0];
      for (let i = source.indexOf("\n"); i !== -1; i = source.indexOf("\n", i + 1))
        starts.push(i + 1);
      return seal({ starts });
    },
  }))
  .impl(() => ({
    /** The {@link Position} of a byte offset. */
    at: ({ starts }, offset: number): Position => {
      let low = 0;
      let high = starts.length - 1;
      while (low < high) {
        const mid = (low + high + 1) >> 1;
        if ((starts[mid] as number) <= offset) low = mid;
        else high = mid - 1;
      }
      return Position.seal({ line: low + 1, column: offset - (starts[low] as number) + 1 });
    },
  }))
  .build();
