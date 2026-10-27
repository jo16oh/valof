// Type-only, so nothing from enum.ts crosses at run time. The phantom stays in enum.ts, beside
// the declaration that carries it.
import type { AnyEnum } from "./enum.ts";
import type {
  AnyTrait,
  FinalsOf,
  Implement,
  MembersOf,
  NamesOf,
  ShapeOf,
  TraitBrand,
  TraitCompanion,
  TraitHost,
  TraitsOf,
  Unbound,
} from "./trait.ts";
import { createMembers, dual } from "./dual.ts";
import { Shared, Traits } from "./keys.ts";
import type {
  NoSeal,
  PhantomBrand,
  PhantomPayload,
  PhantomTypes,
  PrivateCreateKey,
  PrivateSealKey,
  RecKey,
  Unbuilt,
  UnpatchableKey,
  UnpatchableTypes,
  VerdictKey,
} from "./keys.ts";
import type { Arity, Dual, Duals, LooseArity, Looses } from "./dual.ts";
import { development } from "./env.ts";
import * as Val from "./ns/val.ts";

/** Primitives allowed as values. `undefined` is deliberately excluded. */
type Primitive = string | number | boolean | bigint | null;

/** Type-only nominal identity. Private members disappear from `keyof` and object spreads. */
declare class Phantom<K extends string, T> {
  private readonly [PhantomBrand]: K;
  private readonly [PhantomPayload]: T;
  /** Declaration emit erases private field types; protected keeps the type arguments recoverable. */
  protected readonly [PhantomTypes]: readonly [K, T];
}

/**
 * The payload's verdict, read at every gate through {@link AnyVal}. A private field is not read
 * while a type alias resolves, which is what lets a Val reference itself: see {@link Rec}.
 */
export declare class Verdict<X> {
  private readonly [VerdictKey]: X;
}

export type AnyVal = Phantom<string, unknown> & Verdict<true>;

/**
 * A deferred reference to a Val, so a type can reference itself. It is erased from the value and
 * from the payload a constructor takes, so it appears in the declaration alone.
 *
 * ```ts
 * type Tree = Val<"app/Tree", { value: number; children: Rec<Tree>[] }>;
 * const Tree = Val.companion<Tree>().build();
 *
 * const leaf = Tree.seal({ value: 1, children: [] });
 * const root = Tree.seal({ value: 2, children: [leaf] });
 * root.children[0]; // Tree
 * ```
 *
 * Write it around the type being declared and nothing else. `Rec<number>` erases to `number`, and
 * `Rec<Other>` to `Other`: neither is a type error, so nothing reports either one.
 */
// The type parameter is unconstrained because checking a constraint would resolve the type that is
// still being declared, which is the circularity this breaks.
export interface Rec<V> {
  readonly [RecKey]: V;
}

/** Marker surfaced in the type when a declaration violates the allowed-type rules. */
export type Invalid<Msg extends string> = { readonly __valError: Msg };

/** Distributes, so each constituent is compared against the whole: they differ only in a union. */
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : false;

