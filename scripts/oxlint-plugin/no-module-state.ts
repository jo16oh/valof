import type { Context, Rule } from "./rule.ts";

/**
 * A module's top level holds no state: no `let` or `var`, no static field that can change, no
 * instance of a class, which is a container of state, and no array or object the types let anyone
 * change. State lives inside a function call, or in an instance the function's caller creates.
 */
export const noModuleState: Readonly<Rule> = {
  meta: {
    type: "problem",
    docs: { description: "Keep state out of a module's top level" },
    messages: {
      let: "Declare a module's top-level binding with `const`. Keep state in an instance of a class, created where it is used.",
      static:
        "Make the static field `readonly`, or move it to an instance. A static field lives as long as the module.",
      new: "Create this instance where it is used. A class holds state, so an instance at the top level is state the whole module shares. For a set or a map, use a readonly array or object.",
      readonly:
        "Make the array or object readonly, with `as const` or a `readonly` annotation, so the types keep it from changing.",
    },
  },
  create(context) {
    return {
      Program(program) {
        for (const statement of program.body) {
          const declaration =
            statement.type === "ExportNamedDeclaration" ||
            statement.type === "ExportDefaultDeclaration"
              ? statement.declaration
              : statement;
          if (declaration === null) continue;

          if (declaration.type === "ClassDeclaration") {
            checkStatics(declaration.body.body, context);
            continue;
          }
          if (statement.type === "ExportDefaultDeclaration" && isNode(declaration)) {
            checkValue(declaration, null, context);
            continue;
          }
          if (declaration.type !== "VariableDeclaration") continue;

          if (declaration.kind !== "const") {
            context.report({ node: declaration, messageId: "let" });
            continue;
          }
          for (const declarator of declaration.declarations) {
            if (declarator.init === null) continue;

            checkValue(declarator.init, declarator.id.typeAnnotation ?? null, context);
          }
        }
      },
    };
  },
};

// Classes that hold a value rather than state.
const VALUES: readonly string[] = ["URL", "RegExp"];

type Statement = Parameters<NonNullable<ReturnType<Rule["create"]>["Program"]>>[0]["body"][number];
type Declarator = Extract<Statement, { type: "VariableDeclaration" }>["declarations"][number];
type Node = NonNullable<Declarator["init"]>;
type Annotation = NonNullable<Declarator["id"]["typeAnnotation"]>;
type ClassMember = Extract<
  Statement,
  { type: "ClassDeclaration" | "ClassExpression" }
>["body"]["body"][number];

// What a top-level constant, or a static field, holds: a literal array or object is readonly, and
// nothing in it creates an instance.
function checkValue(value: Node, annotation: Annotation | null, context: Context): void {
  checkNew(value, context);

  const typed = value.type === "TSSatisfiesExpression" ? value.expression : value;
  const literal = typed.type === "TSAsExpression" ? typed.expression : typed;
  if (literal.type !== "ArrayExpression" && literal.type !== "ObjectExpression") return;

  const type =
    typed.type === "TSAsExpression"
      ? context.sourceCode.getText(typed.typeAnnotation)
      : annotation === null
        ? ""
        : context.sourceCode.getText(annotation);
  if (!/^const$|\breadonly\b|\bReadonly(?:Array)?</.test(type)) {
    context.report({ node: literal, messageId: "readonly" });
  }
}

// A static field can change unless it is `readonly`.
function checkStatics(members: readonly ClassMember[], context: Context): void {
  for (const member of members) {
    if (member.type !== "PropertyDefinition" || !member.static) continue;

    if (!member.readonly) {
      context.report({ node: member, messageId: "static" });
    } else if (member.value !== null) {
      checkValue(member.value, member.typeAnnotation ?? null, context);
    }
  }
}

// Reports each `new` in `node` that makes state, leaving out function bodies, which run later.
function checkNew(node: Node, context: Context): void {
  if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") return;

  if (node.type === "NewExpression") {
    const name = node.callee.type === "Identifier" ? node.callee.name : "";
    if (!VALUES.includes(name)) {
      context.report({ node, messageId: "new" });
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (isNode(child)) {
        checkNew(child, context);
      }
    }
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}
