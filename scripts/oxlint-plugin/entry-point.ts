import type { Rule } from "./rule.ts";

/**
 * An entry point's `main` comes right after the imports, so the file opens with what it does, and
 * the call to it ends the file. Nothing imports an entry point, so it exports nothing.
 */
export const entryPoint: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Declare `main` first, call it last, and export nothing" },
    messages: {
      first: "Declare `main` right after the imports.",
      last: "End the file with the call to `main`.",
      export: "Move what an entry point exports to a module of its own.",
    },
  },
  create(context) {
    return {
      Program(program) {
        const body = program.body;
        const main = body.find(
          (statement) =>
            declaresMain(statement) ||
            (statement.type === "ExportNamedDeclaration" &&
              statement.declaration !== null &&
              declaresMain(statement.declaration)),
        );
        if (main === undefined) return;

        if (body.find((statement) => statement.type !== "ImportDeclaration") !== main) {
          context.report({ node: main, messageId: "first" });
        }
        const last = body.at(-1);
        if (last === undefined || !callsMain(last)) {
          context.report({ node: main, messageId: "last" });
        }
        for (const statement of body.filter(exports)) {
          context.report({ node: statement, messageId: "export" });
        }
      },
    };
  },
};

type Statement = Parameters<NonNullable<ReturnType<Rule["create"]>["Program"]>>[0]["body"][number];

function declaresMain(statement: Statement): boolean {
  return statement.type === "FunctionDeclaration" && statement.id?.name === "main";
}

function exports(statement: Statement): boolean {
  return (
    statement.type === "ExportNamedDeclaration" ||
    statement.type === "ExportDefaultDeclaration" ||
    statement.type === "ExportAllDeclaration" ||
    statement.type === "TSExportAssignment"
  );
}

// `main()` or `await main()`.
function callsMain(statement: Statement): boolean {
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
