import { dirname, extname, normalize, resolve } from "node:path";

import { Val } from "../../lib/index.ts";
import type { FilePath } from "../shared/files.ts";

/** What an import binds a local name to: the exporting module and the name it exports. */
export type ImportBinding = Val<"ImportBinding", { name: string; module: string }>;
export const ImportBinding = Val.companion<ImportBinding>().build();

/**
 * What a file imported: local name -> {@link ImportBinding}.
 *
 * Looked up by own key, since a local name can be `constructor` or `toString`.
 */
export type ImportMap = Val<"ImportMap", Record<string, ImportBinding>>;
export const ImportMap = Val.companion<ImportMap>()
  .impl(() => ({
    has: (imports, local: string) => Object.hasOwn(imports, local),
    get: (imports, local: string) => own(imports, local),
    /** The name the exporting module uses, or the local one when the file did not import it. */
    nameOf: (imports, local: string) => own(imports, local)?.name ?? local,
  }))
  .build();

/** A Val or Trait name together with its comparison identity. */
export type SymbolRef = Val<
  "SymbolRef",
  {
    /** The declaration or export name used in diagnostics. */
    name: string;
    /** Opaque identity of the declaring module and its name there. */
    key: string;
  }
>;
export const SymbolRef = Val.companion<SymbolRef>()
  .implAssoc(({ seal }) => ({
    /** A name exported by a known module. */
    fromExport: (module: string, name: string): SymbolRef =>
      seal({ name, key: `${module}\0${name}` }),
  }))
  .build();

/**
 * How one file bound the names it uses.
 *
 * File-local, all of them: a name imported here says nothing about the same name elsewhere. The
 * walk fills these in as it goes, so anything reading them must run inside or after it.
 */
export type Bindings = Val<
  "Bindings",
  {
    imported: ImportMap;
    /** `import * as ns`: local namespace name -> exporting module. */
    namespaces: Record<string, string>;
    /**
     * Locals holding a builder, under the root it grew from, so `const built =
     * Val.companion<X>(); built.impl(() => ({…}))` is seen.
     */
    builders: Record<string, string>;
  }
>;
export const Bindings = Val.companion<Bindings>()
  .implCreate(() => ({ imported: ImportMap.seal({}), namespaces: {}, builders: {} }))
  .impl(() => ({
    hasNamespace: (bound, local: string) => Object.hasOwn(bound.namespaces, local),
    builderOf: (bound, local: string) => own(bound.builders, local),
    /** The name the exporting module uses, or the local one when it was not imported. */
    originalName: (bound, local: string) => ImportMap.nameOf(bound.imported, local),
    /**
     * A local declaration, named import, or namespace member as one comparable reference.
     * `qualifier` is the namespace it was reached through, or `undefined`.
     */
    refOf: (bound, file: FilePath, local: string, qualifier: string | undefined): SymbolRef => {
      const module = normalize(resolve(file));
      if (qualifier !== undefined) {
        // The module `import * as ns` bound `ns` to, when `ns` is a namespace.
        const importedModule = own(bound.namespaces, qualifier);
        return SymbolRef.fromExport(importedModule ?? `${module}\0namespace:${qualifier}`, local);
      }
      const imported = ImportMap.get(bound.imported, local);
      return imported
        ? SymbolRef.fromExport(imported.module, imported.name)
        : SymbolRef.fromExport(module, local);
    },
  }))
  .build();

/** The files in this lint run, which a relative module specifier resolves against. */
export type Modules = Val<"Modules", { known: Record<string, true> }>;
export const Modules = Val.companion<Modules>()
  .implCreate((files: readonly string[]) => ({
    known: Object.fromEntries(files.map((file) => [normalize(resolve(file)), true as const])),
  }))
  .impl(() => ({
    /** The module `source` names from `file`: a file in the run, or a package. */
    resolve: (modules, file: FilePath, source: string) => {
      if (!source.startsWith(".")) return `package:${source}`;
      const base = normalize(resolve(dirname(file), source));
      const extension = extname(base);
      const candidates = extension
        ? [
            base,
            ...(
              { ".js": [".ts", ".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] }[extension] ?? []
            ).map((typescript) => `${base.slice(0, -extension.length)}${typescript}`),
          ]
        : [
            base,
            ...[".ts", ".tsx", ".mts", ".cts"].map((extension) => `${base}${extension}`),
            ...["index.ts", "index.tsx", "index.mts", "index.cts"].map((entry) =>
              resolve(base, entry),
            ),
          ];
      return candidates.find((candidate) => Object.hasOwn(modules.known, candidate)) ?? base;
    },
  }))
  .build();

/** An own entry of a record, never one inherited from `Object.prototype`. */
function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
