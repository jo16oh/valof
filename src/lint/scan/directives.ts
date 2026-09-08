import type { Where } from "../ast.ts";

/**
 * The kinds one comment silences, or `undefined` when it carries no directive. An empty set
 * stands for every kind, which is what a bare `valof-lint-disable-next-line` means.
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
function widen(left: Set<string>, right: Set<string>): Set<string> {
  if (left.size === 0 || right.size === 0) return new Set();
  return new Set([...left, ...right]);
}

/**
 * What the directives in one file silence, and where they named nothing.
 *
 * The whole comment block above a line is read, not only the comment touching it, so a
 * `valof-lint-disable-next-line` may sit among another linter's directives in any order. A block
 * is a run of own-line comments with no blank line and no code between them; a trailing comment
 * after code belongs to no block, and a blank line starts a new one.
 *
 * `bare` holds the directives that named no kind, at the comment itself rather than the line it
 * covers. Only those that take effect are there: one trailing code silences nothing, so there is
 * nothing to say about it.
 */
export function disabledLines(
  comments: readonly { value: string; start: number; end: number }[],
  source: string,
  at: (offset: number) => Where,
): { disabled: Map<number, Set<string>>; bare: Where[] } {
  const lineOf = (offset: number): number => at(offset).line;
  const byLine = new Map<number, Set<string>>();
  const bare: Where[] = [];
  /** The last line of the block being read, or -1 when the previous comment closed one. */
  let blockEnd = -1;
  /** Where that comment ended, so code written after it on its own line breaks the block. */
  let blockEndOffset = 0;
  /** What the block has silenced so far, or `undefined` while it holds no directive. */
  let kinds: Set<string> | undefined;

  for (const comment of comments) {
    if (!ownLine(source, comment.start)) {
      blockEnd = -1;
      kinds = undefined;
      continue;
    }
    const joins =
      blockEnd !== -1 &&
      lineOf(comment.start) <= blockEnd + 1 &&
      source.slice(blockEndOffset, comment.start).trim() === "";
    if (!joins) kinds = undefined;
    const found = directive(comment.value);
    if (found) {
      if (found.size === 0) bare.push(at(comment.start));
      kinds = kinds ? widen(kinds, found) : found;
    }
    blockEnd = lineOf(comment.end);
    blockEndOffset = comment.end;
    // Rewritten as the block grows, so the entry lands on the line that follows all of it.
    if (kinds) byLine.set(blockEnd + 1, kinds);
  }
  return { disabled: byLine, bare };
}
