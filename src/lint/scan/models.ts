import { Val, type VariantOf } from "../../index.ts";
import { annotationOf, typeParams, unparenthesized, type Node, type Position } from "../ast.ts";
import { Bindings } from "./bindings.ts";
import { stepOf } from "./chains.ts";

/** What a {@link Model} found, which decides its message and whether a setting must ask for it. */
export type Shape =
  | "data"
  | "primitive"
  | "interface"
  | "nested-object"
  | "class"
  | "constraint"
  | "extraction";

/** A data type declared outside Valof, or a shape in a place only a Valof type should hold. */
export type Model = Val<"Model", { at: Position; shape: Shape; name: string }>;
export const Model = Val.companion<Model>().build();

/** A use of a name in a type, outside every place a payload goes. */
export type TypeUse = Val<"TypeUse", { at: Position; name: string }>;
export const TypeUse = Val.companion<TypeUse>().build();

/** What one file says about modelling outside Valof. */
export type Models = Val<
  "Models",
  {
    models: Model[];
    /** Names declared `type X = Payload<…>`. */
    payloadAliases: string[];
    /** Type references outside a Valof type and outside a seal's or a create's function. */
    outside: TypeUse[];
  }
>;
export const Models = Val.companion<Models>().build();

/** The types whose arguments Valof checks. */
const VALOF = new Set(["Val", "Enum", "Trait", "Payload"]);

/** Built-in types that declare data. */
const DATA = new Set([
  "Record",
  "Array",
  "ReadonlyArray",
  "Pick",
  "Omit",
  "Partial",
  "Required",
  "Readonly",
]);

/** Built-in types that take a type out of a value. */
const EXTRACTION = new Set([
  "ReturnType",
  "Parameters",
  "Awaited",
  "InstanceType",
  "ConstructorParameters",
]);

/** The keyword types that, written alone, name a primitive. A literal type is one too. */
const PRIMITIVE = new Set([
  "TSStringKeyword",
  "TSNumberKeyword",
  "TSBooleanKeyword",
  "TSBigIntKeyword",
  "TSSymbolKeyword",
  "TSTemplateLiteralType",
]);

const nameOf = (node: Node, bound: Bindings): string | undefined =>
  node.type === "TSTypeReference" && node.typeName.type === "Identifier"
    ? Bindings.original(bound, node.typeName.name)
    : undefined;

/** The node itself, with parentheses and `readonly` unwrapped, which add no shape of their own. */
const bare = (node: Node | null | undefined): Node | undefined => {
  const inside = unparenthesized(node);
  return inside?.type === "TSTypeOperator" ? bare(inside.typeAnnotation) : inside;
};

/**
 * Reads one file for `model-only-in-valof`. It reads syntax alone. A name is matched to a Val by
 * spelling, the way the other rules match one. A `.d.ts` and the body of `declare global` /
 * `declare module` describe someone else's code, and are skipped.
 */
