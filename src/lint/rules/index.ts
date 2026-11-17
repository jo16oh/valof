import type { Dyn } from "../../lib/index.ts";
import { DataTypeSettings, type Options } from "../shared/options.ts";
import { AliasedDraft } from "./aliased-draft.ts";
import { BrandMismatch } from "./brand-mismatch.ts";
import { BypassedCompanion } from "./bypassed-companion.ts";
import { CompanionMismatch } from "./companion-mismatch.ts";
import { DataTypeOutsideValof } from "./data-type-outside-valof.ts";
import { DetachedVariant } from "./detached-variant.ts";
import { DuplicateBrand } from "./duplicate-brand.ts";
import { HiddenOptional } from "./hidden-optional.ts";
import { HiddenSharedStateInImpl } from "./hidden-shared-state-in-impl.ts";
import { IncompleteDisable } from "./incomplete-disable.ts";
import { InferredValOf } from "./inferred-val-of.ts";
import { KindSet, Rule, type Kind } from "./rule.ts";
import { SplitCompanion } from "./split-companion.ts";
import { UnimplementedTrait } from "./unimplemented-trait.ts";
import { UnnecessaryAlias } from "./unnecessary-alias.ts";
import { UnusedDisable } from "./unused-disable.ts";
import { UnusedMember } from "./unused-member.ts";

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
  IncompleteDisable,
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
  IncompleteDisable.dyn<Rule>(IncompleteDisable.create()),
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
  const model = enable["data-type-outside-valof"];
  return RULES.flatMap((rule) =>
    !rule.value.optIn
      ? [rule]
      : rule.value.kind === "data-type-outside-valof" && model
        ? [DataTypeOutsideValof.dyn<Rule>(DataTypeOutsideValof.create(model))]
        : [],
  );
}
