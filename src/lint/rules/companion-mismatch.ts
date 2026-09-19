import type { Where } from "../ast.ts";
import { symbolIdentity, type Scan } from "../scan/index.ts";
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
  /** The type argument, as written, or the variant the name was taken from. */
  typeName: string;
  message: string;
};

export const CompanionMismatch: Rule<CompanionMismatch> = {
  kind: "companion-mismatch",
  description: "a companion bound to a name other than the type it is for",
  run: findings,
};

/**
 * Reports every companion chain bound to a name other than its type argument, and every variant
 * bound to a name other than its own.
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
 *
 * A variant carries the same requirement. `const { Circle } = Shape` and `const Circle =
 * Shape.Circle` keep the name the enum declared; `const Round = Shape.Circle` does not, and a
 * reader of `Round({ r: 2 })` cannot tell which enum declared it. Anything else taken off a
 * companion, `const x = config.value`, is no variant and is left alone.
 */
function findings(scans: readonly Scan[]): CompanionMismatch[] {
  const identity = symbolIdentity(scans);
  /** Every enum whose variants the declaration settled, by the identity its companion shares. */
  const variants = new Map<string, ReadonlySet<string>>();
  for (const { enumAliases } of scans)
    for (const { ref, variants: declared } of enumAliases)
      if (declared) variants.set(identity(ref), new Set(declared));

  const found: CompanionMismatch[] = [];
  for (const { file, sites, companionBindings } of scans) {
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
    for (const { name, companion, companionRef, key, line, column } of companionBindings) {
      if (name === key) continue;
      // Keyed by the enum's declaration, so anything else taken off anything else misses here.
      if (variants.get(identity(companionRef))?.has(key) !== true) continue;
      found.push({
        kind: "companion-mismatch",
        file,
        line,
        column,
        name,
        typeName: key,
        message: `${name} is ${companion}.${key} under another name; call ${companion}.${key}, or bind it to ${key}`,
      });
    }
  }
  return found;
}
