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

/**
 * Two kinds of type, and nothing else.
 *
 * `Companion`, `CompanionBuilder`, `Sealed` and `Sealer` are what `Val.sealer` and
 * `Val.companion` infer. A downstream package never writes them, but its emitted
 * declarations reference them, and without a name TypeScript inlines the structure
 * instead: dropping `CompanionBuilder` alone — it is self-referential through
 * `implFrom` / `implCreate` — takes a small consumer's `.d.ts` from 3 KB to 956 KB.
 *
 * `AnyVal`, `Seed`, `Patch` and `PayloadOf` are the ones a caller writes for
 * themselves: a constraint over any Val, a constructor's argument, a `with` patch, the
 * payload behind the brand.
 *
 * Everything else is internal. `Primitive`, `Validate`, `DeepReadonly`, `OptionalKeys`
 * and `Invalid` only ever appear inside a resolved `Val<K, T>` — `Invalid<"...">` still
 * shows up by name in diagnostics without being exported. `BrandOf`, `CompanionMethods`
 * and `Revalidator` are nameable but had no use worth a one-way door: `.impl` and
 * `.implFrom` type their arguments contextually, so nobody has to spell the constraint.
 */
export type {
  AnyVal,
  Companion,
  CompanionBuilder,
  Patch,
  PayloadOf,
  Sealed,
  Sealer,
  Seed,
} from "./val.ts";
