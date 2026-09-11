import type { Where } from "../ast.ts";
import { original } from "../scan/index.ts";
import type { Scan } from "../scan/index.ts";
import type { Rule } from "./rule.ts";

/** A companion member that nothing in the scanned files reads. */
export type UnusedMember = Where & {
  kind: "unused-member";
  file: string;
  /** The companion's declared name, as written at its declaration site. */
  companion: string;
  /** The member's key. */
  member: string;
  message: string;
};

export const UnusedMember: Rule<UnusedMember> = {
  kind: "unused-member",
  description: "members registered with `.impl` or `.implTrait` that nothing reads",
  // A member nothing reads is dead weight, and the code around it works.
  warns: true,
  run: findings,
};

/**
 * Reports a member registered with `.impl` or `.implTrait` that nothing reads.
 *
 * A declaration is kept per site rather than per name, because two modules may each declare a
 * companion called `User`; reads stay keyed by name alone, so a read anywhere counts for both.
 * That is the safe direction: the reads side over-approximates and the declarations side does
 * not lose one.
 *
 * Resolution is by name, not by type. A read is followed across files through a plain import, a
 * renamed one, a namespace import and an `export { X as Y }` rename.
 *
 * Two ways it is wrong, in opposite directions. A read that spells no name, `User[method]` or a
 * companion reached through a default export, is not seen, so the member is reported although it
 * is used. And a spread into `.impl({ ...base })` contributes no keys at all, so those members
 * are never reported however dead they are.
 */
function findings(scans: readonly Scan[]): UnusedMember[] {
  /** `export { User as Public }`: the name outside -> the name at the declaration. */
  const exportedAs = new Map<string, string>();
  for (const scan of scans)
    for (const [outside, inside] of scan.exportedAs) {
      exportedAs.set(outside, inside);
    }

  /** Walks `export { A as B }` back to the declared name, tolerating a chain of them. */
  const declaredName = (name: string): string => {
    const seen = new Set<string>();
    let current = name;
    while (!seen.has(current)) {
      seen.add(current);
      const inside = exportedAs.get(current);
      if (inside === undefined || inside === current) break;
      current = inside;
    }
    return current;
  };

  /**
   * Every read, as the name it was declared under. Resolved after every file is scanned, because
   * the module that renames a companion on the way out may be scanned after the one reading it.
   */
  const read = new Map<string, Set<string>>();
  const note = (name: string, key: string): void => {
    const under = declaredName(name);
    let keys = read.get(under);
    if (!keys) read.set(under, (keys = new Set()));
    keys.add(key);
  };
  for (const scan of scans) {
    for (const [local, keys] of scan.reads) {
      const name = original(scan.bound, local);
      for (const key of keys) note(name, key);
    }
    // Already named as the exporting module names them, so this file's aliases do not apply.
    for (const [name, keys] of scan.namespaceReads) for (const key of keys) note(name, key);
  }

  const implementations = new Map<string, Scan["traitImplementations"][number]>();
  for (const scan of scans)
    for (const implementation of scan.traitImplementations)
      implementations.set(`${implementation.val}\0${implementation.trait}`, implementation);

  // A dyn read dispatches through the Val's selected implementation.
  for (const scan of scans)
    for (const { val, trait, member } of scan.dynReads) {
      const implementation = implementations.get(`${val}\0${trait}`);
      const overridden = implementation?.overrides.some((one) => one.member === member) === true;
      note(overridden ? val : trait, member);
    }

  // A Val reads a trait's default unless that Val supplied the same key to implTrait.  Unknown
  // object expressions are intentionally conservative: they might override any key, so they
  // keep every default alive rather than issuing a false positive.
  for (const scan of scans)
    for (const implementation of scan.traitImplementations) {
      const used = read.get(implementation.val);
      if (!used) continue;
      const traitReads = read.get(implementation.trait) ?? new Set<string>();
      for (const key of used)
        if (!implementation.overrides.some((override) => override.member === key))
          traitReads.add(key);
      read.set(implementation.trait, traitReads);
    }

  return scans.flatMap(({ file, members }) =>
    members
      .filter(({ companion, member }) => !read.get(companion)?.has(member))
      .map(({ companion, member, line, column }) => ({
        kind: "unused-member" as const,
        file,
        line,
        column,
        companion,
        member,
        message: `${companion}.${member} is never read`,
      })),
  );
}
