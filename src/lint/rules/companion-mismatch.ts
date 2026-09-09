import type { Where } from "../ast.ts";
import type { Scan } from "../scan/index.ts";
import type { Rule } from "./rule.ts";

/**
 * A companion bound to a name other than the type it is for. `const Account =
 * Val.sealer<User>()` compiles, and every call site then reads `Account.greet(user)`.
 */
export type CompanionMismatch = Where & {
  kind: "companion-mismatch";
  file: string;
  /** The name it was bound to, as written. */
  name: string;
  /** The type argument, as written. */
  typeName: string;
  message: string;
};

export const CompanionMismatch: Rule<CompanionMismatch> = {
  kind: "companion-mismatch",
  description: "a companion bound to a name other than the type it is for",
  run: findings,
};

/**
 * Reports every `Val.sealer<X>()` / `Val.companion<X>()` bound to a name other than `X`.
 *
 * The type and the companion share one name on purpose: `type User = Val<…>` and `const User =
 * Val.sealer<User>()` are a declaration merge, so `User` is the type, the constructor and the
 * namespace at once. Two names split that, and the reader has to know both to find either.
 *
 * Compared as written, so `import type { User as Account }` passes with `const Account =
 * Val.sealer<Account>()`. The type belonging to another file is the split-companion
 * rule's finding, not this one's.
 *
 * The chain is where the name is required, not the `.impl` on it, so holding a builder in a
 * variable is reported: `const seal = Val.sealer<User>()` is already the constructor for `User`
 * under a second name. Writing the chain as one `const User` is the fix.
 */
function findings(scans: readonly Scan[]): CompanionMismatch[] {
  const found: CompanionMismatch[] = [];
  for (const { file, sites } of scans) {
    for (const { name, nameAt, typeName } of sites) {
      if (name === undefined || name === typeName) continue;
      found.push({
        kind: "companion-mismatch",
        file,
        ...nameAt,
        name,
        typeName,
        message: `${name} is the companion for ${typeName}, and should be named ${typeName}`,
      });
    }
  }
  return found;
}
