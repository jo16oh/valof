export { Val } from "./val.ts";

/**
 * `Companion`, `CompanionBuilder`, `Sealed` and `Sealer` are exported for the names alone: a
 * downstream package never writes them, but its emitted declarations reference them, and
 * without a name TypeScript inlines the structure instead, which bloats a consumer's `.d.ts`
 * by orders of magnitude. The rest are the ones a caller writes for themselves.
 */
export type {
  AnyVal,
  Companion,
  CompanionBuilder,
  Patch,
  PayloadOf,
  Sealed,
  Sealer,
  SeedOf,
} from "./val.ts";
