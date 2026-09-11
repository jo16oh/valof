/**
 * How one file bound the names it uses.
 *
 * File-local, all of them: a name imported here says nothing about the same name elsewhere. The
 * walk fills these in as it goes, so anything reading them must run inside or after it.
 */
export type Bindings = {
  /** local name -> the name the exporting module uses. */
  imported: Map<string, string>;
  /** `import * as ns`: reads through one arrive already named as that module names them. */
  namespaces: Set<string>;
  /** Locals holding a builder, so `const seal = Val.sealer<X>(); seal.impl({…})` is seen. */
  builders: Set<string>;
  /** Locals holding a `Trait.companion` builder. */
  traitBuilders: Set<string>;
};

export const bindings = (): Bindings => ({
  imported: new Map(),
  namespaces: new Set(),
  builders: new Set(),
  traitBuilders: new Set(),
});

/** The name the exporting module uses, or the local one when it was not imported. */
export const original = ({ imported }: Bindings, local: string): string =>
  imported.get(local) ?? local;
