import type { Context, Rule } from "./rule.ts";

/**
 * A module's top level holds no state: no `let` or `var`, no static field that can change, no
 * array, object, `Set` or `Map` the types let anyone change, and no instance of any other class
 * but `URL` or `RegExp`. State lives inside a function call, or in an instance of a class created where
 * it is used.
 */
export const noModuleState: Readonly<Rule> = {
  meta: {
    type: "problem",
    docs: { description: "Keep state out of a module's top level" },
    messages: {
      let: "Declare a module's top-level binding with `const`. Keep state in an instance of a class, created where it is used.",
      static:
        "Make the static field `readonly`, or make it an instance field. A static field lives as long as the module.",
      new: "Create this instance where it is used. A class holds state, so an instance at the top level is state the whole module shares.",
      readonly:
        "Make it readonly, so the types keep it from changing: an array or an object with `as const` or a readonly annotation, and a top-level `Set` or `Map` annotated `ReadonlySet` or `ReadonlyMap`. Keep a `Set` or `Map` out of an array or object.",
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
const VALUES: ReadonlySet<string> = new Set(["URL", "RegExp"]);

// How the type of each literal or collection starts when the type keeps it from changing.
const READONLY: Readonly<Record<string, RegExp>> = {
  ArrayExpression: /^(?:const$|readonly\s|Readonly(?:Array)?<)/,
  ObjectExpression: /^(?:const$|Readonly<)/,
  Set: /^ReadonlySet</,
  Map: /^ReadonlyMap</,
};

type Statement = Parameters<NonNullable<ReturnType<Rule["create"]>["Program"]>>[0]["body"][number];
type Declarator = Extract<Statement, { type: "VariableDeclaration" }>["declarations"][number];
type Node = NonNullable<Declarator["init"]>;
type Annotation = NonNullable<Declarator["id"]["typeAnnotation"]>;
type ClassMember = Extract<
  Statement,
  { type: "ClassDeclaration" | "ClassExpression" }
>["body"]["body"][number];

/**
 * Checks what a top-level constant, a static field or `export default` holds. A literal array or
 * object, a `Set` and a `Map` must be readonly, and nothing in the value may create state.
 */
function checkValue(value: Node, annotation: Annotation | null, context: Context): void {
  // The type the value is read as: the annotation, or else the outermost `as`.
  let type =
    annotation === null ? undefined : context.sourceCode.getText(annotation).replace(/^:\s*/, "");
  let inner = value;
  while (inner.type === "TSSatisfiesExpression" || inner.type === "TSAsExpression") {
    if (inner.type === "TSAsExpression") {
      type ??= context.sourceCode.getText(inner.typeAnnotation);
    }
    inner = inner.expression;
  }

  const kind =
    inner.type === "NewExpression" && inner.callee.type === "Identifier"
      ? inner.callee.name
      : inner.type;
  const pattern = Object.hasOwn(READONLY, kind) ? READONLY[kind] : undefined;
  if (pattern !== undefined && !pattern.test(type ?? "")) {
    context.report({ node: inner, messageId: "readonly" });
  }
  checkNew(value, pattern === undefined ? null : inner, context);
}

/** A static field can change unless it is `readonly`, and a `readonly` one may hold only what a top-level constant may. */
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

/**
 * Reports each `new` in `node` that makes state, leaving out function bodies, which run later.
 * `checked` is the `Set` or `Map` that {@link checkValue} has already checked.
 */
function checkNew(node: Node, checked: Node | null, context: Context): void {
  if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") return;
  // A class expression's static fields are checked as a class declaration's, and its other members
  // belong to each instance.
  if (node.type === "ClassExpression") {
    checkStatics(node.body.body, context);
    return;
  }

  if (node.type === "NewExpression" && node !== checked) {
    const name = node.callee.type === "Identifier" ? node.callee.name : "";
    if (name === "Set" || name === "Map") {
      context.report({ node, messageId: "readonly" });
    } else if (!VALUES.has(name)) {
      context.report({ node, messageId: "new" });
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (isNode(child)) {
        checkNew(child, checked, context);
      }
    }
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}
