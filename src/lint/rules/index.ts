import { BlockStep } from "./block-step.ts";
import { ModelOnlyInValof } from "./model-only-in-valof.ts";
import { HiddenOptional } from "./hidden-optional.ts";
import { PayloadOfProperty } from "./payload-of-property.ts";
import { UnreturnedSeal } from "./unreturned-seal.ts";
import { UnrelatedAssoc } from "./unrelated-assoc.ts";
import { ConstructorName } from "./constructor-name.ts";
import { SplitVariantSteps } from "./split-variant-steps.ts";
import { UnqualifiedVariant } from "./unqualified-variant.ts";
import { IncompleteDisable } from "./incomplete-disable.ts";
import { BypassedCompanion } from "./bypassed-companion.ts";
import { UnnecessaryAlias } from "./unnecessary-alias.ts";
import { BrandMismatch } from "./brand-mismatch.ts";
import { CompanionMismatch } from "./companion-mismatch.ts";
import { DuplicateBrand } from "./duplicate-brand.ts";
import { box } from "./rule.ts";
import { SplitCompanion } from "./split-companion.ts";
import { UnnamedOf } from "./unnamed-of.ts";
import { UnusedDisable } from "./unused-disable.ts";
import { UnusedMember } from "./unused-member.ts";
import { UnimplementedTrait } from "./unimplemented-trait.ts";

/**
 * Every rule, in the order they run and `--help` lists them.
 *
 * The only enumeration. A rule carries its own kind, so listing it here says nothing twice, and
 * {@link Kind} is read back off this array rather than written again.
 */
export const RULES = [
  box(UnusedMember, UnusedMember.create()),
  box(DuplicateBrand, DuplicateBrand.create()),
  box(BrandMismatch, BrandMismatch.create()),
  box(UnnecessaryAlias, UnnecessaryAlias.create()),
  box(UnimplementedTrait, UnimplementedTrait.create()),
  box(CompanionMismatch, CompanionMismatch.create()),
  box(SplitCompanion, SplitCompanion.create()),
  box(BypassedCompanion, BypassedCompanion.create()),
  box(UnnamedOf, UnnamedOf.create()),
  box(BlockStep, BlockStep.create()),
  box(ModelOnlyInValof, ModelOnlyInValof.create()),
  box(HiddenOptional, HiddenOptional.create()),
  box(PayloadOfProperty, PayloadOfProperty.create()),
  box(UnreturnedSeal, UnreturnedSeal.create()),
  box(UnrelatedAssoc, UnrelatedAssoc.create()),
  box(ConstructorName, ConstructorName.create()),
  box(SplitVariantSteps, SplitVariantSteps.create()),
  box(UnqualifiedVariant, UnqualifiedVariant.create()),
  box(IncompleteDisable, IncompleteDisable.create()),
  box(UnusedDisable, UnusedDisable.create()),
] as const;

/**
 * Each rule under its own name, so a caller can name one without spelling its kind.
 *
 * {@link RULES} is what the runner reads. This is for naming a single one.
 */
export {
  BlockStep,
  ModelOnlyInValof,
  HiddenOptional,
  PayloadOfProperty,
  UnreturnedSeal,
  UnrelatedAssoc,
  ConstructorName,
  SplitVariantSteps,
  UnqualifiedVariant,
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

/** What a finding is called, in a `--no-<kind>` flag and in a disable comment alike. */
export type Kind = (typeof RULES)[number]["kind"];

export const kinds: readonly Kind[] = RULES.map(({ kind }) => kind);

export const isKind = (name: string): name is Kind => kinds.includes(name as Kind);

export { Finding, Rule, type Context } from "./rule.ts";
