// The types a user writes. A user's emitted declarations reference the builder and companion types
// through `valof/internal/*`, so the entry does not export them.
export { equals, Val } from "./val.ts";

export type {
  Payload,
  PayloadOf,
  PrivateCreate,
  PrivateSeal,
  Rec,
  SeedOf,
  Unpatchable,
} from "./val.ts";

export { Enum, Otherwise, Tag } from "./enum.ts";

export type { VariantOptions, SealedPayload, VariantOf, VariantsOf } from "./enum.ts";

export { Trait } from "./trait.ts";

export type { Dyn, Final, Impl, Self } from "./trait.ts";