type OptionalKeys<T> = {
  [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? K : never;
}[keyof T];

/**
 * Read by key, never by assignability: comparing `Rec<Tree>` against `Rec<unknown>` reads the
 * type argument, and that is the resolution `Rec` exists to defer. A string or symbol index
 * signature matches every key of its kind, so both are excluded first.
 */
type IsRec<T> = string extends keyof T
  ? false
  : symbol extends keyof T
    ? false
    : keyof Rec<unknown> extends keyof T
      ? true
      : false;

type Validate<T, Root extends boolean = true> =
  IsRec<T> extends true
    ? T
    : [T] extends [AnyVal]
      ? T
      : Root extends true
        ? null extends T
          ? Invalid<"a top-level payload cannot include null; null cannot carry a Val brand">
          : ValidateValue<T>
        : ValidateValue<T>;

type ValidateValue<T> = [T] extends [Primitive]
  ? T
  : [T] extends [ReadonlyArray<infer E>]
    ? number extends T["length"]
      ? ReadonlyArray<Validate<E, false>>
      : {
          // An optional element is the tuple's form of an optional key: absent, it round trips.
          // `Required<T>` tells the two apart, since only the optional one loses its `undefined`.
          [I in keyof T]: undefined extends Required<T>[I]
            ? Invalid<"a tuple element cannot be undefined; use null or make it optional">
            : Validate<Exclude<T[I], undefined>, false>;
        }
    : // oxlint-disable-next-line no-unsafe-function-type
      [T] extends [Function]
      ? Invalid<"functions are not allowed">
      : [T] extends [object]
        ? IsUnion<T> extends true
          ? Invalid<"an object payload cannot be a union; patch merges, so it cannot switch variants">
          : [Exclude<keyof T, string>] extends [never]
            ? {
                // An index signature answers `Record<never, never> extends Pick<T, K>`, so
                // `OptionalKeys` counts it as optional. Its entries are not optional: reading one
                // is unchecked, and widening it with `undefined` breaks `Object.values`.
                [K in keyof T]: string extends K
                  ? Validate<T[K], false>
                  : K extends OptionalKeys<T>
                    ? Validate<Exclude<T[K], undefined>, false> | undefined
                    : undefined extends T[K]
                      ? Invalid<"required property cannot be undefined; use null or make it optional">
                      : Validate<T[K], false>;
              }
            : Invalid<"keys must be strings; a number or symbol key does not survive a JSON round trip">
        : Invalid<"not a plain value">;

/**
 * A {@link Rec} opens to the Val it references. `Arg` marks an argument position, where an empty
 * object is narrowed to {@link EmptySeed}.
 */
export type DeepReadonly<T, Arg extends boolean = false> =
  IsRec<T> extends true ? (T extends Rec<infer V> ? V : T) : DeepReadonlyValue<T, Arg>;

/** Recursion stops at a nested Val: it is already deep-readonly. */
type DeepReadonlyValue<T, Arg extends boolean> = [T] extends [AnyVal]
  ? T
  : [T] extends [Primitive]
    ? T
    : // The numeric key, not `[T] extends [ReadonlyArray<unknown>]`: that reads a property named
      // after an array member, `entries` or `values`, and a `Rec` in one would resolve the type
      // still being declared. An array is the only payload with a numeric key.
      number extends keyof T
      ? number extends Extract<T, readonly unknown[]>["length"]
        ? ReadonlyArray<DeepReadonly<T[number], Arg>>
        : { readonly [I in keyof T]: DeepReadonly<T[I], Arg> }
      : [T] extends [object]
        ? [Arg, keyof T] extends [true, never]
          ? EmptySeed
          : {
              // An optional key carries `undefined` in its type, and a union stops the walk one
              // level short: a `Rec` inside it would never open. The value never holds the
              // `undefined` either way, since an optional key is absent or set.
              readonly [K in keyof T]: DeepReadonly<Exclude<T[K], undefined>, Arg>;
            }
        : T;

/**
 * An empty object as an argument: neither an array, a function nor a promise. `{}` takes every
 * value but `null` and `undefined`. An index signature would also reject an existing value and a
 * tagged payload.
 */
type EmptySeed = object & { readonly length?: never; readonly then?: never };

/** The payload, or the annotated version of it when it breaks the allowed-type rules. */
export type Checked<T> = [T] extends [Validate<T>] ? T : Validate<T>;

/**
 * `true` for a payload the rules allow that holds what the declared traits require, and the reason
 * otherwise. Every gate takes an {@link AnyVal}, which carries `Verdict<true>`, so a broken
 * declaration fails where the type is used.
 *
 * The check lives in a private field's type. That position is not read while a type alias
 * resolves, which is what lets a payload reference the Val it belongs to: comparing the payload
 * against its validated form reads its properties, and that is the circularity {@link Rec} cannot
 * break on its own.
 *
 * `T extends Validate<T>` is the natural spelling. On a type alias that is TS2313 "circular
 * constraint", hence the conditional.
 */
type Verdicted<T, Tr extends AnyTrait> = [T] extends [Validate<T>]
  ? Fits<T, Tr> extends true
    ? true
    : Invalid<Extract<Fits<T, Tr>, string>>
  : Validate<T>;

/** The declared payload, with the fields the traits require when it is a record. */
type Holding<T, Tr extends AnyTrait> = [Tr] extends [never]
  ? T
  : IsRecord<T> extends true
    ? T & Writable<ShapeOf<Tr>>
    : T;

/** Undoes the {@link DeepReadonly} a trait holds its shape in: a payload is written without it. */
export type Writable<T> = [T] extends [AnyVal] ? T : { -readonly [K in keyof T]: Writable<T[K]> };

/** Reads the keys alone: a field may reference the Val being declared, see {@link Rec}. */
type IsRecord<T> = [T] extends [Primitive] ? false : number extends keyof T ? false : true;

/**
 * Whether the declared payload agrees with its traits, or the sentence saying why not.
 *
 * `ShapeOf<A | B>` keeps only the keys the two share, so a union asks the payload for nothing.
 * Caught here, before the fields are read.
 */
type Fits<T, Tr extends AnyTrait> = [Tr] extends [never]
  ? true
  : [Tr] extends [UnionToIntersection<Tr>]
    ? IsRecord<T> extends false
      ? DeepReadonly<Checked<T>> extends ShapeOf<Tr>
        ? true
        : "the payload does not hold what the trait requires"
      : [Disagreement<T, ShapeOf<Tr>>] extends [never]
        ? true
        : Disagreement<T, ShapeOf<Tr>>
    : "declare several traits with `&`, not `|`";

/** A field the payload declares as a type the shape rejects, or one that no value satisfies. */
type Disagreement<T, S, R = DeepReadonly<Checked<T>>> = {
  [K in keyof S & string]-?: [K extends keyof R ? R[K] : S[K]] extends [infer F]
    ? [F] extends [never]
      ? `no value fits every declaration of ${Code<K>}`
      : F extends S[K]
        ? never
        : `the payload and the trait declare ${Code<K>} with conflicting types`
    : never;
}[keyof S & string];

// Spelled without an escaped backtick, which the declaration bundler drops the whole file over.
type Code<S extends string> = `${"`"}${S}${"`"}`;

// Distributes over the union to collect one parameter position per member, which infers as their
// intersection. A single trait is its own intersection, and so is `never`.
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

/**
 * The payload, or an empty object where the brand has nothing to attach to. `null & Phantom` is
 * `never`, and `never` satisfies every gate, so a payload the rules reject here would pass as a
 * value. The rule that rejected it is in the verdict either way.
 */
type Grounded<T> = [T] extends [{}] ? T : Record<never, never>;

/**
 * A branded value type. A declared trait adds the fields it requires to the payload.
 *
 * A payload that breaks the allowed-type rules is a type error, and so is one that contradicts a
 * declared trait.
 */
// Both land in the verdict, which stops the Val satisfying `AnyVal`. See `Verdicted`.
type Val<K extends string, T, Tr extends AnyTrait = never> = DeepReadonly<
  Grounded<Holding<T, Tr>>
> &
  Phantom<K, Holding<T, Tr>> &
  Verdict<Verdicted<T, Tr>> &
  TraitBrand<Tr>;

export { Val };

/** The Val's brand string. */
export type BrandOf<V extends AnyVal> = V extends Phantom<infer K, unknown> ? K : never;

/** The payload as the declaration wrote it, {@link Rec} markers included. */
type Declared<V> = V extends Phantom<string, infer T> ? T : never;

/**
 * The Val's payload type, with the brand removed at every depth: a nested Val, and the one a
 * {@link Rec} references, is its payload too.
 */
export type PayloadOf<V extends AnyVal> = Opened<Declared<V>>;

// Every nested Val and {@link Rec} opened to its payload, and nothing else changed: the `readonly`
// the declaration wrote stays, and so does the mutability {@link Val.unwrap} hands back. The marker
// is the declaration's, so no type derived from the payload may carry it.
//
// One mapped type covers an array and a tuple both: homomorphic over either, it keeps the length,
// the positions and the mutability. {@link DeepReadonly} needs the two apart only because it
// rewrites them.
type Opened<T> =
  IsRec<T> extends true
    ? T extends Rec<infer V>
      ? Opened<Declared<V>>
      : T
    : [T] extends [AnyVal]
      ? Opened<Declared<T>>
      : [T] extends [Primitive]
        ? T
        : number extends keyof T
          ? { [I in keyof T]: Opened<T[I]> }
          : [T] extends [object]
            ? { [K in keyof T]: Opened<Exclude<T[K], undefined>> }
            : T;

/**
 * The payload as constructors, `Val.of` and a custom seal accept it.
 *
 * Deep-readonly to accept more, not to enforce: every constructor except `nocopy` deep-copies its
 * argument. A Val is itself deep-readonly, so a payload taken from an existing value fits.
 */
export type SeedOf<V extends AnyVal> = DeepReadonly<Declared<V>, true>;

/** A conservative, structural guard for the default `nocopy` constructor. */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

type ReadonlyKey<T, K extends keyof T> = Equal<Pick<T, K>, Readonly<Pick<T, K>>>;

/**
 * `nocopy` accepts only evidence that is immutable all the way down. This cannot prove there is
 * no mutable alias: a readonly view can still have one.
 *
 * Optional properties and tuple positions exclude only the `undefined` introduced by their
 * optional marker. The payload validator separately rejects explicit `undefined` values.
 */
type IsNocopyable<T> = [T] extends [AnyVal]
  ? true
  : [T] extends [Primitive]
    ? true
    : [T] extends [ReadonlyArray<infer E>]
      ? T extends unknown[]
        ? false
        : number extends T["length"]
          ? false extends IsNocopyable<E>
            ? false
            : true
          : false extends {
                [I in keyof T]: IsNocopyable<Exclude<T[I], undefined>>;
              }[number]
            ? false
            : true
      : [T] extends [object]
        ? false extends {
            [K in keyof T]-?: ReadonlyKey<T, K> extends true
              ? IsNocopyable<K extends OptionalKeys<T> ? Exclude<T[K], undefined> : T[K]>
              : false;
          }[keyof T]
          ? false
          : true
        : false;

type NocopyArgument<T> =
  IsNocopyable<T> extends true ? unknown : Invalid<"nocopy requires a deeply readonly payload">;

type Nocopy<V extends AnyVal> = <const T extends SeedOf<V>>(value: T & NocopyArgument<T>) => V;

/**
 * The patch accepted by `patch`, at every depth.
 *
 * Taken over a payload rather than a Val, so a custom `patch` can patch a subset of the fields:
 * `Patch<Omit<SeedOf<V>, "id">>` keeps a generated id out.
 *
 * - omit the key → leave it unchanged
 * - `{ k: undefined }` → delete it (only optional keys allow this at the type level)
 * - `{ k: value }` → set it
 * - `{ k: { j: value } }` → set `j` and leave the rest of `k` alone, for a required `k` only
 *
 * An optional key and a `Record` entry take the whole value. There may be nothing there to merge
 * with, and the type cannot tell: `{ at: { x: 1 } }` onto an absent `at` would leave a value
 * missing `y` that the type still calls a `Point`. Spread the current value to keep the rest:
 * `{ at: { ...point, x: 1 } }`.
 */
export type Patch<T> = T extends object
  ? T extends ReadonlyArray<unknown> | AnyVal
    ? never
    : { [K in Exclude<keyof T, OptionalKeys<T>>]?: PatchValue<T[K]> } & {
        [K in OptionalKeys<T>]?: T[K] | undefined;
      }
  : never;

/**
 * A nested plain object is patched in turn. Everything else is replaced whole.
 *
 * The stop at a Val is what keeps {@link Companion.seal} the only gate: a patch reaching into a
 * nested value would build a payload its own seal never saw, and the outer `patch` seals the
 * outer value alone. Replace it with one built by its constructor.
 */
type PatchValue<T> = [Patch<T>] extends [never] ? T : Patch<T>;

export type AnyFn = (...args: never[]) => unknown;

/** What a companion may hold besides members: constants, lookup tables, and so on. */
type NonFn = Primitive | undefined | readonly unknown[] | Record<string, unknown>;

/**
 * Names the library reserves on a companion. A function taking one would shadow it, so both
 * entry points reject them: `.impl` through {@link CompanionMembers}, a trait member through
 * `Declarable`.
 *
 * Everything here has a step of its own. A `seal` whose first parameter accepts the Val, common for
 * primitive payloads, would otherwise satisfy the index signature and attach as an ordinary
 * function, leaving `patch` unrouted. The library defines `patch`, and you cannot replace it: a
 * derivation with different rules deserves its own name, and can seal inside it. Use `.implSeal` /
 * `.implCreate`.
 */
export type Wired = "patch" | "seal" | "create";

/** The names every `.impl` rejects. */
type Rejected = Partial<Record<Wired, never>>;

/** The keys of {@link Rejected}, which valof-lint reads. */
export type Reserved = keyof Rejected;

/**
 * The members a companion accepts, each taking its Val first.
 *
 * `V` is unconstrained so an enum's variant, which is a Val behind a second phantom, can name it.
 */
export type CompanionMembers<V> = Rejected & {
  /**
   * One callable member only. This is the contextual type for the Val parameter, and TypeScript
   * takes one from a union only while a single constituent has a call signature. `NonFn` has
   * none. A second function type would, and the parameter then falls back to implicit `any`
   * with no error.
   */
  // oxlint-disable-next-line no-explicit-any -- `never[]` would type unannotated extra parameters as `never`
  [key: string]: ((value: V, ...rest: any[]) => unknown) | NonFn;
};

/** The members `.implAssoc` accepts: anything but a name the library reserves. */
export type AssocMembers = Rejected & Record<string, unknown>;

/**
 * What the seal produces, propagated verbatim. The library never inspects it, so `Result` and
 * friends need no support here.
 */
type Constructed<V extends AnyVal, F> = F extends (...args: never[]) => infer R ? R : V;

type SealImpl<V extends AnyVal> = (value: SeedOf<V>, seal: (value: SeedOf<V>) => V) => unknown;

/**
 * The seal's parameter may be wider than the payload, so a schema library can parse into it,
 * but not so wide that it accepts a wire format. `patch` hands a payload back to the seal, so one
 * written to decode a JSON string breaks as soon as a value is derived from another.
 *
 * {@link SealImpl} fixes the lower bound at `SeedOf<V>`. This is the upper one: the parameter
 * must not accept a string. That rules out `unknown` and `{}`, leaving `object` and
 * `Record<string, unknown>` alone. A string payload cannot be told apart from a wire format, so
 * it is exempt.
 */
type CheckedSeal<V extends AnyVal, G extends SealImpl<V>> = Synchronous<
  G,
  [string] extends [SeedOf<V>]
    ? G
    : [string] extends [Parameters<G>[0]]
      ? Invalid<"a seal takes the payload, not a wire format; decode before sealing">
      : G
>;

export type Synchronous<G extends (...args: never[]) => unknown, Checked> =
  // `any` is exempt. It matches a promise as it matches everything, so it shows nothing.
  0 extends 1 & ReturnType<G>
    ? Checked
    : [Extract<ReturnType<G>, PromiseLike<unknown>>] extends [never]
      ? Checked
      : Invalid<"a seal is synchronous; await before sealing">;

/**
 * What `create` must be: any arguments, a payload out. The result is not a value yet. The type's
 * seal closes it, so `create` cannot bypass the seal.
 */
type CreateImpl<V extends AnyVal> = (...args: never[]) => SeedOf<V>;

/** Marks a `create` registered by `.implCreate.noseal`. */
export type Unsealed = { readonly [NoSeal]: true };

/**
 * No arguments, so no input reaches the payload unsealed. A wrong payload is checked against
 * `() => S`, so the error points at the returned value. `G` stays bare, because an intersection
 * stops TypeScript inferring it.
 */
export type Argumentless<S, G extends AnyFn> = [Parameters<G>] extends [[]]
  ? [ReturnType<G>] extends [S]
    ? G
    : () => S
  : Invalid<"`.implCreate.noseal` takes a function with no arguments">;

/** The public face of `create`: its own arguments, and whatever the seal returns. */
type Creating<V extends AnyVal, N, F> = [N] extends [Unsealed]
  ? () => V
  : N extends (...args: infer A) => unknown
    ? (...args: A) => Constructed<V, F>
    : undefined;

type CreateMethod<V extends AnyVal, N, F> = [Creating<V, N, F>] extends [undefined]
  ? Record<never, never>
  : {
      /**
       * Creates a payload and seals it, so it returns whatever the seal returns. With
       * `.implCreate.noseal`, returns the Val.
       */
      create: Creating<V, N, F> & {
        /** The same, without copying the payload. */
        nocopy: Creating<V, N, F>;
      };
    };

type SealMethod<V extends AnyVal, F> = {
  /**
   * The single gate a payload passes to become a value. `create` and `patch` both go through it.
   * Without `.implSeal`, it brands the payload and copies it.
   */
  seal: [F] extends [undefined]
    ? ((value: SeedOf<V>) => V) & {
        /** Brands the payload without copying it. It must be readonly all the way down. */
        nocopy: Nocopy<V>;
      }
    : WithoutDefaultSeal<F> & {
        /** Runs the same custom seal without copying its terminal payload. */
        nocopy: WithoutDefaultSeal<F>;
      };
};

/**
 * `patch` derives by sealing the new payload. With a custom seal it propagates whatever the seal
 * returns. Without one the default seal is the copy, so it returns the Val.
 */
type Derive<V extends AnyVal, F, Arg> = Dual<(value: V, arg: Arg) => Constructed<V, F>, V>;

/**
 * Drops the trailing default-seal parameter from a registered seal: callers pass the payload and
 * nothing else.
 */
type WithoutDefaultSeal<F> = F extends (...args: infer A) => infer R
  ? A extends [infer Value, unknown]
    ? (value: Value) => R
    : F
  : F;

/** Type-only carrier for {@link Unpatchable}. */
declare class UnpatchablePhantom<K extends string> {
  private readonly [UnpatchableKey]: K;
  /** Declaration emit erases private field types; protected keeps the keys recoverable. */
  protected readonly [UnpatchableTypes]: K;
}

/**
 * Takes `seal` off the companion. `create` and `patch` still go through it.
 *
 * For a type whose `create` generates what a caller must not pass, such as an id: with `seal`
 * public, `User.seal({ id: "forged", … })` would make one.
 *
 * ```ts
 * const User = Val.companion<User, [PrivateSeal]>()
 *   .implCreate((name: string) => ({ id: crypto.randomUUID(), name }))
 *   .build();
 * ```
 */
// This and `PrivateCreate` are classes, not aliases of one. Declaration emit writes an alias
// without type arguments as its class, and a consumer's `.d.ts` cannot reference a class the entry
// does not export.
export declare class PrivateSeal {
  private readonly [PrivateSealKey]: true;
}

/**
 * Takes `create` off the companion, whether `.implCreate` registered it or an enum's variant has it
 * by default. `seal` and `patch` stay.
 *
 * For a type built through other functions alone. It shapes what the companion offers and guards
 * no invariant: a `create` passes the seal like every other gate.
 *
 * ```ts
 * const Token = Val.companion<Token, [PrivateCreate]>().implCreate(generate).build();
 * ```
 */
export declare class PrivateCreate {
  private readonly [PrivateCreateKey]: true;
}

/**
 * Takes keys out of `patch`: its patch stops accepting them.
 *
 * For what a `create` generates and nothing afterwards may change: an id, a `createdAt`, a version
 * counter.
 *
 * ```ts
 * const User = Val.companion<User, [Unpatchable<"id" | "createdAt">]>().build();
 * ```
 */
export type Unpatchable<K extends string> = UnpatchablePhantom<K>;

/** What the list after the Val in `Val.companion<V, […]>` takes. */
type CompanionOption<V extends AnyVal> =
  | PrivateSeal
  | PrivateCreate
  | Unpatchable<keyof SeedOf<V> & string>;

// A list, not an intersection: two `Unpatchable`s intersected collapse to `never`, which satisfies
// every constraint and would read as no option at all.
export type Options = readonly unknown[];

export type UnpatchableKeys<O extends Options> = O[number] extends infer E
  ? E extends UnpatchablePhantom<infer K>
    ? K
    : never
  : never;

type Derivable<V extends AnyVal, O extends Options> = [UnpatchableKeys<O>] extends [never]
  ? SeedOf<V>
  : Omit<SeedOf<V>, UnpatchableKeys<O> & keyof SeedOf<V>>;

/**
 * `patch` exists only when there is something to patch: `Patch` is `never` for primitives and
 * arrays, so for those the function is left out of the type. Write a named derivation of your
 * own instead, and seal inside it.
 */
type PatchMethod<V extends AnyVal, F, O extends Options> = [Patch<Derivable<V, O>>] extends [never]
  ? Record<never, never>
  : {
      /**
       * Derives by sealing, so it returns whatever the seal returns: `patch` cannot bypass a smart
       * constructor.
       *
       * A nested object merges, so a patch cannot shrink one. `{ staff: { u1: undefined } }`
       * drops one entry; passing a whole smaller object leaves the rest in place. To
       * replace it outright, build the whole payload again through the constructor or `seal`.
       * See {@link Patch}.
       */
      patch: Derive<V, F, Patch<Derivable<V, O>>>;
    };

/**
 * A type's members, its `seal`, and the `create` and `patch` that go through it. Not callable: a
 * call reads as a construction that cannot fail, and a seal can.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 */
export type Companion<
  V extends AnyVal,
  M extends CompanionMembers<V>,
  N = undefined,
  F = undefined,
  O extends Options = [],
  A = Record<never, never>,
> = Duals<Omit<M, Wired>, V> &
  Looses<A> &
  ([Extract<O[number], PrivateCreate>] extends [never] ? CreateMethod<V, N, F> : unknown) &
  ([Extract<O[number], PrivateSeal>] extends [never] ? SealMethod<V, F> : unknown) &
  PatchMethod<V, F, O> &
  TraitHost;

/**
 * What `.impl` accepts once a name is taken: anything but a name a trait already uses, its shared
 * members included, or one an earlier `.impl` collected. Shadowing a trait's member would make
 * `User.greet(u)` and `Greetable.greet(u)` disagree.
 *
 * The check is placed on the parameter rather than the constraint. In the constraint the inferred
 * `M & T` stops satisfying {@link CompanionMembers}, and `equals` breaks with it.
 */
export type Grown<Taken, M> = M & {
  [K in keyof M]: K extends Taken ? "this name is already taken" : unknown;
};

/**
 * What `implTrait` accepts for `Tr`, or the `Invalid` message saying why this type cannot implement
 * it.
 *
 * The checks are placed on a parameter. In the return type they would fail only where the companion
 * is assigned, which is a line away from the call and reads as something else.
 *
 * The shape is not among them: a Val whose payload contradicts a trait it declares is rejected
 * where it is declared, so it never reaches a companion. See {@link Val}.
 *
 * `Tr` infers only through a branch that names it structurally, as `TraitCompanion<Tr, G>` does.
 * Members passed in the companion's place leave `Tr` at its constraint, where `NamesOf<Tr>` is
 * `string`. The first branch catches that before the rest read a name that is not there.
 *
 * `V` is unconstrained so an enum's variant can name it. Intersected with {@link AnyVal} to meet a
 * constraint, a variant reads its payload off the wrong phantom, and the payload check passes.
 */
export type Takes<V, Tr extends AnyTrait, T, Ok> =
  string extends NamesOf<Tr>
    ? "pass the trait's companion, then the members it leaves open"
    : [NamesOf<Tr>] extends [TraitsOf<V>]
      ? [keyof MembersOf<Tr> & keyof T] extends [never]
        ? [keyof MembersOf<Tr> & PayloadKeys<V>] extends [never]
          ? Ok
          : "a member cannot take the name of a field the payload holds"
        : "another member already answers to one of these names"
      : "the type does not declare this trait";

/** What the companion form takes once the trait itself has answered for every {@link Final}. */
export type Complete<Tr extends AnyTrait, G> = [Exclude<FinalsOf<Tr>, keyof G>] extends [never]
  ? TraitCompanion<Tr, G>
  : "this trait's companion has not implemented every member declared Final";

/**
 * The second argument, absent where the trait answered for every member itself. Optional where `Tr`
 * was not inferred, so a call passing the function alone reports {@link Takes}'s message rather
 * than a missing argument.
 */
export type Passes<Tr extends AnyTrait, G, I, S> =
  // `NoInfer` for the type cost: see `Supplied`.
  string extends NamesOf<Tr>
    ? [impl?: unknown]
    : [keyof Omit<MembersOf<Tr>, keyof G>] extends [never]
      ? [impl?: (supplied: NoInfer<S>) => I & Arity<I> & ThisType<undefined>]
      : [impl: (supplied: NoInfer<S>) => I & Arity<I> & ThisType<undefined>];

/**
 * What a step's function receives: `seal`, `create` and `patch`, the private ones included.
 *
 * Each step wraps it in `NoInfer` where it uses it. It holds no type parameter to infer, but
 * inference walks all of it anyway. In the type-perf `core` fixture, `impl(({ seal }) => …)` took
 * 15,800 instantiations, and 6,700 with the wrapper. Wrapped inside this alias, the parameter's
 * hover shows the expanded type instead of `Supplied<…>`.
 */
type Supplied<V extends AnyVal, N, F, O extends Options> = CreateMethod<V, N, F> &
  SealMethod<V, F> &
  PatchMethod<V, F, O>;

/** The steps a companion has taken. The first two are the first half of the chain. */
type Taken = "implSeal" | "implCreate" | "impl" | "implTrait" | "implAssoc";

/**
 * What a builder holds where the companion holds its library's names: `.build()` is missing.
 */
export interface CallBuildFirst {
  readonly [Unbuilt]: "call `.build()` to get the companion";
}

/**
 * What `Val.companion` returns, which its steps add to and `.build()` closes.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 *
 * The first half sets up the gates, in this order: `implSeal`, then `implCreate`.
 * Each comes once. The second half registers members, `impl` once, `implTrait` for each trait and
 * `implAssoc` any number of times, in any order, and its first step ends the first half.
 *
 * `implSeal` and `implCreate` are separate steps because a seal must be idempotent. Generating
 * ids, timestamps and the like belongs in `create`, whose payload is then sealed like any other.
 */
export type CompanionBuilder<
  V extends AnyVal,
  N = undefined,
  F = undefined,
  O extends Options = [],
  T extends CompanionMembers<V> = Record<never, never>,
  D extends Taken = never,
  A = Record<never, never>,
> = {
  readonly seal: CallBuildFirst;
  readonly create: CallBuildFirst;
  readonly patch: CallBuildFirst;
  /**
   * Closes the chain and returns the companion. The builder holds the steps alone: `seal`,
   * `create`, `patch` and the members are the companion's.
   */
  build: () => Companion<V, T, N, F, O, A>;
} & ([Extract<D, "impl" | "implTrait" | "implAssoc">] extends [never]
  ? FirstHalf<V, N, F, O, D>
  : unknown) &
  ("impl" extends D
    ? unknown
    : {
        /**
         * Collects the members the function returns, in one call. Everything the library reserves
         * has its own step.
         *
         * The function receives `seal`, and `create` and `patch` where the companion has them. A
         * member reaching the companion for anything else (a trait's member or a sibling)
         * references it and annotates its return type. Referencing a declaration inside its own initializer is a circularity, which
         * TypeScript reports as TS7023.
         *
         * A member can be called with the value first, `User.rename(u, "x")`, or last,
         * `User.rename("x")(u)`. So can `patch` and a trait's member taking more than one
         * argument. One taking only the value has no second form: `pipe(u, User.greet)`. A member
         * cannot have an optional, a default or a rest parameter. Pass `undefined` where an
         * argument has no value.
         *
         * Called with the value last, a generic member loses its type parameters. Each becomes its
         * constraint, or `unknown` where none is declared. To keep them, wrap the member in a
         * function that calls it with the value first: `pipe(u, (v) => User.pick(v, "name"))`.
         *
         * See {@link https://jo16oh.github.io/valof/latest/companion-objects.html#call-a-member-with-the-value-last | Call a member with the value last}.
         */
        // A separate step because TypeScript cannot infer type arguments partially. A trait's
        // member is registered, so `.impl` may not register one over it: the type would keep the
        // trait's signature while `dyn` kept calling what `implTrait` recorded. `ThisType`
        // types `this` as `undefined`, its value at run time.
        impl: <M extends CompanionMembers<V>>(
          fns: (
            supplied: NoInfer<Supplied<V, N, F, O>>,
          ) => Grown<keyof T | keyof A, M> & Arity<M> & ThisType<undefined>,
        ) => CompanionBuilder<V, N, F, O, M & T, D | "impl", A>;
      }) & {
    /**
     * Collects the members the function returns that do not take the Val first: `fromRow`,
     * `parse`, a constant. Write it any number of times.
     *
     * The function receives `seal`, and `create` and `patch` where the companion has them. A
     * member reaching the companion for anything else (a sibling or another step's member)
     * references it and annotates its return type, as in `.impl`.
     *
     * A member can be called with its first argument first, or last: `Money.scaled(5, 2)` or
     * `Money.scaled(2)(5)`. A member taking one argument or none has no second form. A member
     * cannot have an optional, a default or a rest parameter.
     */
    implAssoc: <M extends AssocMembers>(
      fns: (
        supplied: NoInfer<Supplied<V, N, F, O>>,
      ) => Grown<keyof T | keyof A, M> & LooseArity<M> & ThisType<undefined>,
    ) => CompanionBuilder<V, N, F, O, T, D | "implAssoc", A & M>;
    /**
     * Implements a trait the type declares. A function passed as the second argument returns the
     * members the trait leaves open, with their first parameter fixed to the Val as everywhere
     * else; a trait that leaves none takes no second argument.
     *
     * A member the trait declared {@link Final} is not returned here. It arrives unchanged, and
     * nothing can override it.
     *
     * A member taking more than one argument can be called with the value first or last. None can
     * have an optional, a default or a rest parameter.
     *
     * See {@link https://jo16oh.github.io/valof/latest/companion-objects.html#call-a-member-with-the-value-last | Call a member with the value last}.
     */
    implTrait: <Tr extends AnyTrait, G, I extends Implement<Tr, G, V>>(
      trait: Takes<V, Tr, T & A, Complete<Tr, G>>,
      ...impl: Passes<Tr, G, I, Supplied<V, N, F, O>>
    ) => CompanionBuilder<V, N, F, O, T & Unbound<MembersOf<Tr>, V>, D | "implTrait", A>;
  };

/**
 * The steps that set up the gates. A step already taken is gone, and one written too late takes
 * the reason as its parameter.
 */
type FirstHalf<V extends AnyVal, N, F, O extends Options, D extends Taken> = ("implSeal" extends D
  ? unknown
  : {
      /**
       * Replaces the seal. Its parameter may be wider than the payload, so a schema library can
       * validate it. It may not accept a string unless the payload is one: decode a wire format
       * before sealing.
       */
      implSeal: "implCreate" extends D
        ? (
            seal: "write `implSeal` before `implCreate`",
          ) => CompanionBuilder<V, N, F, O, Record<never, never>, D>
        : <G extends SealImpl<V>>(
            seal: CheckedSeal<V, G>,
          ) => CompanionBuilder<V, N, G, O, Record<never, never>, D | "implSeal">;
    }) &
  ("implCreate" extends D
    ? unknown
    : {
        /** Registers a function that creates a payload, as `create`. Any arguments, a payload out. */
        implCreate: (<G extends CreateImpl<V>>(
          create: G,
        ) => CompanionBuilder<V, G, F, O, Record<never, never>, D | "implCreate">) & {
          /**
           * A `create` that bypasses the seal and returns the Val, for a payload the seal always
           * accepts, such as a random id. Takes no arguments. Development still runs the seal, and
           * throws if it rejects the payload or if normalization changes it.
           */
          noseal: <G extends AnyFn>(
            create: Argumentless<SeedOf<V>, G>,
          ) => CompanionBuilder<V, Unsealed, F, O, Record<never, never>, D | "implCreate">;
        };
      });

/**
 * The payload's own keys, which a trait member may not shadow: a box forwards everything but a
 * member to the value, and a frozen field a member shadowed would break the proxy's invariant.
 *
 * Distributes: `keyof` over an enum's payloads would keep the shared fields alone.
 */
type PayloadKeys<V> = V extends unknown
  ? Declared<V> extends object
    ? keyof Declared<V>
    : never
  : never;

export const isObject = (v: unknown): v is object => typeof v === "object" && v !== null;

const isObjectShaped = (v: unknown): v is Record<string, unknown> =>
  isObject(v) && !Array.isArray(v);

const assertPlainObject = (value: object): void => {
  const proto = Object.getPrototypeOf(value) as object | null;
  if (proto !== Object.prototype && proto !== null) {
    const name = (value.constructor as { name?: string } | undefined)?.name;
    throw new TypeError(
      `a Val holds plain objects only; received ${name ? `an instance of ${name}` : "an object with a prototype"}`,
    );
  }
};

/**
 * Compares the payloads of two values deeply. The first argument fixes the Val type accepted by
 * the second, so values with different brands cannot be compared by an ordinary call.
 *
 * - independent of key order
 * - ignores keys whose value is `undefined` (`{ a: undefined }` equals `{}`)
 * - `NaN` equals `NaN`, and `-0` equals `0`
 */
export const equals: <V extends AnyVal>(a: V, b: NoInfer<V>) => boolean = function equals(
  a: unknown,
  b: unknown,
): boolean {
  if (a === b) return true;
  // `-0` and `0` are already equal via `===`, which matches JSON round-tripping
  // (`JSON.stringify(-0)` is `"0"`), so only NaN is left to handle.
  if (typeof a === "number" && typeof b === "number") {
    return Number.isNaN(a) && Number.isNaN(b);
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;

  if (aIsArray) {
    const x = a as readonly unknown[];
    const y = b as readonly unknown[];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) {
      if (!equals(x[i], y[i])) return false;
    }
    return true;
  }

  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const xKeys = Object.keys(x).filter((k) => x[k] !== undefined);
  const yKeys = Object.keys(y).filter((k) => y[k] !== undefined);
  if (xKeys.length !== yKeys.length) return false;

  for (const k of xKeys) {
    if (!Object.hasOwn(y, k)) return false;
    if (!equals(x[k], y[k])) return false;
  }
  return true;
};

// Public callers compare Vals. Custom-seal checks compare snapshots whose children are unknown.
const equalsUnknown = equals as (a: unknown, b: unknown) => boolean;

/**
 * The nodes this module built. Subtrees are immutable, so recognizing one lets a derivation
 * copy only the path down to what changed and share everything below it.
 *
 * Leaves are recorded too. A record costs about 20x a lookup and never earns that back in
 * copying time, but frameworks compare identity: without it every small nested Val gets a new
 * identity on each `patch`, and a memoized component re-renders for a change it never saw.
 *
 * Missing a node costs a copy, never correctness, so the set can be lost across a
 * `structuredClone` or a JSON round trip with nothing to repair.
 */
const owned = new WeakSet<object>();

/** Roots adopted by production `nocopy`. Their descendants are indexed only if a copy needs it. */
const adopted = new WeakSet<object>();

const unsnapshotable = Symbol("unsnapshotable seal input");
type SealSnapshot = Primitive | undefined | object | typeof unsnapshotable;

/**
 * Returns a plain, inert view of what a custom seal can observe. This is deliberately best-effort:
 * wider seal inputs may be class instances, cyclic, or backed by traps that throw. Those inputs
 * still go to the custom seal, with this development check skipped.
 *
 * `Object.keys` and ordinary reads match the copy's observable surface. In particular, a Proxy is
 * not rejected merely for being a Proxy; stable reactive proxies snapshot like plain objects.
 */
const snapshotSealInput = (input: unknown): SealSnapshot => {
  const active = new WeakSet<object>();

  const snapshot = (value: unknown): SealSnapshot => {
    if (!isObject(value)) {
      return typeof value === "function" || typeof value === "symbol"
        ? unsnapshotable
        : (value as Primitive | undefined);
    }
    if (active.has(value)) return unsnapshotable;

    const array = Array.isArray(value);
    if (!array) {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return unsnapshotable;
    }

    active.add(value);
    try {
      const out: Record<string, unknown> | unknown[] = array
        ? Array.from({ length: (value as unknown[]).length })
        : {};
      for (const key of Object.keys(value)) {
        const child = snapshot((value as Record<string, unknown>)[key]);
        if (child === unsnapshotable) return unsnapshotable;
        if (key === "__proto__") define(out, key, child);
        else (out as Record<string, unknown>)[key] = child;
      }
      return out;
    } finally {
      active.delete(value);
    }
  };

  try {
    return snapshot(input);
  } catch {
    return unsnapshotable;
  }
};

const changedDuringSeal = (): never => {
  throw new TypeError("The payload changed while the custom seal was running.");
};

export const notFixedPoint = (): never => {
  throw new TypeError("The seal rejected or changed a payload from `.implCreate.noseal`.");
};

/**
 * Builds the recursive deep copy, in an owning and a non-owning form.
 *
 * `owning` is closed over rather than passed, so it cannot change underneath a copy in progress:
 * copying runs a payload's getters, which is someone else's code and can seal or unwrap.
 *
 * Values are frozen in development only. Breaking `readonly` takes a cast, and with nodes shared
 * that write lands in every value holding the node. Freezing measured at 25-30% of the copy's cost
 * and buys nothing at run time, so production skips it.
 */
const deepCopy = (owning: boolean) => {
  const copy = <T>(value: T): T => {
    if (!isObject(value)) return value;
    if (owning && adopted.has(value)) {
      indexAdopted(value);
      return value;
    }
    if (owning && owned.has(value)) return value;

    let out: unknown;

    if (Array.isArray(value)) {
      out = (value as unknown[]).map((element) => copy(element));
    } else {
      const source = value as Record<string, unknown>;

      if (development) assertPlainObject(source);

      const target: Record<string, unknown> = {};
      for (const key of Object.keys(source)) {
        const copied = copy(source[key]);
        // Plain assignment would invoke the `__proto__` setter on that one key, moving it into
        // the prototype instead of copying it. Defining it keeps it an own property, and only
        // that key pays for the slower path.
        if (key === "__proto__") {
          define(target, key, copied);
        } else {
          target[key] = copied;
        }
      }
      out = target;
    }

    if (owning) {
      owned.add(out as object);
      if (development) Object.freeze(out);
    }
    return out as T;
  };
  return copy;
};

/**
 * Deep-copies a payload and takes ownership: reuses nodes this module owns, records the ones it
 * makes, freezes them in development.
 *
 * Recorded here rather than in `seal` because this is where the nodes are. A seal sees only the
 * root, so a list of 200 Vals would get a new array on every derive, at 10x the cost and with a
 * new identity for anything memoized on it.
 */
const own = deepCopy(true);

/**
 * Gives a production-adopted graph the same ownership index a copied graph gets eagerly.
 * This is intentionally deferred: `nocopy` itself remains O(1) in production.
 */
const indexAdopted = (root: object): void => {
  if (!adopted.has(root)) return;
  const seen = new WeakSet<object>();
  const visit = (value: unknown): void => {
    if (!isObject(value) || seen.has(value)) return;
    seen.add(value);
    owned.add(value);
    for (const key of Object.keys(value)) visit((value as Record<string, unknown>)[key]);
  };
  visit(root);
  adopted.delete(root);
};

/** Adopt a caller-owned payload. Development validates and freezes every node before returning. */
const adopt = <T>(value: T): T => {
  if (!isObject(value)) return value;
  if (owned.has(value)) return value;

  if (!development) {
    adopted.add(value);
    return value;
  }

  const active = new WeakSet<object>();
  const done = new WeakSet<object>();
  const visit = (node: unknown): void => {
    if (!isObject(node) || owned.has(node) || done.has(node)) return;
    if (active.has(node)) throw new TypeError("a Val payload cannot contain a cycle");
    active.add(node);
    try {
      if (!Array.isArray(node)) assertPlainObject(node);
      for (const key of Reflect.ownKeys(node)) {
        const descriptor = Object.getOwnPropertyDescriptor(node, key);
        if (!descriptor || "get" in descriptor || "set" in descriptor) {
          throw new TypeError("a Val payload cannot contain accessor properties");
        }
        visit(descriptor.value);
      }
      owned.add(node);
      Object.freeze(node);
      done.add(node);
    } finally {
      active.delete(node);
    }
  };
  visit(value);
  return value;
};

/** A plain deep copy. What `Val.unwrap` hands back is not the library's. */
const detach = deepCopy(false);

/**
 * A variant's payload is spread with its tag before the copy, which would drop a prototype unseen
 * and turn a string into a character map. Throws in production too, like `patch`. Only the message
 * and the prototype check are development-only, as in the copy.
 */
// Below `development`: a read above its declaration keeps the minifier from folding it, and every
// development-only branch then ships.
export const assertVariantPayload = (value: unknown): void => {
  if (!isObjectShaped(value)) {
    throw new TypeError(development ? "an enum variant's payload is a plain object" : undefined);
  }
  if (development) assertPlainObject(value);
};

/**
 * Assignment would move a `__proto__` key into the prototype rather than keep it an own property,
 * so a payload's keys go through here. The library's own keys and the members are assigned.
 */
export const define = <T extends object>(target: T, key: string, value: unknown): T => {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return target;
};

/** A step's function: the members it returns from the gates it receives. */
type Members = (supplied: object) => Record<string, unknown>;

/** A trait and the function that implements it. */
type Implementation = [trait: { [Shared]: Record<string, unknown> }, fns?: Members];

/** What a builder's steps registered: a Val's, an enum's, or one of its variants'. */
export type Registered<P = unknown> = {
  seal?: (value: P, seal: (value: P) => unknown) => unknown;
  create?: AnyFn;
  noseal?: boolean;
  members?: Members;
  traits?: Implementation[];
  assoc?: Members[];
};

/**
 * Merges a patch onto a value node, and returns the node itself when nothing changed.
 *
 * Nodes are shared and never mutated, so identical children mean equal subtrees. The walk that
 * applies the patch reports whether anything changed, per level, which is what lets an untouched
 * subtree keep its identity all the way up to the root.
 *
 * An owned node is a value, not a patch, so it replaces rather than merges. That is the runtime
 * form of {@link PatchValue} stopping at a Val: the brand is a phantom, and a node's origin is
 * the only thing left to read. Losing the record costs a wrong merge on a nested value that
 * dropped an optional key, so a payload that crossed `structuredClone` should be re-sealed.
 */
const patched = (
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...base, ...patch };
  let same = true;
  let kept = 0;
  for (const key of Object.keys(merged)) {
    const value = merged[key];
    // A deletion needs no flag of its own: it shows up in the count. `kept` rises only for a
    // surviving key, and a key added in place of the deleted one cannot match the base's absent
    // one, so `same` is already false there.
    if (value === undefined) {
      delete merged[key];
      continue;
    }
    kept++;
    const before = base[key];
    const child =
      isObjectShaped(before) && isObjectShaped(value) && !owned.has(value)
        ? patched(before, value)
        : value;
    merged[key] = child;
    if (!Object.is(child, before)) same = false;
  }
  return same && kept === Object.keys(base).length ? base : merged;
};

