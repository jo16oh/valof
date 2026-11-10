import { IncompleteDisable } from "./incomplete-disable.ts";
import { BypassedCompanion } from "./bypassed-companion.ts";
import { UnnecessaryAlias } from "./unnecessary-alias.ts";
import { BrandMismatch } from "./brand-mismatch.ts";
import { CompanionMismatch } from "./companion-mismatch.ts";
import { DuplicateBrand } from "./duplicate-brand.ts";
import { KindSet, Rule, type Kind } from "./rule.ts";
import { SplitCompanion } from "./split-companion.ts";
import { UnnamedOf } from "./unnamed-of.ts";
import { UnusedDisable } from "./unused-disable.ts";
import { UnusedMember } from "./unused-member.ts";
import { UnimplementedTrait } from "./unimplemented-trait.ts";

/**
 * Every rule, in the order they run and `--help` lists them.
 *
 * The only enumeration. A rule carries its own kind, so listing it here says nothing twice, and
 * {@link kinds} is read back off this array rather than written again.
 */
export const RULES = [
  Rule.dyn(UnusedMember, UnusedMember.create()),
  Rule.dyn(DuplicateBrand, DuplicateBrand.create()),
  Rule.dyn(BrandMismatch, BrandMismatch.create()),
  Rule.dyn(UnnecessaryAlias, UnnecessaryAlias.create()),
  Rule.dyn(UnimplementedTrait, UnimplementedTrait.create()),
  Rule.dyn(CompanionMismatch, CompanionMismatch.create()),
  Rule.dyn(SplitCompanion, SplitCompanion.create()),
  Rule.dyn(BypassedCompanion, BypassedCompanion.create()),
  Rule.dyn(UnnamedOf, UnnamedOf.create()),
  Rule.dyn(IncompleteDisable, IncompleteDisable.create()),
  Rule.dyn(UnusedDisable, UnusedDisable.create()),
];

/**
 * Each rule under its own name, so a caller can name one without spelling its kind.
 *
 * {@link RULES} is what the runner reads. This is for naming a single one.
 */
export {
  UnnecessaryAlias,
  BrandMismatch,
  BypassedCompanion,
  CompanionMismatch,
  DuplicateBrand,
  IncompleteDisable,
  SplitCompanion,
  UnnamedOf,
  UnusedDisable,
  UnusedMember,
  UnimplementedTrait,
};

/** What each rule is called, in a `--no-<kind>` flag and in a disable comment alike. */
export const kinds: readonly Kind[] = RULES.map(({ kind }) => kind);

/** Every rule's kind, to check a name against. */
export const ALL_KINDS = KindSet.create(kinds);

export { Context, Finding, Kind, KindSet, Rule } from "./rule.ts";
