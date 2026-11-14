import type { Context, Rule } from "./rule.ts";

/**
 * A module's top-level declarations in the order AGENTS.md gives, after the imports and the
 * re-exports. A function is hoisted and a companion is not, so a constant cannot be built from a
 * companion declared further down.
 */
export const declarationOrder: Readonly<Rule> = {
  meta: {
    type: "suggestion",
    docs: { description: "Order a module's top-level declarations by kind" },
    messages: {
      order:
        "Move {{kind}} above {{after}}. The order: `main`; the exported constants; the other constants; the errors; the exported types, Vals, Enums and Traits with their companions; the exported classes; the exported functions; the helper types, Vals, Enums and Traits with their companions; the helper classes; the helper functions; then the call to `main` and `export default`.",
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

const KINDS: readonly string[] = [
  "`main`",
  "an exported constant",
  "a constant",
  "an error",
  "an exported type, Val, Enum or Trait",
  "an exported class",
  "an exported function",
  "a helper type, Val, Enum or Trait",
  "a helper class",
  "a helper function",
  "the call to `main` or `export default`",
];

type Statement = Parameters<NonNullable<ReturnType<Rule["create"]>["Program"]>>[0]["body"][number];

// Each companion in the file, by name, and whether it is exported. A Val's type sorts with its
// companion.
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

// The index into KINDS, or nothing for an import, a re-export, or anything the order does not cover.
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
      return exported ? 6 : 9;
    case "VariableDeclaration": {
      const companion = companionName(statement, context);
      if (companion !== undefined) return exported ? 4 : 7;
      return exported ? 1 : 2;
    }
    case "ClassDeclaration":
      if (declaration.id?.name.includes("Error")) return 3;
      return exported ? 5 : 8;
    case "TSTypeAliasDeclaration":
    case "TSInterfaceDeclaration": {
      const companionExported = companions.get(declaration.id.name) ?? exported;
      return companionExported ? 4 : 7;
    }
    case "ExpressionStatement":
    case "ExportDefaultDeclaration":
      return 10;
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
