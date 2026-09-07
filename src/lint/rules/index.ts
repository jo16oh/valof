import { DuplicateBrand } from "./brands.ts";
import { StructuralEquals } from "./equals.ts";
import type { Rule } from "./rule.ts";
import { UnusedMember } from "./unused.ts";

export type Finding = UnusedMember | DuplicateBrand | StructuralEquals;

/** What a finding is called, in a `--no-<kind>` flag and in a disable comment alike. */
export type Kind = Finding["kind"];

/**
 * Every rule, keyed by the kind it reports.
 *
 * A `Record` over the kinds, so a rule added to {@link Finding} fails to compile until it is
 * listed here. Nothing else enumerates them: the runner and `--help` both read this.
 */
export const RULES: Record<Kind, Rule<Finding>> = {
  "unused-member": UnusedMember,
  "duplicate-brand": DuplicateBrand,
  "structural-equals": StructuralEquals,
};

/** The kinds, in the order the rules run and `--help` lists them. */
export const kinds = Object.keys(RULES) as Kind[];

export const isKind = (name: string): name is Kind => name in RULES;
