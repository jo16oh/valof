import type { Context, Rule } from "./rule.ts";

/**
 * A module's top level holds no state: no `let` or `var`, no instance of a class, which is a
 * container of state, and no collection the types let anyone change. State lives in a function's
 * call, or in an instance its caller makes.
 */
export const noModuleState: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Keep state out of a module's top level" },
    messages: {
      let: "Declare a module's top-level binding with `const`. Keep state in a class its caller creates.",
      new: "Create this instance where it is used. A class holds state, so an instance at the top level is state the whole module shares.",
      readonly:
        "Annotate the collection as `ReadonlySet` or `ReadonlyMap`, so the types keep it from changing.",
    },
  },
  create(context) {
    return {
      Program(program) {
        for (const statement of program.body) {
          const declaration =
            statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
          if (declaration?.type !== "VariableDeclaration") continue;

          if (declaration.kind !== "const") {
            context.report({ node: declaration, messageId: "let" });
            continue;
          }
          for (const declarator of declaration.declarations) {
            if (declarator.init === null) continue;

            const annotation = declarator.id.typeAnnotation;
            const readonly =
              annotation !== null &&
              annotation !== undefined &&
              /^:\s*Readonly(?:Set|Map)</.test(context.sourceCode.getText(annotation));
            check(declarator.init, readonly, context);
          }
        }
      },
    };
  },
};

// Classes that hold a value rather than state.
const VALUES: ReadonlySet<string> = new Set(["URL", "RegExp"]);

// Collections a `Readonly` annotation keeps from changing.
const COLLECTIONS: ReadonlySet<string> = new Set(["Set", "Map"]);

type Statement = Parameters<NonNullable<ReturnType<Rule["create"]>["Program"]>>[0]["body"][number];
type Declarator = Extract<Statement, { type: "VariableDeclaration" }>["declarations"][number];
type Node = NonNullable<Declarator["init"]>;

// Reports each `new` in `node` that makes state, leaving out function bodies, which run later.
function check(node: Node, annotated: boolean, context: Context): void {
  if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") return;

  if (node.type === "NewExpression") {
    const name = node.callee.type === "Identifier" ? node.callee.name : "";
    if (COLLECTIONS.has(name)) {
      if (!annotated) {
        context.report({ node, messageId: "readonly" });
      }
    } else if (!VALUES.has(name)) {
      context.report({ node, messageId: "new" });
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (isNode(child)) {
        check(child, false, context);
      }
    }
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}
