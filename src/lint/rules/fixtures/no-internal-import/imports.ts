import { Val, type SeedOf } from "valof";
import type { Nocopy } from "valof/internal/val";
export * from "valof/internal/enum";
export type { AnyVal } from "valof/internal/val";
export * as Internal from "valof/internal/trait";
// Only a path under `valof/internal/` is reported.
export { Val as Valof } from "valof";
// @ts-expect-error a path the fixtures do not resolve
import plugin from "valof/eslint-plugin";
// @ts-expect-error nor this one, which is not under `valof/internal/`
import type { Near } from "valof/internals";

type User = Val<"User", { id: string }>;
export type Seal = Nocopy<User>;
export type Seed = SeedOf<User>;
export type Plugin = typeof plugin | Near;
