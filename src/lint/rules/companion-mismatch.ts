import { Val } from "../../lib/index.ts";
import { Exports, type Scan } from "../scan/index.ts";
import { Kind, Finding, Rule } from "./rule.ts";

/**
 * A companion bound to a name other than the type it is for. `const Account =
 * Val.companion<User>()` compiles, and every call site then reads `Account.greet(user)`.
 */
export type CompanionMismatch = Val<"CompanionMismatch", { kind: Kind }, Rule>;
export const CompanionMismatch = Val.companion<CompanionMismatch>()
  .implCreate(() => ({
    kind: Kind.seal("companion-mismatch"),
    description: "a companion bound to a name other than the type it is for",
    warns: false,
  }))
  .implTrait(Rule, () => ({ run: findings }))
  .build();

/**
 * Reports every companion chain bound to a name other than its type argument, and every variant
 * bound to a name other than its own.
 *
 * The type and the companion share one name on purpose: `type User = Val<…>` and `const User =
 * Val.companion<User>()` are a declaration merge, so `User` is the type, the companion and the
 * namespace at once. Two names split that, and the reader has to know both to find either.
 *
 * Compared as written, so `import type { User as Account }` passes with `const Account =
 * Val.companion<Account>()`. The type belonging to another file is the split-companion
 * rule's finding, not this one's.
 *
 * The chain is where the name is required, not the `.impl` on it, so holding a builder in a
 * variable is reported: `const built = Val.companion<User>()` is already the companion for `User`
 * under a second name. Writing the chain as one `const User` is the fix.
 *
 * A variant carries the same requirement. `const { Circle } = Shape` and `const Circle =
 * Shape.Circle` keep the name the enum declared; `const Round = Shape.Circle` does not, and a
 * reader of `Round.create({ r: 2 })` cannot tell which enum declared it. Anything else taken off a
 * companion, `const x = config.value`, is no variant and is left alone.
 */
function findings({ kind }: CompanionMismatch, scans: readonly Scan[]): Finding[] {
  const exports = Exports.from(scans);
  /** Every enum whose variants the declaration settled, by the identity its companion shares. */
  const variants = new Map<string, ReadonlySet<string>>();
  for (const { enumAliases } of scans) {
    for (const { ref, variants: declared } of enumAliases) {
      if (declared) {
        variants.set(Exports.identify(exports, ref), new Set(declared));
      }
    }
  }

  const found: Finding[] = [];
  for (const { file, sites, companionBindings } of scans) {
    for (const { name, nameAt, typeName } of sites) {
      if (name === null || name === typeName) continue;
      found.push(
        Finding.seal({
          kind,
          file,
          at: nameAt,
          message: `${name} is the companion for ${typeName}, and should be named ${typeName}`,
        }),
      );
    }
    for (const { name, companion, companionRef, key, at } of companionBindings) {
      if (name === key) continue;
      // Keyed by the enum's declaration, so anything else taken off anything else misses here.
      if (variants.get(Exports.identify(exports, companionRef))?.has(key) !== true) continue;
      found.push(
        Finding.seal({
          kind,
          file,
          at,
          message: `${name} is ${companion}.${key} under another name; call ${companion}.${key}, or bind it to ${key}`,
        }),
      );
    }
  }
  return found;
}
