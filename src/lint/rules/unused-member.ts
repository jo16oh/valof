import { Val } from "../../index.ts";
import { ImportMap, symbolIdentity, type Scan } from "../scan/index.ts";
import { Finding, Rule } from "./rule.ts";

/** A companion member that nothing in the scanned files reads. */
export type UnusedMember = Val<"UnusedMember", { kind: "unused-member" }, Rule>;
export const UnusedMember = Val.companion<UnusedMember>()
  .implCreate(() => ({
    kind: "unused-member",
    description: "members registered with `.impl`, `.implTrait` or `.implAssoc` that nothing reads",
    // A member nothing reads is dead weight, and the code around it works.
    warns: true,
  }))
  .implTrait(Rule, () => ({ run: findings }))
  .build();

/**
 * Reports a member registered with `.impl`, `.implTrait` or `.implAssoc` that nothing reads.
 *
 * A declaration is kept per site rather than per name, because two modules may each declare a
 * companion called `User`; reads stay keyed by name alone, so a read anywhere counts for both.
 * That is the safe direction: the reads side over-approximates and the declarations side does
 * not lose one.
 *
 * Resolution is by name, not by type. A read is followed across files through a plain import, a
 * renamed one, a namespace import and an `export { X as Y }` rename.
 *
 * An enum's variant is declared and read under a dotted name, `Shape.Circle`, which is what makes
 * `Shape.Circle.diameter` and a destructured `Circle.diameter` meet. That name does not pass
 * through the `export { X as Y }` walk below, so an enum companion renamed on the way out loses
 * its variants' reads and its members are reported although they are used.
 *
 * Two ways it is wrong, in opposite directions. A read that spells no name, `User[method]` or a
 * companion reached through a default export, is not seen, so the member is reported although it
 * is used. A spread whose value is not a local const object contributes no keys, so those members
 * are never reported however dead they are.
 */
function findings({ kind }: UnusedMember, scans: readonly Scan[]): Finding[] {
  const identity = symbolIdentity(scans);
  /** `export { User as Public }`: the name outside -> the name at the declaration. */
  const exportedAs = new Map<string, string>();
  for (const scan of scans)
    for (const [outside, inside] of Object.entries(scan.exportedAs)) {
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
    for (const [local, keys] of Object.entries(scan.reads)) {
      const name = ImportMap.nameOf(scan.imported, local);
      for (const key of Object.keys(keys)) note(name, key);
    }
    // Already named as the exporting module names them, so this file's aliases do not apply.
    for (const [name, keys] of Object.entries(scan.namespaceReads))
      for (const key of Object.keys(keys)) note(name, key);
  }

  const implementations = new Map<string, Scan["traitImplementations"][number]>();
  for (const scan of scans)
    for (const implementation of scan.traitImplementations)
      implementations.set(
        `${identity(implementation.val)}\0${identity(implementation.trait)}`,
        implementation,
      );

  // A dyn read dispatches through the Val's selected implementation.
  for (const scan of scans)
    for (const { val, trait, member } of scan.dynReads) {
      const implementation = implementations.get(`${identity(val)}\0${identity(trait)}`);
      const overridden = implementation?.overrides.some((one) => one.member === member) === true;
      note(overridden ? val.name : trait.name, member);
    }

  // A box that escaped is read off names the walk does not follow, so a key read anywhere may be
  // read off it. It holds the Val its first argument references, or any Val implementing the
  // trait when that references none.
  const anywhere = new Set<string>();
  for (const scan of scans)
    for (const keys of [...Object.values(scan.reads), ...Object.values(scan.namespaceReads)])
      for (const key of Object.keys(keys)) anywhere.add(key);
  for (const scan of scans)
    for (const { trait, val } of scan.escapedDyns) {
      const implementing = [...implementations.values()].filter(
        (one) => identity(one.trait) === identity(trait),
      );
      const named = implementing.filter((one) => identity(one.val) === identity(val));
      for (const implementation of named.length > 0 ? named : implementing)
        for (const key of anywhere) {
          const overridden = implementation.overrides.some((one) => one.member === key);
          note(overridden ? implementation.val.name : trait.name, key);
        }
    }

  // A Val reads a trait's default unless that Val supplied the same key to implTrait.  Unknown
  // object expressions are intentionally conservative: they might override any key, so they
  // keep every default alive rather than issuing a false positive.
  for (const scan of scans)
    for (const implementation of scan.traitImplementations) {
      const used = read.get(implementation.val.name);
      if (!used) continue;
      const traitReads = read.get(implementation.trait.name) ?? new Set<string>();
      for (const key of used)
        if (!implementation.overrides.some((override) => override.member === key))
          traitReads.add(key);
      read.set(implementation.trait.name, traitReads);
    }

  /** The variants each enum declared, where its declaration settled them. */
  const variants = new Map<string, ReadonlySet<string>>();
  for (const { enumAliases } of scans)
    for (const { ref, variants: declared } of enumAliases)
      if (declared) variants.set(identity(ref), new Set(declared));

  return scans.flatMap(({ file, members, sites }) => {
    /**
     * An enum's `.impl` rejects a member under a variant's name, so that one is not a member. A
     * trait override under that name is dropped with it.
     */
    const taken = new Map<string, ReadonlySet<string>>();
    for (const site of sites) {
      const declared = variants.get(identity(site.typeRef));
      if (site.name !== null && declared) taken.set(site.name, declared);
    }
    return members
      .filter(({ companion, member }) => !taken.get(companion)?.has(member))
      .filter(({ companion, member }) => !read.get(companion)?.has(member))
      .map(({ companion, member, at }) =>
        Finding.seal({
          kind,
          file,
          at,
          message: `${companion}.${member} is never read`,
        }),
      );
  });
}
