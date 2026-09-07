import type { Resolver } from "../typecheck/index.ts";
import type { Scan } from "../scan/index.ts";

/**
 * The least every finding carries: what it is, where to look, and what to say.
 *
 * The wording belongs to the rule, next to the `description` that names it. The command prints
 * `message` as it stands, so nothing outside a rule needs to know what its finding holds.
 */
type Located = { kind: string; file: string; line: number; message: string };

/** What a rule gets beyond the scans. */
type Context = {
  /**
   * Resolves a type reference to its declaration, or `undefined` when the project has no
   * TypeScript.
   *
   * A function, not a value: the language server is started by the first rule that asks and by
   * nothing else, so a rule that is skipped, or that decides it has nothing to resolve, costs
   * nothing. That is most of what the structural-equals rule costs.
   */
  types: () => Resolver | undefined;
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
   * Every finding, over every scanned file. Rules see all of them rather than one, which is what
   * lets a read in one module answer for a declaration in another.
   */
  run: (scans: readonly Scan[], context: Context) => F[] | Promise<F[]>;
};
