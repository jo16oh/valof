import { Trait, Val, type Self } from "../../lib/index.ts";
import type { Position } from "../parse/ast.ts";
import type { Scan } from "../scan/index.ts";
import type { FilePath } from "../shared/files.ts";

/**
 * What every rule reports: what it is, where to look, and what to say. The command prints `message`
 * unchanged.
 */
export type Finding = Val<
  "Finding",
  {
    /** The `kind` of the rule that reported it. */
    kind: Kind;
    file: FilePath;
    at: Position;
    message: string;
  }
>;
export const Finding = Val.companion<Finding>().build();

/** A rule's name, as a finding, a `--skip` flag and `--help` spell it. */
export type Kind = Val<"Kind", string>;
export const Kind = Val.companion<Kind>().build();

/** Rule kinds, as a set. */
export type KindSet = Val.Record<"KindSet", Kind, true>;
export const KindSet = Val.Record.companion<KindSet>()
  .implCreate((kinds: Iterable<Kind>) => [...kinds].map((kind) => [kind, true] as const))
  .impl(() => ({
    /** The kind `name` spells, or `undefined` when it is not in the set. */
    find: (kinds, name: string): Kind | undefined =>
      Object.hasOwn(kinds, name) ? Kind.seal(name) : undefined,
  }))
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
    reported: Finding[];
    /**
     * Kinds left out of this run with `--skip <kind>`, which report nothing however the code reads.
     */
    notRun: KindSet;
  }
>;
export const Context = Val.companion<Context>().build();

/**
 * One rule, whole: what it reports, how it reads in `--help`, and how it runs. Each rule is a Val
 * implementing this trait, listed in `RULES`, and its companion's `create` returns the value that
 * runs.
 */
export type Rule = Trait<
  "Rule",
  {
    /** The name that names it everywhere: `--skip <kind>`, the disable comment, and `--help`. */
    kind: Kind;
    /** The line `--help` prints, after the kind. */
    description: string;
    /**
     * Set on a rule whose finding is about code that does nothing, not code that is wrong.
     *
     * A host with severities takes this as a warning and the rest as errors. The command reports
     * every finding the same way and exits 1 on any of them.
     */
    warns: boolean;
    /** Set on a rule that runs only where `Options.enable` names it. */
    optIn: boolean;
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
