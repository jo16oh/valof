import { basename } from "node:path";

import type { Rule } from "./rule.ts";

/**
 * An entry point is `main.ts`, and its `main` comes right after the imports, so the file opens with
 * what it does, and the call to it ends the file. Nothing imports an entry point, so it exports
 * nothing. What other modules import is `index.ts`, as `main.rs` and `lib.rs` are in a Rust crate.
 */
export const entryPoint: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Run `main.ts` from `main`, declared first and called last, and export nothing",
    },
    messages: {
      name: "Move `main` to an entry point of its own, `main.ts`.",
      missing: "Run `main.ts` from a function `main`.",
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
        const named = basename(context.filename) === "main.ts";
        if (main === undefined) {
          if (named) {
            context.report({ node: program, messageId: "missing" });
          }
          return;
        }
        if (!named) {
          context.report({ node: main, messageId: "name" });
        }

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
