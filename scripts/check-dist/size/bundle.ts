import { Val } from "#valof";

export type Imports = Val<"Imports", Record<string, string[]>>;
export const Imports = Val.companion<Imports>()
  .impl(({ seal }) => ({
    names: (imports) => Object.values(imports).flat(),
    merge: (imports, other: Imports) => {
      const merged: Record<string, string[]> = {};
      for (const source of [imports, other]) {
        for (const [module, names] of Object.entries(source)) {
          merged[module] = [...new Set([...(merged[module] ?? []), ...names])];
        }
      }

      return seal(merged);
    },
  }))
  .build();

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
export const Bundle = Val.companion<Bundle>().build();
