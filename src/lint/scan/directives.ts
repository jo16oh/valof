import type { Where } from "../ast.ts";

/**
 * How a directive is written.
 *
 * The scope is always in the spelling: a reader never has to know which one covers what. The
 * `-all` slot sits before it, so a line-scoped `-all` has a place to go if it is ever wanted.
 * `valof-lint-disable` on its own names no scope, which is the mistake this shape makes visible
 * rather than guesses at.
 */
export type Spelling =
  | "valof-lint-disable-next-line"
  | "valof-lint-disable-whole-file"
  | "valof-lint-disable-all-whole-file"
  | "valof-lint-disable";

/** One disable comment, whole. */
export type Directive = Where & {
  /** The 1-based line it silences, the one after the block it sits in, or the whole file. */
  covers: number | "file";
  /** The kinds it named, empty when it named none. */
  kinds: ReadonlySet<string>;
  spelling: Spelling;
};

/** What a set of directives silences: the kinds they named, or every kind there is. */
type Silenced = ReadonlySet<string> | "every";

/**
 * What one directive silences, which is not always what it named.
 *
 * Naming no rule on a line means every kind there: a directive that silenced nothing would bury
 * the finding it was written to hold back. Naming none over a whole file means nothing at all,
 * since silencing would hide the report about the directive itself and leave nobody to hear it.
 * `valof-lint-disable-all-whole-file` is how a file is turned off, and it says so.
 */
const effect = ({ spelling, kinds }: Directive): Silenced => {
  if (spelling === "valof-lint-disable-all-whole-file") return "every";
  if (spelling === "valof-lint-disable") return new Set();
  if (kinds.size > 0) return kinds;
  return spelling === "valof-lint-disable-next-line" ? "every" : new Set();
};

/**
 * What one comment carries, or `undefined` when it carries no directive.
 *
 * More than one name goes on a line, separated by a space or a comma alike, since a reader
 * writing a list will reach for either. Nothing but a space may follow a spelling, so a
 * misspelling such as `valof-lint-disable-nextline` silences nothing rather than a whole file.
 */
function directive(text: string): { spelling: Spelling; kinds: Set<string> } | undefined {
  const match =
    /(?:^|\s)valof-lint-disable(-next-line|-all-whole-file|-whole-file)?(?![-\w])(?:[^\S\n]+([^\n]*))?/.exec(
      text,
    );
  if (!match) return undefined;
  // Everything after `--` is a note for the reader, the way other linters spell it.
  const listed = (match[2] ?? "").split("--")[0] ?? "";
  return {
    spelling: `valof-lint-disable${match[1] ?? ""}` as Spelling,
    kinds: new Set(listed.split(/[\s,]+/).filter(Boolean)),
  };
}

/** Whether nothing but whitespace precedes `start` on its line. */
function ownLine(source: string, start: number): boolean {
  for (let index = start - 1; index >= 0; index--) {
    const character = source[index];
    if (character === "\n") return true;
    if (character !== " " && character !== "\t" && character !== "\r") return false;
  }
  return true;
}

/** Two directives over the same lines silence the union, and every kind swallows any list. */
const widen = (left: Silenced, right: Silenced): Silenced =>
  left === "every" || right === "every" ? "every" : new Set([...left, ...right]);

/**
 * Every directive in one file, at its own comment rather than the line it covers.
 *
 * The whole comment block above a line is read, not only the comment touching it, so a
 * `valof-lint-disable-next-line` may sit among another linter's directives in any order. A block
 * is a run of own-line comments with no blank line and no code between them; a trailing comment
 * after code belongs to no block, and a blank line starts a new one. A whole-file directive
 * needs none of that: it is placed wherever its author put it.
 *
 * A directive keeps its own position because two rules ask about the directive itself rather
 * than about the line under it: one names no rule, another names one that reports nothing.
 */
export function directives(
  comments: readonly { value: string; start: number; end: number }[],
  source: string,
  at: (offset: number) => Where,
): Directive[] {
  const lineOf = (offset: number): number => at(offset).line;
  const found: Directive[] = [];
  /** The line directives of the block being read, held until its last line is known. */
  let block: Omit<Directive, "covers">[] = [];
  /** The last line of that block, or -1 when the previous comment closed one. */
  let blockEnd = -1;
  /** Where that comment ended, so code written after it on its own line breaks the block. */
  let blockEndOffset = 0;

  const close = (): void => {
    for (const carried of block) found.push({ ...carried, covers: blockEnd + 1 });
    block = [];
  };

  for (const comment of comments) {
    if (!ownLine(source, comment.start)) {
      close();
      blockEnd = -1;
      continue;
    }
    const joins =
      blockEnd !== -1 &&
      lineOf(comment.start) <= blockEnd + 1 &&
      source.slice(blockEndOffset, comment.start).trim() === "";
    if (!joins) close();
    const carried = directive(comment.value);
    if (carried) {
      const written = { ...at(comment.start), ...carried };
      if (carried.spelling === "valof-lint-disable-next-line") block.push(written);
      else found.push({ ...written, covers: "file" });
    }
    blockEnd = lineOf(comment.end);
    blockEndOffset = comment.end;
  }
  close();
  return found;
}

/**
 * Whether the directives of one file silence a finding of `kind` on `line`.
 *
 * Two directives in one block land on the same line, so what they silence is merged there. A
 * whole-file one covers every line, its own comment included: leaving a file out of the run is
 * what it is for, so the findings about the directive go with the rest.
 */
export function silences(found: readonly Directive[]): (line: number, kind: string) => boolean {
  let whole: Silenced | undefined;
  const byLine = new Map<number, Silenced>();
  for (const written of found) {
    const silenced = effect(written);
    if (written.covers === "file") {
      whole = whole ? widen(whole, silenced) : silenced;
      continue;
    }
    const already = byLine.get(written.covers);
    byLine.set(written.covers, already ? widen(already, silenced) : silenced);
  }
  const reaches = (silenced: Silenced | undefined, kind: string): boolean =>
    silenced === "every" || silenced?.has(kind) === true;
  return (line, kind) => reaches(whole, kind) || reaches(byLine.get(line), kind);
}
