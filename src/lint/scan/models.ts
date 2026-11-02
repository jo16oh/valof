import { Val } from "../../index.ts";
import { child, children, isNode, unparenthesized, type Node, type Where } from "../ast.ts";
import { original, type Bindings } from "./bindings.ts";
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
export type Model = Val<"Model", Where & { shape: Shape; name: string }>;
export const Model = Val.companion<Model>().build();

/** A use of a name in a type, `wrapped` in `Payload<…>` or outside every place a payload goes. */
export type TypeUse = Val<"TypeUse", Where & { name: string; alias: string }>;
export const TypeUse = Val.companion<TypeUse>().build();

/** What one file says about modelling outside Valof. */
export type Models = {
  models: Model[];
  /** Names declared `type X = Payload<…>`. */
  payloadAliases: string[];
  /** `type X = Payload<Y>` with a bare `Y`, which is `PayloadOf<Y>` mistyped where `Y` is a Val. */
  payloadWraps: TypeUse[];
  /** Type references outside a Valof type and outside a seal's or a create's function. */
  outside: TypeUse[];
};

/** The types whose arguments are Valof's to check. */
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

/** The types that, written alone, name a primitive. */
const PRIMITIVE = new Set([
  "TSStringKeyword",
  "TSNumberKeyword",
  "TSBooleanKeyword",
  "TSBigIntKeyword",
  "TSSymbolKeyword",
  "TSLiteralType",
  "TSTemplateLiteralType",
]);

const nameOf = (node: Node, bound: Bindings): string | undefined => {
  const name = child(node, "typeName");
  return name?.type === "Identifier" ? original(bound, name["name"] as string) : undefined;
};

/** The node itself, past parentheses and `readonly`, which add no shape of their own. */
const bare = (node: Node | undefined): Node | undefined => {
  const inside = unparenthesized(node);
  return inside?.type === "TSTypeOperator" ? bare(child(inside, "typeAnnotation")) : inside;
};

/**
 * Reads one file for `model-only-in-valof`. Syntax alone: a name is matched to a Val by spelling,
 * the way the other rules match one. A `.d.ts` and the body of `declare global` / `declare module`
 * describe someone else's code, and are skipped.
 */