export function models(
  file: string,
  program: Node,
  bound: Bindings,
  position: (offset: number) => Position,
): Models {
  const found: Model[] = [];
  const payloadAliases: string[] = [];
  const outside: TypeUse[] = [];
  const done = (): Models => Models.seal({ models: found, payloadAliases, outside });
  if (/\.d\.[cm]?ts$/.test(file)) return done();
  const report = (shape: Shape, name: string, node: Node): void =>
    void found.push(Model.seal({ at: position(node.start), shape, name }));

  /** The first node under `node` that declares data, skipping every Valof type's arguments. */
  const data = (node: Node): Node | undefined => {
    const inside = unparenthesized(node);
    if (!inside) return undefined;
    if (
      inside.type === "TSTypeLiteral" ||
      inside.type === "TSMappedType" ||
      inside.type === "TSTupleType" ||
      inside.type === "TSArrayType"
    )
      return inside;
    const name = nameOf(inside, bound);
    if (name && VALOF.has(name)) return undefined;
    if (name && DATA.has(name)) return inside;
    for (const one of inside.children) {
      const hit = data(one);
      if (hit) return hit;
    }
    return undefined;
  };

  const extracts = (node: Node): boolean => {
    const inside = unparenthesized(node);
    if (!inside) return false;
    if (inside.type === "TSTypeQuery") return true;
    const name = nameOf(inside, bound);
    if (name && VALOF.has(name)) return false;
    if (name && EXTRACTION.has(name)) return true;
    return inside.children.some(extracts);
  };

  const primitive = (node: Node): boolean => {
    const inside = unparenthesized(node);
    if (!inside) return false;
    if (inside.type === "TSUnionType") return inside.types.every(primitive);
    if (inside.type === "TSLiteralType") return true;
    return inside.type === "Other" && PRIMITIVE.has(inside.nodeType);
  };

  /** An object below the top of a payload: `Val<"A", { total: { amount: number } }>`. */
  const nested = (payload: Node | null | undefined, alias: string): void => {
    const top = unparenthesized(payload);
    const literals = top?.type === "TSIntersectionType" ? top.types.map(unparenthesized) : [top];
    for (const literal of literals) {
      if (literal?.type !== "TSTypeLiteral") continue;
      for (const member of literal.members) {
        const type = bare(annotationOf(member));
        const element = type?.type === "TSArrayType" ? bare(type.elementType) : type;
        if (element?.type === "TSTypeLiteral" || element?.type === "TSMappedType")
          report("nested-object", alias, element);
      }
    }
  };

  const alias = (declaration: VariantOf<Node, "TSTypeAliasDeclaration">): void => {
    const { id, typeAnnotation: rhs } = declaration;
    if (id.type !== "Identifier") return;
    const { name } = id;
    const top = bare(rhs);
    const valof = top && nameOf(top, bound);
    const args = top?.type === "TSTypeReference" ? typeParams(top.typeArguments) : [];
    if (valof === "Payload") {
      payloadAliases.push(name);
      return;
    }
    if (valof === "Val") return nested(args[1], name);
    if (valof === "Enum") {
      const record = unparenthesized(args[1]);
      if (record?.type === "TSTypeLiteral")
        for (const variant of record.members) nested(annotationOf(variant), name);
      return;
    }
    if (valof && VALOF.has(valof)) return;
    if (primitive(rhs)) return report("primitive", name, id);
    if (extracts(rhs)) report("extraction", name, id);
    const hit = data(rhs);
    if (hit) report("data", name, hit === top ? id : hit);
  };

  const visit = (node: Node, allowed: boolean): void => {
    switch (node.type) {
      case "TSModuleDeclaration":
        return;
      case "TSTypeAliasDeclaration":
        alias(node);
        break;
      case "TSInterfaceDeclaration":
        if (node.id.type === "Identifier") report("interface", node.id.name, node.id);
        break;
      case "ClassDeclaration":
      case "ClassExpression":
        report("class", "", node);
        break;
      case "TSTypeParameter": {
        const hit = node.constraint && data(node.constraint);
        if (hit) report("constraint", "", hit);
        break;
      }
      case "TSTypeReference": {
        const name = nameOf(node, bound);
        // Inside a Valof type is where a payload type goes.
        if (name && VALOF.has(name)) return;
        const written = node.typeName;
        if (!allowed && written.type === "Identifier")
          outside.push(TypeUse.seal({ at: position(written.start), name: written.name }));
        break;
      }
      case "CallExpression": {
        const { callee } = node;
        const step = callee.type === "MemberExpression" ? stepOf(callee).name : null;
        if (step === "implSeal" || step === "implCreate") {
          // The function a seal or a create takes is where a payload type is written.
          for (const one of node.children) visit(one, node.arguments.includes(one) || allowed);
          return;
        }
        break;
      }
      default:
        break;
    }
    for (const one of node.children) visit(one, allowed);
  };
  visit(program, false);
  return done();
}
