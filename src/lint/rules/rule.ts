import type { Resolver } from "../typecheck/index.ts";
import type { Scan } from "../scan/index.ts";

/**
 * The least every finding carries: what it is, where to look, and what to say.
 *
 * The wording belongs to the rule, next to the `description` that names it. The command prints
 * `message` as it stands, so nothing outside a rule needs to know what its finding holds.
 */
export type Located = { kind: string; file: string; line: number; column: number; message: string };

/** What a rule gets beyond the scans. */
export type Context = {
  /**
   * What the rules before this one reported, silenced or not.
   *
   * Rules run in the order {@link RULES} lists them, so a rule reading this must sit last. Only
   * a rule about the run itself needs it; a rule about the code reads the scans.
   */
  reported: readonly Located[];
  /**
   * Kinds left out of this run with `--no-<kind>`, which report nothing however the code reads.
   */
  notRun: ReadonlySet<string>;
  /**
   * Resolves a type reference to its declaration. Throws when the project has no TypeScript.
   *
   * A function, not a value: the language server is started by the first rule that asks and by
   * nothing else, so a rule that is skipped, or that decides it has nothing to resolve, costs
   * nothing. That is most of what the structural-equals rule costs.
   */
  types: () => Resolver;
};

/**
 * One rule, whole: what it reports, how it reads in `--help`, and how it runs.
 *
 * Kept together so nothing about a rule lives at the call site. Adding one is writing this
 * object and naming it in {@link RULES}; the runner has no branch per rule.
 */
export type Rule<F extends Located> = {
  /** The name that names it everywhere: `--no-<kind>`, the disable comment, and `--help`. */
  kind: F["kind"];
  /** The line `--help` prints, after the kind. */
  description: string;
  /**
   * Set on a rule that `--no-<kind>` may not leave out.
   *
   * For the two that guard the disable comments themselves. A switch that turns off the report
   * about silencing is a way to silence everything and hear nothing about it, which is the thing
   * they exist to prevent. A file is still left out of the run whole, by saying so in it.
   */
  always?: true;
  /**
   * Every finding, over every scanned file. Rules see all of them rather than one, which is what
   * lets a read in one module answer for a declaration in another.
   */
  run: (scans: readonly Scan[], context: Context) => F[] | Promise<F[]>;
};
