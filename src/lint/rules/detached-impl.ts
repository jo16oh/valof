import type { Where } from "../ast.ts";
import { symbolIdentity, type CompanionSite, type Scan } from "../scan/index.ts";
import type { Rule } from "./rule.ts";

/** An `impl` step written on an exported companion rather than in the chain that declares it. */
export type DetachedImpl = Where & {
  kind: "detached-impl";
  file: string;
  /** The step, as written. */
  step: string;
  /** What it was written on, as written. */
  companion: string;
  message: string;
};

export const DetachedImpl: Rule<DetachedImpl> = {
  kind: "detached-impl",
  description: "an `impl` step written outside the chain that declares its companion",
  run: findings,
};

/**
 * Reports `impl`, `implSeal`, `implVariant`, `implTrait`, `implEquals`, `implCreate` and `fixed`
 * written on a companion instead of in its own chain.
 *
 * `.impl` leaves the chain open so the members can arrive in more than one call, which also lets
 * a consumer of the module grow a companion of its own from the one it imported. Nothing about
 * the value it makes is wrong; what it breaks is that a companion is declared once. Blocking the
 * step in the type was rejected (notes §15.4), so this rule is what keeps that an invariant, and
 * with it the way unused-member and companion-mismatch count.
 *
 * Only a step whose base resolves to a companion in the scanned files is reported. An `.impl` on
 * anything else, a method of the user's own by that name, resolves to no declaration and is left
 * alone.
 */
function findings(scans: readonly Scan[]): DetachedImpl[] {
  const identity = symbolIdentity(scans);
  const companions = new Map<string, CompanionSite>();
  for (const { sites } of scans)
    for (const site of sites)
      if (!companions.has(identity(site.typeRef))) companions.set(identity(site.typeRef), site);
  /** The variants each enum declared, where its declaration settled them. */
  const variants = new Map<string, ReadonlySet<string>>();
  for (const { enumAliases } of scans)
    for (const { ref, variants: declared } of enumAliases)
      if (declared) variants.set(identity(ref), new Set(declared));

  const found: DetachedImpl[] = [];
  for (const { file, detachedSteps } of scans)
    for (const { step, base, baseName, variant, line, column } of detachedSteps) {
      const of = identity(base);
      const site = companions.get(of);
      if (!site) continue;
      // A key off an enum companion is a step on that variant's frame, which is closed as well.
      // An enum whose variants the declaration did not settle silences this, as it does the rest.
      // A key off an enum companion is a step on that variant's frame, which is closed as well.
      // An enum whose variants the declaration did not settle silences this, as it does the rest.
      if (variant !== undefined && (site.of !== "Enum" || variants.get(of)?.has(variant) !== true))
        continue;
      const companion = variant === undefined ? baseName : `${baseName}.${variant}`;
      found.push({
        kind: "detached-impl",
        file,
        line,
        column,
        step,
        companion,
        message: `${companion}.${step} is written outside the chain that declares it; write the step there`,
      });
    }
  return found;
}
