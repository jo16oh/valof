import { Val } from "../../src/index.ts";

export type Imports = Val<"Imports", Record<string, string[]>>;
export const Imports = Val.sealer<Imports>().impl({
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

export type Bundle = Val<
  "Bundle",
  {
    /** The key in the `--json` output, which `replace-bundle-size-claims` reads. */
    key: string;
    name: string;
    /** A base bundle is capped by its whole size, any other by what it adds to the base. */
    base?: boolean;
    imports: Imports;
    budget: number;
  }
>;
export const Bundle = Val.sealer<Bundle>();
