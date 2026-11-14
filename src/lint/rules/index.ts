import type { Dyn } from "../../lib/index.ts";
import { DataTypeSettings, type Options } from "../shared/options.ts";
import { BrandMismatch } from "./no-brand-mismatch.ts";
import { BypassedCompanion } from "./no-bypassed-companion.ts";
import { CompanionMismatch } from "./no-companion-mismatch.ts";
import { DataTypeOutsideValof } from "./no-data-type-outside-valof.ts";
import { DetachedVariant } from "./no-detached-variant.ts";
import { DuplicateBrand } from "./no-duplicate-brand.ts";
import { HiddenOptional } from "./no-hidden-optional.ts";
import { HiddenSharedStateInImpl } from "./no-hidden-shared-state-in-impl.ts";
import { InferredValOf } from "./no-inferred-val-of.ts";
import { SplitCompanion } from "./no-split-companion.ts";
import { UnimplementedTrait } from "./no-unimplemented-trait.ts";
import { UnnecessaryAlias } from "./no-unnecessary-alias.ts";
import { UnusedDisable } from "./no-unused-disable.ts";
import { UnusedMember } from "./no-unused-member.ts";
import { VagueDisable } from "./no-vague-disable.ts";
import { KindSet, Rule, type Kind } from "./rule.ts";

/**
 * Each rule under its own name, so a caller can name one without spelling its kind.
 *
 * {@link RULES} is what the runner reads. This is for naming a single one.
 */
export {
  HiddenSharedStateInImpl,
  DataTypeOutsideValof,
  HiddenOptional,
  DetachedVariant,
  UnnecessaryAlias,
  BrandMismatch,
  BypassedCompanion,
  CompanionMismatch,
  DuplicateBrand,
  VagueDisable,
  SplitCompanion,
  InferredValOf,
  UnusedDisable,
  UnusedMember,
  UnimplementedTrait,
};

export { Context, Finding, Kind, KindSet, Rule } from "./rule.ts";

/**
 * Every rule, in the order they run and `--help` lists them.
 *
 * The only enumeration. A rule carries its own kind, so listing it here says nothing twice, and
 * {@link KINDS} is read back off this array rather than written again.
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
  Rule.dyn(InferredValOf, InferredValOf.create()),
  Rule.dyn(HiddenSharedStateInImpl, HiddenSharedStateInImpl.create()),
  Rule.dyn(DataTypeOutsideValof, DataTypeOutsideValof.create(DataTypeSettings.create())),
  Rule.dyn(HiddenOptional, HiddenOptional.create()),
  Rule.dyn(DetachedVariant, DetachedVariant.create()),
  Rule.dyn(VagueDisable, VagueDisable.create()),
  Rule.dyn(UnusedDisable, UnusedDisable.create()),
] as const;

/** What each rule is called, in a `--skip` flag and in a disable comment alike. */
export const KINDS: readonly Kind[] = RULES.map(({ kind }) => kind);

/** Every rule's kind, to check a name against. */
export const ALL_KINDS = KindSet.create(KINDS);

/**
 * The rules a run uses: every rule on by default, and each opt-in rule `enable` names, with its
 * settings.
 */
export function compile(enable: Options["enable"]): Dyn<Rule>[] {
  const model = enable["no-data-type-outside-valof"];
  return RULES.flatMap((rule) =>
    rule.optIn !== true
      ? [rule]
      : rule.kind === "no-data-type-outside-valof" && model
        ? [Rule.dyn(DataTypeOutsideValof, DataTypeOutsideValof.create(model))]
        : [],
  );
}
