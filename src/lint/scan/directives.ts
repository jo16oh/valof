import { Enum, Val } from "../../index.ts";
import { Lines, type Position } from "../ast.ts";
import { KindSet } from "../rules/rule.ts";
import type { Scan } from "./index.ts";

/** One disable comment, whole. */
export type Directive = Val<
  "Directive",
  {
    at: Position;
    /** The 1-based line it silences, the one after the block it sits in, or the whole file. */
    covers: number | "file";
    /** The kinds it named, in order and without repeats, empty when it named none. */
    kinds: string[];
    /**
     * How it is written: `valof-lint-disable-next-line`, `-whole-file`, `-all-whole-file`, or
     * `valof-lint-disable` alone.
     *
     * The scope is always in the spelling: a reader never has to know which one covers what. The
     * `-all` slot sits before it, so a line-scoped `-all` has a place to go if it is ever wanted.
     * `valof-lint-disable` on its own names no scope, which is the mistake this shape makes
     * visible rather than guesses at.
     */
    spelling: string;
  }
>;
/** What a directive silences: the kinds it named, or every kind there is. */
type Silenced = Enum<"Silenced", { Every: {}; Named: { kinds: KindSet } }>;
const Silenced = Enum.companion<Silenced>()
  .impl(() => ({
    has: (silenced, kind: string) => silenced._tag === "Every" || KindSet.has(silenced.kinds, kind),
  }))
  .build();

/**
 * What one directive silences, which is not always what it named.
 *
 * Naming no rule on a line means every kind there: a directive that silenced nothing would bury
 * the finding it was written to hold back. Naming none over a whole file means nothing at all,
 * since silencing would hide the report about the directive itself and leave nobody to hear it.
 * `valof-lint-disable-all-whole-file` is how a file is turned off, and it says so.
 */
const effect = ({ spelling, kinds }: Directive): Silenced => {
  if (spelling === "valof-lint-disable-all-whole-file") return Silenced.Every.create({});
  if (spelling === "valof-lint-disable") return named([]);
  if (kinds.length > 0) return named(kinds);
  return spelling === "valof-lint-disable-next-line" ? Silenced.Every.create({}) : named([]);
};

export const Directive = Val.companion<Directive>()
  .impl(() => ({
    /**
     * Whether it silences a finding of `kind` on `line`. A whole-file one covers every line, its
     * own comment included: leaving a file out of the run is what it is for, so the findings about
     * the directive go with the rest.
     */
    silences: (directive, line: number, kind: string) =>
      (directive.covers === "file" || directive.covers === line) &&
      Silenced.has(effect(directive), kind),
  }))
  .build();

/**
 * What one comment carries, or `undefined` when it carries no directive.
 *
 * More than one name goes on a line, separated by a space or a comma alike, since a reader
 * writing a list will reach for either. Nothing but a space may follow a spelling, so a
 * misspelling such as `valof-lint-disable-nextline` silences nothing rather than a whole file.
 */
function directive(text: string): { spelling: string; kinds: string[] } | undefined {
  const match =
    /(?:^|\s)valof-lint-disable(-next-line|-all-whole-file|-whole-file)?(?![-\w])(?:[^\S\n]+([^\n]*))?/.exec(
      text,
    );
  if (!match) return undefined;
  // Everything after `--` is a note for the reader, the way other linters spell it.
  const listed = (match[2] ?? "").split("--")[0] ?? "";
  return {
    spelling: `valof-lint-disable${match[1] ?? ""}`,
    kinds: [...new Set(listed.split(/[\s,]+/).filter(Boolean))],
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
  lines: Lines,
): Directive[] {
  const lineOf = (offset: number): number => Lines.at(lines, offset).line;
  const found: Directive[] = [];
  /** The line directives of the block being read, held until its last line is known. */
  let block: { at: Position; spelling: string; kinds: string[] }[] = [];
  /** The last line of that block, or -1 when the previous comment closed one. */
  let blockEnd = -1;
  /** Where that comment ended, so code written after it on its own line breaks the block. */
  let blockEndOffset = 0;

  const close = (): void => {
    for (const carried of block) found.push(Directive.seal({ ...carried, covers: blockEnd + 1 }));
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
      const written = { at: Lines.at(lines, comment.start), ...carried };
      if (carried.spelling === "valof-lint-disable-next-line") block.push(written);
      else found.push(Directive.seal({ ...written, covers: "file" }));
    }
    blockEnd = lineOf(comment.end);
    blockEndOffset = comment.end;
  }
  close();
  return found;
}

/**
 * The directives of each file in a run, by the path the file was scanned under.
 *
 * A directive silences the report, not the fact behind it: the other alias claiming a duplicate
 * brand is still reported, since silencing it is its own line's decision.
 */
export type DirectiveMap = Val<"DirectiveMap", Record<string, Directive[]>>;
export const DirectiveMap = Val.companion<DirectiveMap>()
  .implAssoc(({ seal }) => ({
    from: (scans: readonly Scan[]): DirectiveMap =>
      seal(Object.fromEntries(scans.map((scanned) => [scanned.file, scanned.directives]))),
  }))
  .impl(() => ({
    /** Whether a directive in the file silences a finding of `kind` on `line`. */
    silences: (map, file: string, line: number, kind: string) =>
      ((Object.hasOwn(map, file) ? map[file] : undefined) ?? []).some((directive) =>
        Directive.silences(directive, line, kind),
      ),
  }))
  .build();

function named(kinds: Iterable<string>): Silenced {
  return Silenced.Named.create({ kinds: KindSet.create(kinds) });
}
