import { Val } from "../../src/index.ts";

/** The names a bundle imports, per module. */
export type Imports = Val<"Imports", Record<string, string[]>>;
export const Imports = Val.sealer<Imports>().impl({
  /** What the bundle imports, as the printed heading spells it. */
  names: (imports): string[] => Object.values(imports).flat(),
  merge: (imports, other: Imports): Imports => {
    const merged: Record<string, string[]> = {};
    for (const source of [imports, other]) {
      for (const [module, names] of Object.entries(source)) {
        merged[module] = [...new Set([...(merged[module] ?? []), ...names])];
      }
    }
    return Imports(merged);
  },
});

/**
 * A bundle a user ships, and its budget in production gzip. A ratchet, unlike the budgets in
 * `type-perf`: runtime code is written deliberately, so a byte more is a decision, not drift.
 *
 * The declarations are not measured here. They cost a download and a parse, never a byte in the
 * user's bundle, and `type-perf` already measures what reads them.
 */
export type Bundle = Val<
  "Bundle",
  {
    /** The key in the `--json` output, which `replace-bundle-size-claims` reads. */
    key: string;
    /** The bundle's name in the budget table. */
    name: string;
    /**
     * Whether the bundle joins the base, which every base bundle forms together. A base bundle is
     * capped by its whole size. Every other bundle is measured on top of the base and capped by
     * what it adds, so growth in the base spends only the base's room: what an import costs is the
     * number to read.
     */
    base?: boolean;
    imports: Imports;
    budget: number;
  }
>;
export const Bundle = Val.sealer<Bundle>();
