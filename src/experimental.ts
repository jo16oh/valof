/**
 * Experimental API, published from its own subpath so an import says so.
 *
 * The design is still changing.
 */

export { Enum } from "./enum.ts";

export type {
  AnyEnum,
  EnumBuilder,
  EnumCompanion,
  EnumSealed,
  EnumSealer,
  EnumSealerSteps,
  EnumSteps,
  NameOf,
  SealedPayload,
  SeedFor,
  SharedOf,
  Tag,
  TagOf,
  VariantOf,
  VariantsOf,
} from "./enum.ts";

export { Trait } from "./trait.ts";

export type { AnyTrait, Dyn, Final, Members, Self, TraitBuilder, TraitCompanion } from "./trait.ts";
