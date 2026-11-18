import { Enum, Val } from "../../lib/index.ts";
import { pipe } from "../../shared/pipe/index.ts";
import { Lines, type Position } from "../parse/ast.ts";
import type { FilePath } from "../shared/files.ts";
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
     * `valof-lint-disable` alone, which names no scope and is reported.
     */
    spelling: string;
  }
>;
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
 * The directives of each file in a run, by the path the file was scanned under.
 *
 * A directive silences the report, not the fact behind it: the other alias claiming a duplicate
 * brand is still reported, since silencing it is its own line's decision.
 */
export type DirectiveMap = Val.Record<"DirectiveMap", FilePath, Directive[]>;
export const DirectiveMap = Val.Record.companion<DirectiveMap>()
  .implAssoc(({ fromEntries }) => ({
    from: (scans: readonly Scan[]): DirectiveMap =>
      fromEntries(scans.map((scanned) => [scanned.file, scanned.directives] as const)),
  }))
  .impl(() => ({
    /** Whether a directive in the file silences a finding of `kind` on `line`. */
    silences: (map, file: FilePath, line: number, kind: string) =>
      ((Object.hasOwn(map, file) ? map[file] : undefined) ?? []).some((directive) =>
        Directive.silences(directive, line, kind),
      ),
  }))
  .build();

/**
 * Every directive in one file, at its own comment rather than the line it covers, since two rules
 * ask about the directive itself.
 *
 * A `valof-lint-disable-next-line` may sit anywhere in the comment block above its line: a run of
 * own-line comments with no blank line or code between them. A whole-file directive may sit
 * anywhere.
 */
export function directives(
  comments: readonly { value: string; start: number; end: number }[],
  source: string,
  lines: Lines,
): Directive[] {
  const lineOf = (offset: number): number => Lines.at(lines, offset).line;
  const found: Directive[] = [];
  /** The line directives of the block being read, held until its last line is known. */
  let block: DirectiveComment[] = [];
  /** The last line of that block, or -1 when the previous comment closed one. */
  let blockEnd = -1;
  /** Where that comment ended, so code written after it on its own line breaks the block. */
  let blockEndOffset = 0;

  const close = (): void => {
    for (const carried of block) {
      found.push(Directive.seal({ ...carried, covers: blockEnd + 1 }));
    }
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
    if (!joins) {
      close();
    }
    const written = DirectiveComment.parse(comment.value, Lines.at(lines, comment.start));
    if (written?.spelling === "valof-lint-disable-next-line") {
      block.push(written);
    } else if (written) {
      found.push(Directive.seal({ ...written, covers: "file" }));
    }
    blockEnd = lineOf(comment.end);
    blockEndOffset = comment.end;
  }
  close();
  return found;
}

/**
 * The names one disable comment lists, as a set. A name is what the author wrote, which no rule may
 * have: `unused-disable` reports such a name, so it is kept rather than checked against the rules.
 */
type NameSet = Val.Record<"NameSet", string, true>;
const NameSet = Val.Record.companion<NameSet>().build();

/** What a directive silences: the names it listed, or every kind there is. */
type Silenced = Enum<"Silenced", { Every: {}; Named: { names: NameSet } }>;
const Silenced = Enum.companion<Silenced>()
  .impl(() => ({
    has: (silenced, kind: string) => silenced._tag === "Every" || NameSet.has(silenced.names, kind),
  }))
  .build();

/** A directive as its comment writes it, before the line it covers is known. */
type DirectiveComment = Val<
  "DirectiveComment",
  { at: Position; spelling: string; kinds: string[] }
>;
const DirectiveComment = Val.companion<DirectiveComment>()
  .implAssoc(({ seal }) => ({
    /**
     * What one comment carries, or `undefined` when it carries no directive. Names are separated by a
     * space or a comma. Nothing but a space may follow a spelling, so `valof-lint-disable-nextline`
     * silences nothing.
     */
    parse: (text: string, at: Position): DirectiveComment | undefined => {
      const match =
        /(?:^|\s)valof-lint-disable(-next-line|-all-whole-file|-whole-file)?(?![-\w])(?:[^\S\n]+([^\n]*))?/.exec(
          text,
        );
      if (!match) return undefined;
      return seal({
        at,
        spelling: `valof-lint-disable${match[1] ?? ""}`,
        kinds: pipe(
          // Everything after `--` is a note for the reader, the way other linters spell it.
          (match[2] ?? "").split("--")[0] ?? "",
          (listed) => listed.split(/[\s,]+/).filter(Boolean),
          (names) => [...new Set(names)],
        ),
      });
    },
  }))
  .build();

/**
 * What one directive silences. Naming no rule on a line means every kind there, since a directive
 * that silenced nothing would bury the finding it was written to hold back. Naming none over a
 * whole file means nothing, since silencing would hide the report about the directive itself.
 * `valof-lint-disable-all-whole-file` turns a file off.
 */
function effect({ spelling, kinds }: Directive): Silenced {
  if (spelling === "valof-lint-disable-all-whole-file") return Silenced.Every.create({});
  if (spelling === "valof-lint-disable") return named([]);
  if (kinds.length > 0) return named(kinds);
  return spelling === "valof-lint-disable-next-line" ? Silenced.Every.create({}) : named([]);
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

function named(names: Iterable<string>): Silenced {
  return Silenced.Named.create({
    names: NameSet.fromEntries([...names].map((name) => [name, true] as const)),
  });
}
