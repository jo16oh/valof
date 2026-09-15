/**
 * Provisional API, published from its own subpath so an import says so.
 *
 * Everything here may change in a minor release. `valof` itself keeps the versioning policy the
 * README states; this subpath does not.
 */

export { Trait } from "./trait.ts";

export type { AnyTrait, Dyn, Final, Members, Self, TraitBuilder, TraitCompanion } from "./trait.ts";
