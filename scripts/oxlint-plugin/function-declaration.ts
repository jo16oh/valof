import type { Rule } from "./rule.ts";

/** A top-level function is a `function` declaration, not an arrow function or a function expression in a `const`. */
export const functionDeclaration: Readonly<Rule> = {
  meta: {
    type: "suggestion",
    docs: { description: "Declare a top-level function with `function`" },
    messages: {
      function:
        "Declare a top-level function as a `function` declaration, not as an arrow function or a function expression in a `const`.",
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
              context.report({ node: declarator, messageId: "function" });
            }
          }
        }
      },
    };
  },
};
