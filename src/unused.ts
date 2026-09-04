import { readFileSync } from "node:fs";
import type { SgNode } from "@ast-grep/napi";

/** One companion member that nothing in the scanned files reads. */
export type Unused = {
  /** The companion's declared name, as written at its declaration site. */
  companion: string;
  /** The member's key. */
  member: string;
  file: string;
  /** 1-based, for an editor. */
  line: number;
};

/**
 * Attached by `attach` rather than written in `.impl`, or written there as an override of one.
 * An override is part of the type's contract even when this project never calls it, so none of
 * these are ever reported.
 */
const BUILTIN = new Set(["equals", "with", "update", "seal", "create"]);

const unquote = (text: string): string => text.replace(/^["'`]|["'`]$/g, "");

function collect<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(value);
}

/** The top-level keys of an object literal, covering `k: v`, `k(){}` and shorthand alike. */
function keysOf(object: SgNode): { key: string; line: number }[] {
  const keys: { key: string; line: number }[] = [];
  for (const child of object.children()) {
    const line = child.range().start.line + 1;
    const kind = child.kind();
    if (kind === "pair") {
      const key = child.field("key");
      if (key) keys.push({ key: unquote(key.text()), line });
    } else if (kind === "method_definition") {
      const name = child.field("name");
      if (name) keys.push({ key: unquote(name.text()), line });
    } else if (kind === "shorthand_property_identifier") {
      keys.push({ key: child.text(), line });
    }
  }
  return keys;
}

/**
 * Reports companion members that no scanned file reads.
 *
 * Two passes over the same files: one collects what each `.impl({…})` declares, the other every
 * way a name is read off an identifier. They meet on the companion's declared name, so an import
 * that renames it is resolved through the import specifier.
 *
 * Resolution is by name, not by type. A member reached in a way no name follows (through
 * `export { X as Y }`, `import * as ns`, a computed key, or a spread of another object into
 * `.impl`) is assumed to be used, so a miss is a false negative and never a false positive.
 *
 * The parser is loaded here rather than imported at the top: it is an optional peer dependency,
 * and a static import would be hoisted above the caller's own error handling once bundled,
 * turning a missing install into a stack trace instead of an instruction.
 */
export async function findUnused(files: readonly string[]): Promise<Unused[]> {
  const { ts } = await import("@ast-grep/napi");
  /** companion name -> its members, with where each was declared */
  const declared = new Map<string, Map<string, { file: string; line: number }>>();
  /** local identifier -> the keys read off it */
  const reads = new Map<string, Set<string>>();
  /** local identifier -> the name it was imported under */
  const imported = new Map<string, string>();

  for (const file of files) {
    const root = ts.parse(readFileSync(file, "utf8")).root();

    for (const match of root.findAll({ rule: { pattern: "const $N = $B.impl($OBJ)" } })) {
      const name = match.getMatch("N");
      const object = match.getMatch("OBJ");
      // `.impl()` takes no argument, and `.impl(fns)` passes a variable this cannot see into.
      if (!name || !object || object.kind() !== "object") continue;
      let members = declared.get(name.text());
      if (!members) declared.set(name.text(), (members = new Map()));
      for (const { key, line } of keysOf(object)) {
        if (!BUILTIN.has(key)) members.set(key, { file, line });
      }
    }

    for (const match of root.findAll({ rule: { pattern: "import { $$$SPECS } from $_" } })) {
      for (const spec of match.getMultipleMatches("SPECS")) {
        if (spec.kind() !== "import_specifier") continue;
        const name = spec.field("name");
        if (!name) continue;
        imported.set(spec.field("alias")?.text() ?? name.text(), name.text());
      }
    }

    for (const [pattern, metavar] of [
      ["$N.$K", "K"],
      ["$N[$K]", "K"],
    ] as const) {
      for (const match of root.findAll({ rule: { pattern } })) {
        const name = match.getMatch("N");
        const key = match.getMatch(metavar);
        if (name && key) collect(reads, name.text(), unquote(key.text()));
      }
    }

    for (const match of root.findAll({ rule: { pattern: "const {$$$P} = $N" } })) {
      const name = match.getMatch("N");
      if (!name) continue;
      for (const property of match.getMultipleMatches("P")) {
        if (property.kind() === ",") continue;
        // `{ a: b }` renames on the way out; the companion's own key is the left half.
        collect(reads, name.text(), property.text().split(":")[0]?.trim() ?? "");
      }
    }
  }

  const read = new Map<string, Set<string>>();
  for (const [local, keys] of reads) {
    const name = imported.get(local) ?? local;
    for (const key of keys) collect(read, name, key);
  }

  const unused: Unused[] = [];
  for (const [companion, members] of declared) {
    for (const [member, where] of members) {
      if (!read.get(companion)?.has(member)) unused.push({ companion, member, ...where });
    }
  }
  return unused.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