export function models(
  file: string,
  program: Node,
  bound: Bindings,
  at: (offset: number) => Where,
): Models {
  const found: Models = { models: [], payloadAliases: [], payloadWraps: [], outside: [] };
  if (/\.d\.[cm]?ts$/.test(file)) return found;
  const report = (shape: Shape, name: string, node: Node): void =>
    void found.models.push(Model.seal({ ...at(node["start"] as number), shape, name }));

  /** The first node under `node` that declares data, past every Valof type's arguments. */
  const data = (node: Node): Node | undefined => {
    const inside = unparenthesized(node);
    if (!inside) return undefined;
    if (["TSTypeLiteral", "TSMappedType", "TSTupleType", "TSArrayType"].includes(inside.type))
      return inside;
    if (inside.type === "TSTypeReference") {
      const name = nameOf(inside, bound);
      if (name && VALOF.has(name)) return undefined;
      if (name && DATA.has(name)) return inside;
    }
    for (const [key, value] of Object.entries(inside)) {
      if (key === "parent") continue;
      for (const one of Array.isArray(value) ? value : [value]) {
        const hit = isNode(one) ? data(one) : undefined;
        if (hit) return hit;
      }
    }
    return undefined;
  };

  const extracts = (node: Node): boolean => {
    const inside = unparenthesized(node);
    if (!inside) return false;
    if (inside.type === "TSTypeQuery") return true;
    if (inside.type === "TSTypeReference") {
      const name = nameOf(inside, bound);
      if (name && VALOF.has(name)) return false;
      if (name && EXTRACTION.has(name)) return true;
    }
    return Object.entries(inside).some(
      ([key, value]) =>
        key !== "parent" &&
        (Array.isArray(value) ? value : [value]).some((one) => isNode(one) && extracts(one)),
    );
  };

  const primitive = (node: Node): boolean => {
    const inside = unparenthesized(node);
    if (!inside) return false;
    if (inside.type === "TSUnionType") return children(inside, "types").every(primitive);
    return PRIMITIVE.has(inside.type);
  };

  /** An object below the top of a payload: `Val<"A", { total: { amount: number } }>`. */
  const nested = (payload: Node | undefined, alias: string): void => {
    const top = unparenthesized(payload);
    const literals =
      top?.type === "TSIntersectionType" ? children(top, "types").map(unparenthesized) : [top];
    for (const literal of literals) {
      if (literal?.type !== "TSTypeLiteral") continue;
      for (const member of children(literal, "members")) {
        const type = bare(child(child(member, "typeAnnotation") ?? member, "typeAnnotation"));
        const element = type?.type === "TSArrayType" ? bare(child(type, "elementType")) : type;
        if (element?.type === "TSTypeLiteral" || element?.type === "TSMappedType")
          report("nested-object", alias, element);
      }
    }
  };

  const alias = (declaration: Node): void => {
    const id = child(declaration, "id");
    const rhs = child(declaration, "typeAnnotation");
    if (id?.type !== "Identifier" || !rhs) return;
    const name = id["name"] as string;
    const top = bare(rhs);
    const valof = top?.type === "TSTypeReference" ? nameOf(top, bound) : undefined;
    const args = top ? children(child(top, "typeArguments") ?? top, "params") : [];
    if (valof === "Payload") {
      found.payloadAliases.push(name);
      const [wrapped] = args.map(unparenthesized);
      const wrappedName =
        wrapped?.type === "TSTypeReference" && !child(wrapped, "typeArguments")
          ? child(wrapped, "typeName")
          : undefined;
      if (wrappedName?.type === "Identifier")
        found.payloadWraps.push(
          TypeUse.seal({
            ...at(id["start"] as number),
            name: wrappedName["name"] as string,
            alias: name,
          }),
        );
      return;
    }
    if (valof === "Val") return nested(args[1], name);
    if (valof === "Enum") {
      const record = unparenthesized(args[1]);
      if (record?.type === "TSTypeLiteral")
        for (const variant of children(record, "members"))
          nested(child(child(variant, "typeAnnotation") ?? variant, "typeAnnotation"), name);
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
      case "TSInterfaceDeclaration": {
        const id = child(node, "id");
        if (id?.type === "Identifier") report("interface", id["name"] as string, id);
        break;
      }
      case "ClassDeclaration":
      case "ClassExpression":
        report("class", "", node);
        break;
      case "TSTypeParameter": {
        const constraint = child(node, "constraint");
        const hit = constraint && data(constraint);
        if (hit) report("constraint", "", hit);
        break;
      }
      case "TSTypeReference": {
        const name = nameOf(node, bound);
        // Inside a Valof type is where a payload type goes.
        if (name && VALOF.has(name)) return;
        const written = child(node, "typeName");
        if (!allowed && written?.type === "Identifier")
          found.outside.push(
            TypeUse.seal({
              ...at(written["start"] as number),
              name: written["name"] as string,
              alias: "",
            }),
          );
        break;
      }
      case "CallExpression": {
        const callee = child(node, "callee");
        const step = callee?.type === "MemberExpression" ? stepOf(callee)?.name : undefined;
        if (step === "implSeal" || step === "implCreate") {
          // The function a seal or a create takes is where a payload type is written.
          for (const [key, value] of Object.entries(node)) {
            if (key === "parent") continue;
            for (const one of Array.isArray(value) ? value : [value])
              if (isNode(one)) visit(one, key === "arguments" || allowed);
          }
          return;
        }
        break;
      }
      default:
        break;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "parent") continue;
      for (const one of Array.isArray(value) ? value : [value])
        if (isNode(one)) visit(one, allowed);
    }
  };
  visit(program, false);
  return found;
}
