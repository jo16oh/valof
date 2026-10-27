export { equals, Val } from "./val.ts";

/**
 * `Companion` and `CompanionBuilder` are exported for the names alone: a downstream package never
 * writes them, but its emitted declarations reference them, and without a name TypeScript inlines
 * the structure instead, which bloats a consumer's `.d.ts` by orders of magnitude. The rest are the
 * ones a caller writes for themselves.
 */
export type {
  AnyVal,
  Companion,
  CompanionBuilder,
  Patch,
  PayloadOf,
  PrivateCreate,
  PrivateSeal,
  Rec,
  SeedOf,
  Unpatchable,
} from "./val.ts";

export { Enum, Otherwise, Tag } from "./enum.ts";

export type {
  AnyEnum,
  EnumBuilder,
  EnumCompanion,
  NameOf,
  VariantOptions,
  SealedPayload,
  SeedFor,
  SharedOf,
  TagOf,
  VariantOf,
  VariantsOf,
} from "./enum.ts";

export { Trait } from "./trait.ts";

export type { AnyTrait, Dyn, Final, Members, Self, TraitBuilder, TraitCompanion } from "./trait.ts";
