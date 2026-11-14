import type { Rule } from "./rule.ts";

/**
 * A top-level function is a `function` declaration, and a function anywhere else is an arrow
 * function. A method keeps its own syntax, and a generator, which has no arrow form, is left alone.
 */
export const functionStyle: Readonly<Rule> = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Declare a top-level function with `function`, and any other as an arrow",
    },
    messages: {
      declaration:
        "Declare a top-level function as a `function` declaration, not as an arrow function or a function expression in a `const`.",
      arrow: "Write a function below the top level as an arrow function.",
    },
  },
  create(context) {
    return {
      Program(program) {
        for (const statement of program.body) {
          const declaration =
            statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
          if (declaration?.type !== "VariableDeclaration" || declaration.kind !== "const") {
            continue;
          }
          for (const declarator of declaration.declarations) {
            const kind = declarator.init?.type;
            if (kind === "ArrowFunctionExpression" || kind === "FunctionExpression") {
              context.report({ node: declarator, messageId: "declaration" });
            }
          }
        }
      },
      FunctionDeclaration(node) {
        if (node.generator) return;

        const parent = node.parent;
        const exported =
          parent.type === "ExportNamedDeclaration" || parent.type === "ExportDefaultDeclaration";
        if (parent.type === "Program" || (exported && parent.parent.type === "Program")) return;
        context.report({ node, messageId: "arrow" });
      },
      FunctionExpression(node) {
        if (node.generator) return;

        const parent = node.parent;
        // A method: `m() {}`, `get m() {}`, or a class's.
        if (parent.type === "Property" && (parent.method || parent.kind !== "init")) return;
        if (parent.type === "MethodDefinition" || parent.type === "TSAbstractMethodDefinition")
          return;
        // A top-level `const` reports it as `declaration`.
        if (parent.type === "VariableDeclarator") {
          const holder = parent.parent.parent;
          if (holder === null || holder.type === "Program" || holder.parent.type === "Program")
            return;
        }
        context.report({ node, messageId: "arrow" });
      },
    };
  },
};
