/**
 * valof's public surface, and nothing else. The library itself is `./val.ts`; what is
 * not named below is internal to the package, which is how the tests can reach
 * `deepEquals` without it being something a user can call.
 *
 * Adding an export is harmless; removing one is a breaking change. The list stays as
 * short as it can be for that reason.
 */

/**
 * `Val` is both the type and the namespace — one re-export carries both meanings.
 *
 * `deepEquals` is deliberately not among these. It is the default `equals` every
 * companion already carries, and as a free function it would be a silent way past a
 * type's own `equals`; an override receives it as a third argument instead (design §5).
 */
export { Val } from "./val.ts";

export type {
  AnyVal,
  BrandOf,
  Companion,
  CompanionBuilder,
  CompanionMethods,
  DeepReadonly,
  Input,
  Invalid,
  OptionalKeys,
  Patch,
  PayloadOf,
  Primitive,
  Revalidator,
  Sealed,
  Sealer,
  Validate,
} from "./val.ts";
