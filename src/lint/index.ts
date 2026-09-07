import { duplicateBrands, type DuplicateBrand } from "./rules/brands.ts";
import { resolver } from "./definitions.ts";
import { needsTypes, structuralEquals, type StructuralEquals } from "./rules/equals.ts";
import { scan, type Parser } from "./scan.ts";
import { unusedMembers, type UnusedMember } from "./rules/unused.ts";

export type { UnusedMember } from "./rules/unused.ts";
export type { DuplicateBrand } from "./rules/brands.ts";
export type { StructuralEquals } from "./rules/equals.ts";

export type Finding = UnusedMember | DuplicateBrand | StructuralEquals;

/**
 * Reports what the type checker cannot: companion members nothing reads, a brand string claimed
 * by more than one type alias, and a parent that structurally compares a child carrying its own
 * equality.
 *
 * Every file is walked once, by {@link scan}, and the rules run over what it collected. They see
 * every file rather than one, which is what lets a read in one module answer for a declaration in
 * another.
 *
 * The parser is loaded here rather than imported at the top: it is an optional peer dependency,
 * and a static import would be hoisted above the caller's own error handling once bundled,
 * turning a missing install into a stack trace instead of an instruction.
 */
export async function lint(files: readonly string[]): Promise<Finding[]> {
  const parser = (await import("oxc-parser")) as unknown as Parser;
  const scans = files.map((file) => scan(file, parser));

  // Only the structural-equals rule resolves type references, which costs a TypeScript the
  // project may not have. Absent one it reports nothing. See {@link needsTypes}.
  const types = needsTypes(scans) ? resolver(process.cwd(), files) : undefined;
  let structural: StructuralEquals[] = [];
  try {
    structural = await structuralEquals(scans, types);
  } finally {
    types?.close();
  }

  /**
   * A directive silences the report, not the fact behind it: the other alias claiming a duplicate
   * brand is still reported, since silencing it is its own line's decision.
   */
  const disabled = new Map(scans.map(({ file, disabled: lines }) => [file, lines]));
  const silenced = ({ file, line, kind }: Finding): boolean => {
    const kinds = disabled.get(file)?.get(line);
    return kinds !== undefined && (kinds.size === 0 || kinds.has(kind));
  };

  return [...unusedMembers(scans), ...duplicateBrands(scans), ...structural]
    .filter((finding) => !silenced(finding))
    .sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind),
    );
}
