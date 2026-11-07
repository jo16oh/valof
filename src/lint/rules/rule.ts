import { Trait, Val, type Self } from "../../index.ts";
import type { Position } from "../ast.ts";
import type { Scan } from "../scan/index.ts";

/**
 * What every rule reports: what it is, where to look, and what to say.
 *
 * The wording belongs to the rule, next to the `description` that names it. The command prints
 * `message` unchanged, so nothing outside a rule needs to know what else the rule read.
 */
export type Finding = Val<
  "Finding",
  {
    /** The `kind` of the rule that reported it. */
    kind: string;
    file: string;
    at: Position;
    message: string;
  }
>;
export const Finding = Val.companion<Finding>().build();

/** Rule kinds, as a set. */
export type KindSet = Val<"KindSet", Record<string, true>>;
export const KindSet = Val.companion<KindSet>()
  .implCreate((kinds: Iterable<string>) =>
    Object.fromEntries([...kinds].map((kind) => [kind, true as const])),
  )
  .impl(() => ({ has: (kinds, kind: string) => Object.hasOwn(kinds, kind) }))
  .build();

/** What a rule gets beyond the scans. */
export type Context = Val<
  "Context",
  {
    /**
     * What the rules before this one reported, silenced or not.
     *
     * Rules run in the order `RULES` lists them, so a rule reading this must sit last. Only
     * a rule about the run itself needs it; a rule about the code reads the scans.
     */
    reported: readonly Finding[];
    /**
     * Kinds left out of this run with `--no-<kind>`, which report nothing however the code reads.
     */
    notRun: KindSet;
  }
>;
export const Context = Val.companion<Context>().build();

/**
 * One rule, whole: what it reports, how it reads in `--help`, and how it runs.
 *
 * Each rule is a Val implementing this trait, and its companion's `create` returns the value that
 * runs. Adding one is writing that Val and listing it in `RULES`; the runner has no branch per
 * rule.
 */
export type Rule = Trait<
  "Rule",
  {
    /** The name that names it everywhere: `--no-<kind>`, the disable comment, and `--help`. */
    kind: string;
    /** The line `--help` prints, after the kind. */
    description: string;
    /**
     * Set on a rule whose finding is about code that does nothing, not code that is wrong.
     *
     * A host with severities takes this as a warning and the rest as errors. The command reports
     * every finding the same way and exits 1 on any of them.
     */
    warns: boolean;
  },
  {
    /**
     * Every finding, over every scanned file. Rules see all of them rather than one, which is what
     * lets a read in one module answer for a declaration in another.
     */
    run: (rule: Self, scans: readonly Scan[], context: Context) => Finding[];
  }
>;
export const Rule = Trait.companion<Rule>().build();