/**
 * A companion holding what the steps registered, plus the user's own members.
 *
 * Everything that produces a value goes through `seal`: the registered one, or a copy when the
 * type did not replace it. Nothing is copied before that. The one deep copy happens in the
 * default seal that a custom one returns through.
 */
export const attach = (registered: Registered): Record<string, unknown> => {
  const target: Record<string, unknown> = {};
  const {
    create,
    noseal,
    seal: custom,
    members: fns,
    traits: implemented = [],
    assoc,
  } = registered;
  const sealedWith = (terminal: (value: unknown) => unknown): ((value: unknown) => unknown) =>
    custom
      ? development
        ? (value) => {
            const before = snapshotSealInput(value);
            return custom(value, (candidate) => {
              if (before !== unsnapshotable) {
                const current = snapshotSealInput(value);
                if (current !== unsnapshotable && !equalsUnknown(before, current))
                  changedDuringSeal();
              }

              const candidateBefore = snapshotSealInput(candidate);
              const sealed = terminal(candidate);
              if (candidateBefore !== unsnapshotable && !equalsUnknown(candidateBefore, sealed)) {
                changedDuringSeal();
              }
              return sealed;
            });
          }
        : (value) => custom(value, terminal)
      : terminal;
  const seal = sealedWith(own);
  const nocopy = sealedWith(adopt);
  // Development runs the seal anyway, and throws unless it calls the default seal with an
  // equal payload.
  const unsealed = (terminal: (value: unknown) => unknown): ((value: unknown) => unknown) =>
    custom && development
      ? (value) => {
          const result: { sealed?: unknown } = {};
          sealedWith((candidate) => {
            if (!equalsUnknown(value, candidate)) notFixedPoint();
            return (result.sealed = terminal(candidate));
          })(value);
          return "sealed" in result ? result.sealed : notFixedPoint();
        }
      : terminal;
  // A derivation that changed nothing returns the value it started from, so a framework comparing
  // by identity sees no update. A custom seal owns the return shape, so the value goes back
  // through it: the copy inside recognizes the node and returns the same one.
  const keep: (value: unknown) => unknown = custom ? seal : (value) => value;

  if (create) {
    const [copying, adopting] = noseal ? [unsealed(own), unsealed(adopt)] : [seal, nocopy];
    const created = (...args: never[]) => copying(create(...args));
    created.nocopy = (...args: never[]) => adopting(create(...args));
    target.create = created;
  }
  // Without a custom seal, `seal` is the copy itself, and this gives it the `nocopy` `Val.of` has.
  define(seal, "nocopy", nocopy);
  target.seal = seal;

  // Same idea for a registered derivation, which cannot reach the companion it is being
  // defined on: the seal arrives as its third argument.
  target.patch = dual((value: unknown, patch: Record<string, unknown>) => {
    // The type leaves `patch` off a primitive or array Val, so reaching this takes a cast.
    // Still throws in production: without the guard the spread seals an object, turning a
    // number into `{}` and a string into a character map. Only the message is development-only.
    if (!isObjectShaped(value)) {
      throw new TypeError(
        development ? "`patch` is only available for object-shaped Vals." : undefined,
      );
    }
    indexAdopted(value);
    const merged = patched(value, patch);
    return Object.is(merged, value) ? keep(value) : seal(merged);
  });

  // The steps' functions run once the gates they receive exist. A trait's members join the
  // type's own, so they grow the same way. The Val's own go on last, the type having kept every
  // `Final` one out of them. The record is what `Trait`'s `dyn` reads, and keeping it here means
  // `val.ts` never imports `trait.ts`.
  const traits = Object.assign(
    {},
    ...implemented.map(([trait, impl]) => ({ ...trait[Shared], ...impl?.(target) })),
  );
  (target as Record<symbol, unknown>)[Traits] = traits;
  return Object.assign(
    target,
    createMembers(traits),
    createMembers({ ...fns?.(target) }),
    associated(assoc, target),
  );
};

