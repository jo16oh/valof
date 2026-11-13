import type { Context, Rule } from "./rule.ts";

/**
 * A module's top-level declarations in the order AGENTS.md gives, after the imports and the
 * re-exports. A function is hoisted and a companion is not, so the order also keeps a constant from
 * reading a companion declared further down.
 */
export const declarationOrder: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Order a module's top-level declarations by kind" },
    messages: {
      order:
        "Move {{kind}} above {{after}}. The order: main, the exported constants, the other constants, the errors, the types, the exported Vals, the exported functions, the helper Vals, the helper functions, then the call to main.",
    },
  },
  create(context) {
    return {
      Program(program) {
        const companions = exportedCompanions(program.body, context);
        let latest = -1;
        for (const statement of program.body) {
          const kind = kindOf(statement, companions, context);
          if (kind === undefined) continue;

          if (kind < latest) {
            context.report({
              node: statement,
              messageId: "order",
              data: { kind: KINDS[kind]!, after: KINDS[latest]! },
            });
          }
          latest = Math.max(latest, kind);
        }
      },
    };
  },
};

const KINDS = [
  "main",
  "an exported constant",
  "a constant",
  "an error",
  "a type",
  "an exported Val",
  "an exported function",
  "a helper Val",
  "a helper function",
  "the call to main",
];

type Statement = Parameters<NonNullable<ReturnType<Rule["create"]>["Program"]>>[0]["body"][number];

// Each companion in the file, by name, and whether it is exported. Its type goes where it goes.
function exportedCompanions(body: readonly Statement[], context: Context): Map<string, boolean> {
  const companions = new Map<string, boolean>();
  for (const statement of body) {
    const name = companionName(statement, context);
    if (name !== undefined) {
      companions.set(name, statement.type === "ExportNamedDeclaration");
    }
  }
  return companions;
}

// The index into KINDS, or nothing for an import, a re-export, or anything the order leaves alone.
function kindOf(
  statement: Statement,
  companions: Map<string, boolean>,
  context: Context,
): number | undefined {
  const exported = statement.type === "ExportNamedDeclaration";
  const declaration = exported ? statement.declaration : statement;
  if (declaration === null) return undefined;

  switch (declaration.type) {
    case "FunctionDeclaration":
      if (declaration.id?.name === "main") return 0;
      return exported ? 6 : 8;
    case "VariableDeclaration": {
      const companion = companionName(statement, context);
      if (companion !== undefined) return exported ? 5 : 7;
      return exported ? 1 : 2;
    }
    case "ClassDeclaration":
      return 3;
    case "TSTypeAliasDeclaration":
    case "TSInterfaceDeclaration": {
      const companionExported = companions.get(declaration.id.name);
      if (companionExported === undefined) return 4;
      return companionExported ? 5 : 7;
    }
    case "ExpressionStatement":
    case "IfStatement":
    case "ExportDefaultDeclaration":
      return 9;
    default:
      return undefined;
  }
}

// The name a `const` binds a companion to: `const User = Val.companion<User>()…`.
function companionName(statement: Statement, context: Context): string | undefined {
  const declaration =
    statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
  if (declaration?.type !== "VariableDeclaration") return undefined;

  const [declarator] = declaration.declarations;
  if (declarator?.id.type !== "Identifier" || !declarator.init) return undefined;
  const text = context.sourceCode.getText(declarator.init);
  return /^(?:Val|Enum|Trait)\.companion</.test(text) ? declarator.id.name : undefined;
}
