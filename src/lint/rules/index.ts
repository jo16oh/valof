import { DuplicateBrand } from "./duplicate.ts";
import { StructuralEquals } from "./equals/index.ts";
import { BrandMismatch } from "./mismatch.ts";
import type { Rule } from "./rule.ts";
import { UnusedMember } from "./unused.ts";

/**
 * Every rule, in the order they run and `--help` lists them.
 *
 * The only enumeration. A rule carries its own kind, so listing it here says nothing twice, and
 * {@link Kind} and {@link Finding} are read back off this array rather than written again.
 */
export const RULES = [UnusedMember, DuplicateBrand, BrandMismatch, StructuralEquals] as const;

/** The payload a rule reports, recovered from the rule itself. */
type ReportedBy<R> = R extends Rule<infer F> ? F : never;

export type Finding = ReportedBy<(typeof RULES)[number]>;

/** What a finding is called, in a `--no-<kind>` flag and in a disable comment alike. */
export type Kind = Finding["kind"];

export const kinds: readonly Kind[] = RULES.map(({ kind }) => kind);

export const isKind = (name: string): name is Kind => kinds.includes(name as Kind);
