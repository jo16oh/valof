import { Val } from "../../index.ts";
import type { Finding } from "../index.ts";

/** A point as ESLint counts it: lines from 1, columns from 0. */
type Point = Val<"Point", { line: number; column: number }>;
const Point = Val.companion<Point>().build();

/**
 * What the underline covers, from the point the finding names.
 *
 * A finding carries one position, and a report drawn from one position underlines one character.
 * So the name at that position is measured here: the linter points at `label`, `Val` or an alias,
 * and the editor should underline the whole of it. Where the position is not on a word, which is
 * the disable comments, the rest of the line stands in.
 */
export type Underline = Val<"Underline", { start: Point; end: Point }>;
export const Underline = Val.companion<Underline>()
  .implAssoc(({ seal }) => ({
    /** Columns count from 1 in a finding, as an editor shows them, and from 0 in a report. */
    fromFinding: ({ at: { line, column } }: Finding, text: string): Underline => {
      const rest = (text.split("\n")[line - 1] ?? "").slice(column - 1);
      const width = WORD.exec(rest)?.[0].length ?? rest.trimEnd().length;
      return seal({
        start: Point.seal({ line, column: column - 1 }),
        end: Point.seal({ line, column: column - 1 + Math.max(width, 1) }),
      });
    },
  }))
  .build();

/** A word, for the squiggle to cover. Runs of these are what a finding points at. */
const WORD = /^[\p{L}\p{N}_$]+/u;
