import type { Where } from "../ast.ts";

/** One `valof-lint-disable-next-line`, whole. */
export type Directive = Where & {
  /** The 1-based line it silences: the one after the comment block it sits in. */
  covers: number;
  /** The kinds it names, empty for a bare directive, which stands for every kind. */
  kinds: ReadonlySet<string>;
};

/**
 * The kinds one comment silences, or `undefined` when it carries no directive.
 *
 * More than one name goes on a line, separated by a space or a comma alike, since a reader
 * writing a list will reach for either.
 */
function directive(text: string): Set<string> | undefined {
  const match = /(?:^|\s)valof-lint-disable-next-line(?:[^\S\n]+([^\n]*))?/.exec(text);
  if (!match) return undefined;
  // Everything after `--` is a note for the reader, the way other linters spell it.
  const listed = (match[1] ?? "").split("--")[0] ?? "";
  return new Set(listed.split(/[\s,]+/).filter(Boolean));
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

/** An empty set already covers every kind, so it wins over any list. */
function widen(left: Set<string>, right: ReadonlySet<string>): Set<string> {
  if (left.size === 0 || right.size === 0) return new Set();
  return new Set([...left, ...right]);
}

/**
 * Every directive in one file, at its own comment rather than the line it covers.
 *
 * The whole comment block above a line is read, not only the comment touching it, so a
 * `valof-lint-disable-next-line` may sit among another linter's directives in any order. A block
 * is a run of own-line comments with no blank line and no code between them; a trailing comment
 * after code belongs to no block, and a blank line starts a new one.
 *
 * A directive keeps its own position because two rules ask about the directive itself rather
 * than about the line under it: one names no kind, another names one that reports nothing.
 */
export function directives(
  comments: readonly { value: string; start: number; end: number }[],
  source: string,
  at: (offset: number) => Where,
): Directive[] {
  const lineOf = (offset: number): number => at(offset).line;
  const found: Directive[] = [];
  /** The directives of the block being read, held until its last line is known. */
  let block: { where: Where; kinds: Set<string> }[] = [];
  /** The last line of that block, or -1 when the previous comment closed one. */
  let blockEnd = -1;
  /** Where that comment ended, so code written after it on its own line breaks the block. */
  let blockEndOffset = 0;

  const close = (): void => {
    for (const { where, kinds } of block) found.push({ ...where, covers: blockEnd + 1, kinds });
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
    const kinds = directive(comment.value);
    if (kinds) block.push({ where: at(comment.start), kinds });
    blockEnd = lineOf(comment.end);
    blockEndOffset = comment.end;
  }
  close();
  return found;
}

/**
 * 1-based line -> the kinds silenced there, for the file those directives came from.
 *
 * Two directives in one block land on the same line, so what they silence is merged there.
 */
export function silences(found: readonly Directive[]): Map<number, Set<string>> {
  const byLine = new Map<number, Set<string>>();
  for (const { covers, kinds } of found) {
    const already = byLine.get(covers);
    byLine.set(covers, already ? widen(already, kinds) : new Set(kinds));
  }
  return byLine;
}
