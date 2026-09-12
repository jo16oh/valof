import { dirname, extname, normalize, resolve } from "node:path";

export type ImportBinding = { name: string; module: string };

/** A Val or Trait name together with its comparison identity. */
export type SymbolRef = {
  /** The declaration or export name used in diagnostics. */
  name: string;
  /** Opaque identity of the declaring module and its name there. */
  key: string;
};

/**
 * How one file bound the names it uses.
 *
 * File-local, all of them: a name imported here says nothing about the same name elsewhere. The
 * walk fills these in as it goes, so anything reading them must run inside or after it.
 */
export type Bindings = {
  /** local name -> the exporting module and the name it exports. */
  imported: Map<string, ImportBinding>;
  /** `import * as ns`: local namespace name -> exporting module. */
  namespaces: Map<string, string>;
  /** Locals holding a builder, so `const seal = Val.sealer<X>(); seal.impl({…})` is seen. */
  builders: Set<string>;
  /** Locals holding a `Trait.companion` builder. */
  traitBuilders: Set<string>;
};

export const bindings = (): Bindings => ({
  imported: new Map(),
  namespaces: new Map(),
  builders: new Set(),
  traitBuilders: new Set(),
});

/** The name the exporting module uses, or the local one when it was not imported. */
export const original = ({ imported }: Bindings, local: string): string =>
  imported.get(local)?.name ?? local;

const key = (module: string, name: string): string => `${module}\0${name}`;

/** A name exported by a known module. */
export const moduleRef = (module: string, name: string): SymbolRef => ({
  name,
  key: key(module, name),
});

/** A local declaration, named import, or namespace member as one comparable reference. */
export function symbolRef(
  file: string,
  bound: Bindings,
  local: string,
  qualifier?: string,
): SymbolRef {
  const module = normalize(resolve(file));
  if (qualifier !== undefined) {
    const importedModule = bound.namespaces.get(qualifier);
    return moduleRef(importedModule ?? `${module}\0namespace:${qualifier}`, local);
  }
  const imported = bound.imported.get(local);
  return imported ? moduleRef(imported.module, imported.name) : moduleRef(module, local);
}

/** Resolves relative module specifiers against the files in this lint run. */
export function moduleResolver(files: readonly string[]): (file: string, source: string) => string {
  const known = new Set(files.map((file) => normalize(resolve(file))));
  return (file, source) => {
    if (!source.startsWith(".")) return `package:${source}`;
    const base = normalize(resolve(dirname(file), source));
    const extension = extname(base);
    const candidates = extension
      ? [
          base,
          ...({ ".js": [".ts", ".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] }[extension] ?? []).map(
            (typescript) => `${base.slice(0, -extension.length)}${typescript}`,
          ),
        ]
      : [
          base,
          ...[".ts", ".tsx", ".mts", ".cts"].map((extension) => `${base}${extension}`),
          ...["index.ts", "index.tsx", "index.mts", "index.cts"].map((entry) =>
            resolve(base, entry),
          ),
        ];
    return candidates.find((candidate) => known.has(candidate)) ?? base;
  };
}
