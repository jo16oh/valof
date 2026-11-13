import type { Rule } from "./rule.ts";

/**
 * An entry point's `main` comes right after the imports and the re-exports, so the file opens with
 * what it does, and the call to it ends the file.
 */
export const mainFirst: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Declare `main` first, and call it last" },
    messages: {
      first: "Declare `main` right after the imports and the re-exports.",
      last: "End the file with the call to `main`, guarded where other modules import the file.",
    },
  },
  create(context) {
    return {
      Program(program) {
        const body = program.body;
        const main = body.find(
          (statement) => statement.type === "FunctionDeclaration" && statement.id?.name === "main",
        );
        if (main === undefined) return;

        if (body.find((statement) => !imports(statement)) !== main) {
          context.report({ node: main, messageId: "first" });
        }
        const last = body.at(-1);
        if (last === undefined || !callsMain(last)) {
          context.report({ node: main, messageId: "last" });
        }
      },
    };
  },
};

type Statement = Parameters<NonNullable<ReturnType<Rule["create"]>["Program"]>>[0]["body"][number];

function imports(statement: Statement): boolean {
  return (
    statement.type === "ImportDeclaration" ||
    statement.type === "ExportAllDeclaration" ||
    (statement.type === "ExportNamedDeclaration" && statement.source !== null)
  );
}

// `main()`, `await main()`, or either alone inside an `if`.
function callsMain(statement: Statement): boolean {
  if (statement.type === "IfStatement") {
    const consequent = statement.consequent;
    return consequent.type === "BlockStatement"
      ? consequent.body.length === 1 && callsMain(consequent.body[0]!)
      : callsMain(consequent);
  }
  if (statement.type !== "ExpressionStatement") return false;

  const expression =
    statement.expression.type === "AwaitExpression"
      ? statement.expression.argument
      : statement.expression;
  return (
    expression.type === "CallExpression" &&
    expression.callee.type === "Identifier" &&
    expression.callee.name === "main"
  );
}
