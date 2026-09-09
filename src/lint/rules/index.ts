import { IncompleteDisable } from "./incomplete-disable.ts";
import { BrandMismatch } from "./brand-mismatch.ts";
import { CompanionMismatch } from "./companion-mismatch.ts";
import { DuplicateBrand } from "./duplicate-brand.ts";
import type { Rule } from "./rule.ts";
import { SplitCompanion } from "./split-companion.ts";
import { StructuralEquals } from "./structural-equals/index.ts";
import { UnusedDisable } from "./unused-disable.ts";
import { UnusedMember } from "./unused-member.ts";

/**
 * Every rule, in the order they run and `--help` lists them.
 *
 * The only enumeration. A rule carries its own kind, so listing it here says nothing twice, and
 * {@link Kind} and {@link Finding} are read back off this array rather than written again.
 */
export const RULES = [
  UnusedMember,
  DuplicateBrand,
  BrandMismatch,
  CompanionMismatch,
  SplitCompanion,
  StructuralEquals,
  IncompleteDisable,
  UnusedDisable,
] as const;

/** The payload a rule reports, recovered from the rule itself. */
type ReportedBy<R> = R extends Rule<infer F> ? F : never;

export type Finding = ReportedBy<(typeof RULES)[number]>;

/** What a finding is called, in a `--no-<kind>` flag and in a disable comment alike. */
export type Kind = Finding["kind"];

export const kinds: readonly Kind[] = RULES.map(({ kind }) => kind);

export const isKind = (name: string): name is Kind => kinds.includes(name as Kind);

/** The kinds `--no-<kind>` accepts, which is every one that does not guard the directives. */
export const skippable: readonly Kind[] = RULES.filter(({ always }) => !always).map(
  ({ kind }) => kind,
);

export const isSkippable = (kind: Kind): boolean => skippable.includes(kind);