/**
 * What the `.implAssoc` functions return, passed to {@link createMembers} as members that do not take
 * the value.
 */
export const associated = (assoc: Members[] = [], supplied: object): Record<string, unknown> =>
  Object.assign({}, ...assoc.map((fns) => createMembers(fns(supplied), true)));

/**
 * The steps on a builder, each handing what it registers to `grow`. `registered` is what the steps
 * before it registered. The order of the steps is the type's to enforce.
 */
export const steps = <P>(
  registered: Registered<P> | undefined,
  grow: (change: Registered<P>) => object,
) => ({
  implSeal: (seal: NonNullable<Registered<P>["seal"]>) => grow({ seal }),
  implCreate: Object.assign((create: AnyFn) => grow({ create, noseal: false }), {
    noseal: (create: AnyFn) => grow({ create, noseal: true }),
  }),
  impl: (members: Members) => grow({ members }),
  implTrait: (...implementation: Implementation) =>
    grow({ traits: [...(registered?.traits ?? []), implementation] }),
  implAssoc: (fns: Members) => grow({ assoc: [...(registered?.assoc ?? []), fns] }),
});

/** One builder state: what the steps registered so far. */
const builder = (registered: Registered): object => ({
  ...steps(registered, (change) => builder({ ...registered, ...change })),
  build: () => attach(registered),
});

