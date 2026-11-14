import type { Rule } from "./rule.ts";

/**
 * A top-level function is a `function` declaration, and any function that is not a top-level
 * declaration is an arrow function. A method keeps the method syntax, and the rule skips a
 * generator, which has no arrow form.
 */
export const functionStyle: Readonly<Rule> = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Write a top-level function as a `function` declaration, and any other as an arrow function",
    },
    messages: {
      declaration:
        "Declare a top-level function as a `function` declaration, not as an arrow function or a function expression in a `const`.",
      arrow: "Write a function that is not a top-level declaration as an arrow function.",
      method: "Write a function in a class as a method, not as a field.",
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
      ArrowFunctionExpression(node) {
        if (node.parent.type === "PropertyDefinition") {
          context.report({ node, messageId: "method" });
        }
      },
      FunctionExpression(node) {
        if (node.generator) return;

        const parent = node.parent;
        // A method: `m() {}` or `get m() {}` in an object, or any method in a class.
        if (parent.type === "Property" && (parent.method || parent.kind !== "init")) return;
        if (parent.type === "MethodDefinition") return;
        if (parent.type === "PropertyDefinition") {
          context.report({ node, messageId: "method" });
          return;
        }
        // The `Program` visitor reports a function in a top-level `const` as `declaration`.
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
