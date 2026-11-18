import type { Dyn } from "../../lib/index.ts";
import { DataTypeSettings, type Options } from "../shared/options.ts";
import { AliasedDraft } from "./aliased-draft.ts";
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
  AliasedDraft,
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

/** Every rule, in the order they run and `--help` lists them. {@link KINDS} is read off it. */
export const RULES = [
  UnusedMember.dyn<Rule>(UnusedMember.create()),
  DuplicateBrand.dyn<Rule>(DuplicateBrand.create()),
  BrandMismatch.dyn<Rule>(BrandMismatch.create()),
  UnnecessaryAlias.dyn<Rule>(UnnecessaryAlias.create()),
  UnimplementedTrait.dyn<Rule>(UnimplementedTrait.create()),
  CompanionMismatch.dyn<Rule>(CompanionMismatch.create()),
  SplitCompanion.dyn<Rule>(SplitCompanion.create()),
  BypassedCompanion.dyn<Rule>(BypassedCompanion.create()),
  InferredValOf.dyn<Rule>(InferredValOf.create()),
  HiddenSharedStateInImpl.dyn<Rule>(HiddenSharedStateInImpl.create()),
  AliasedDraft.dyn<Rule>(AliasedDraft.create()),
  DataTypeOutsideValof.dyn<Rule>(DataTypeOutsideValof.create(DataTypeSettings.create())),
  HiddenOptional.dyn<Rule>(HiddenOptional.create()),
  DetachedVariant.dyn<Rule>(DetachedVariant.create()),
  VagueDisable.dyn<Rule>(VagueDisable.create()),
  UnusedDisable.dyn<Rule>(UnusedDisable.create()),
] as const;

/** What each rule is called, in a `--no-<kind>` flag and in a disable comment alike. */
export const KINDS: readonly Kind[] = RULES.map(({ value: { kind } }) => kind);

/** Every rule's kind, to check a name against. */
export const ALL_KINDS = KindSet.create(KINDS);

/**
 * The rules a run uses: every rule on by default, and each opt-in rule `enable` names, with its
 * settings.
 */
export function compile(enable: Options["enable"]): Dyn<Rule>[] {
  const model = enable["no-data-type-outside-valof"];
  return RULES.flatMap((rule) =>
    !rule.value.optIn
      ? [rule]
      : rule.value.kind === "no-data-type-outside-valof" && model
        ? [DataTypeOutsideValof.dyn<Rule>(DataTypeOutsideValof.create(model))]
        : [],
  );
}