/**
 * Rejects a variant and the union it belongs to. An enum's companion holds one frame per variant,
 * and a second companion beside it bypasses the enum's seal and the tag it writes.
 *
 * Self-referential, so the message arrives at the type argument rather than at the call (notes
 * §11.2).
 */
type NotEnum<V> = [V] extends [AnyEnum]
  ? Invalid<"a variant is built by its enum's companion">
  : unknown;

/**
 * The default seal, with the type named explicitly: brand the payload and copy it. `seal` on a
 * companion without `.implSeal`, and the seal passed to a custom one, do the same thing; only the
 * type differs.
 */
export const of = /* @__PURE__ */ Object.assign(own as <V extends AnyVal>(value: SeedOf<V>) => V, {
  /**
   * Uses a payload without copying it. The caller must ensure it will not change.
   */
  // With an explicit `V`, TypeScript cannot also infer the argument's precise readonlyness, so
  // this cannot require a deeply readonly payload as the default seal's `nocopy` does.
  nocopy: adopt as <V extends AnyVal>(value: SeedOf<V>) => V,
});

/**
 * A plain, mutable copy of the payload, for code that does not know about `readonly`.
 */
// It copies because the brand is phantom: a Val is its payload at run time, so returning that
// object under a mutable type would put the caller's writes into the value.
export const unwrap = detach as <V extends AnyVal>(value: V) => PayloadOf<V>;

/**
 * Bundles a type's `seal` and members. `V` is given as a type argument; the steps infer the rest.
 *
 * A list may follow `V`: {@link PrivateSeal}, {@link PrivateCreate}, {@link Unpatchable}, as in
 * `Val.companion<User, [PrivateSeal, Unpatchable<"id">]>()`.
 */
// Constructors get their own steps rather than sitting in `.impl`, which fixes every function's
// first parameter to the Val. A constructor does not fit that shape.
export const companion = <
  V extends AnyVal & NotEnum<V>,
  const O extends readonly CompanionOption<V>[] = [],
>(): CompanionBuilder<V, undefined, undefined, O> =>
  builder({}) as CompanionBuilder<V, undefined, undefined, O>;
