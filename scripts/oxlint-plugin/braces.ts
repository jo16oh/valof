import type { Body, Rule } from "./rule.ts";

/**
 * Braces on every `if`, `else` and loop body, except an `if` with no `else` whose body leaves
 * (`return`, `throw`, `continue` or `break`): a guard clause.
 *
 * `curly` has no option that tells a guard clause from the rest.
 */
export const braces: Rule = {
  meta: {
    type: "layout",
    docs: { description: "Require braces, except on a guard clause" },
    fixable: "code",
    messages: {
      braces:
        "Add braces. Only an `if` that returns, throws, continues or breaks, with no `else`, goes without.",
    },
  },
  create(context) {
    const check = (body: (Body & { type: string }) | null): void => {
      if (body === null || body.type === "BlockStatement") return;

      context.report({
        node: body,
        messageId: "braces",
        fix: (fixer) =>
          fixer.replaceText(
            body,
            body.type === "EmptyStatement" ? " {}" : `{\n${context.sourceCode.getText(body)}\n}`,
          ),
      });
    };

    return {
      IfStatement(node) {
        if (!GUARDS.has(node.consequent.type) || node.alternate !== null) {
          check(node.consequent);
        }
        if (node.alternate?.type !== "IfStatement") {
          check(node.alternate);
        }
      },
      ForStatement: (node) => check(node.body),
      ForInStatement: (node) => check(node.body),
      ForOfStatement: (node) => check(node.body),
      WhileStatement: (node) => check(node.body),
      DoWhileStatement: (node) => check(node.body),
    };
  },
};

const GUARDS = new Set([
  "ReturnStatement",
  "ThrowStatement",
  "ContinueStatement",
  "BreakStatement",
]);
