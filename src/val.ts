// Type-only, so the entry point constrains against an experimental type and nothing crosses at
// run time. The phantom stays in enum.ts, beside the declaration that carries it.
import type { AnyEnum } from "./enum.ts";
import type {
  AnyTrait,
  FinalsOf,
  Implement,
  Members,
  MembersOf,
  NamesOf,
  ShapeOf,
  TraitBrand,
  TraitCompanion,
  TraitsOf,
  Unbound,
} from "./trait.ts";

/** Primitives allowed as values. `undefined` is deliberately excluded. */
type Primitive = string | number | boolean | bigint | null;

/** Type-only nominal identity. Private members disappear from `keyof` and object spreads. */
declare class Phantom<K extends string, T> {
  private readonly __valof_internal_phantom_brand: K;
  private readonly __valof_internal_phantom_payload: T;
  /** Declaration emit erases private field types; protected keeps the type arguments recoverable. */
  protected readonly __valof_internal_phantom_types: readonly [K, T];
}

/**
 * The payload's verdict, read at every gate through {@link AnyVal}. A private field is not read
 * while a type alias resolves, which is what lets a Val reference itself: see {@link Rec}.
 */
export declare class Verdict<X> {
  private readonly __valof_internal_verdict: X;
}

export type AnyVal = Phantom<string, unknown> & Verdict<true>;

/**
 * A deferred reference to a Val, so a type can reference itself. It is erased from the value and
 * from the payload a constructor takes, so it appears in the declaration alone.
 *
 * ```ts
 * type Tree = Val<"app/Tree", { value: number; children: readonly Rec<Tree>[] }>;
 *
 * const leaf = Tree({ value: 1, children: [] });
 * const root = Tree({ value: 2, children: [leaf] });
 * root.children[0]; // Tree
 * ```
 *
 * Write it around the type being declared and nothing else. `Rec<number>` erases to `number`, and
 * `Rec<Other>` to `Other`: neither is a type error, so nothing reports either one. The type
 * parameter is unconstrained because checking a constraint would resolve the type that is still
 * being declared, which is the circularity this breaks.
 */
export interface Rec<V> {
  readonly __valof_internal_rec: V;
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
 * type argument, and that is the resolution `Rec` exists to defer. An index signature matches
 * every key, so it is excluded first.
 */
type IsRec<T> = string extends keyof T ? false : keyof Rec<unknown> extends keyof T ? true : false;

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

/** A {@link Rec} opens to the Val it references. */
export type DeepReadonly<T> =
  IsRec<T> extends true ? (T extends Rec<infer V> ? V : T) : DeepReadonlyValue<T>;

/** Recursion stops at a nested Val: it is already deep-readonly. */
type DeepReadonlyValue<T> = [T] extends [AnyVal]
  ? T
  : [T] extends [Primitive]
    ? T
    : // The numeric key, not `[T] extends [ReadonlyArray<unknown>]`: that reads a property named
      // after an array member, `entries` or `values`, and a `Rec` in one would resolve the type
      // still being declared. An array is the only payload with a numeric key.
      number extends keyof T
      ? number extends Extract<T, readonly unknown[]>["length"]
        ? ReadonlyArray<DeepReadonly<T[number]>>
        : { readonly [I in keyof T]: DeepReadonly<T[I]> }
      : [T] extends [object]
        ? {
            // An optional key carries `undefined` in its type, and a union stops the walk one
            // level short: a `Rec` inside it would never open. The value never holds the
            // `undefined` either way, since an optional key is absent or set.
            readonly [K in keyof T]: DeepReadonly<Exclude<T[K], undefined>>;
          }
        : T;

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

/**
 * Whether the payload holds every field the declared traits require, or the sentence saying why
 * not.
 *
 * `ShapeOf<A | B>` keeps only the keys the two share, so a union asks the payload for nothing.
 * Caught here, before the fields are read.
 */
type Fits<T, Tr extends AnyTrait> = [Tr] extends [never]
  ? true
  : [Tr] extends [UnionToIntersection<Tr>]
    ? DeepReadonly<Checked<T>> extends ShapeOf<Tr>
      ? true
      : "the payload does not hold what the trait requires"
    : "declare several traits with `&`, not `|`";

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
 * A branded value type. A payload that breaks the allowed-type rules is a type error, and so is
 * one that does not hold what a declared trait requires: both land in the verdict, which stops
 * the Val satisfying {@link AnyVal}. See {@link Verdicted}.
 */
export type Val<K extends string, T, Tr extends AnyTrait = never> = DeepReadonly<Grounded<T>> &
  Phantom<K, T> &
  Verdict<Verdicted<T, Tr>> &
  TraitBrand<Tr>;

/** The Val's brand string. */
export type BrandOf<V extends AnyVal> = V extends Phantom<infer K, unknown> ? K : never;

/** The Val's raw payload type. */
export type PayloadOf<V extends AnyVal> = V extends Phantom<string, infer T> ? T : never;

/**
 * The payload as constructors, `Val.of` and a custom seal accept it.
 *
 * Deep-readonly to accept more, not to enforce: every constructor deep-copies its argument. A
 * Val is itself deep-readonly, so a payload taken from an existing value fits.
 */
export type SeedOf<V extends AnyVal> = DeepReadonly<PayloadOf<V>>;

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

type AnyFn = (...args: never[]) => unknown;

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

/**
 * The members a companion accepts, each taking its Val first.
 *
 * `V` is unconstrained so an enum's variant, which is a Val behind a second phantom, can name it.
 */
export type CompanionMembers<V> = Partial<Record<Wired, never>> & {
  /**
   * The record `Trait`'s `dyn` reads, and anything else the library keeps on a companion. Defined
   * before the registrations, so a function taking the name would overwrite it and leave every
   * boxed member unbound.
   */
  [key: `__valof_${string}`]: never;
  /**
   * The steps belong to the library, whichever ones it adds. Nothing is shadowed: `.impl` builds a
   * fresh object, and the chain has ended by then. But `User.implTrait(u)` reads as the step it is
   * not, so the library reserves the prefix.
   */
  [key: `impl${string}`]: never;
  /**
   * A companion holding `then` is a thenable. `await` on it, or returning it from an async
   * function, calls the member with the resolve and reject functions, and the promise never
   * settles.
   */
  then?: never;
  /**
   * One callable member only. This is the contextual type for the Val parameter, and TypeScript
   * takes one from a union only while a single constituent has a call signature. `NonFn` has
   * none. A second function type would, and the parameter then falls back to implicit `any`
   * with no error.
   */
  // oxlint-disable-next-line no-explicit-any -- `never[]` would type unannotated extra parameters as `never`
  [key: string]: ((value: V, ...rest: any[]) => unknown) | NonFn;
};

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
type CheckedSeal<V extends AnyVal, G extends SealImpl<V>> = [string] extends [SeedOf<V>]
  ? G
  : [string] extends [Parameters<G>[0]]
    ? Invalid<"a seal takes the payload, not a wire format; decode before sealing">
    : G;

/**
 * What `create` must be: any arguments, a payload out. The result is not a value yet. The type's
 * seal closes it, so `create` cannot bypass the seal.
 */
type Minter<V extends AnyVal> = (...args: never[]) => SeedOf<V>;

/** The public face of `create`: its own arguments, and whatever the seal returns. */
type Minting<V extends AnyVal, N, F> = N extends (...args: infer A) => unknown
  ? (...args: A) => Constructed<V, F>
  : undefined;

type CreateMethod<V extends AnyVal, N, F> = [Minting<V, N, F>] extends [undefined]
  ? Record<never, never>
  : {
      /** Mints a payload and seals it, so it returns whatever the seal returns. */
      create: Minting<V, N, F> & {
        /** Reuses the minter and seal without copying their terminal payload. */
        nocopy: Minting<V, N, F>;
      };
    };

type SealMethod<F> = [WithoutDefaultSeal<F>] extends [undefined]
  ? Record<never, never>
  : {
      /**
       * The single gate a payload passes to become a value. `create` and `patch` both go
       * through it.
       */
      seal: WithoutDefaultSeal<F> & {
        /** Runs the same custom seal without copying its terminal payload. */
        nocopy: WithoutDefaultSeal<F>;
      };
    };

/**
 * `patch` derives by sealing the new payload. With a custom seal it propagates whatever the seal
 * returns. Without one the default seal is the copy, so it returns the Val.
 */
type Derive<V extends AnyVal, F, Arg> = (value: V, arg: Arg) => Constructed<V, F>;

/**
 * Drops the trailing default-seal parameter from a registered seal: callers pass the payload and
 * nothing else.
 */
type WithoutDefaultSeal<F> = F extends (...args: infer A) => infer R
  ? A extends [infer Value, unknown]
    ? (value: Value) => R
    : F
  : F;

type Derivable<V extends AnyVal, P> = [P] extends [never]
  ? SeedOf<V>
  : Omit<SeedOf<V>, P & keyof SeedOf<V>>;

/**
 * `patch` exists only when there is something to patch: `Patch` is `never` for primitives and
 * arrays, so for those the function is left out of the type. Write a named derivation of your
 * own instead, and seal inside it.
 */
type PatchMethod<V extends AnyVal, F, P> = [Patch<Derivable<V, P>>] extends [never]
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
      patch: Derive<V, F, Patch<Derivable<V, P>>>;
    };

/**
 * A type's members, and nothing else. Not callable: constructors come from `Val.sealer`, so a
 * companion built without one cannot build values.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 */
export type Companion<
  V extends AnyVal,
  M extends CompanionMembers<V>,
  N = undefined,
  F = undefined,
  P = never,
> = Omit<M, Wired> &
  CreateMethod<V, N, F> &
  SealMethod<F> &
  PatchMethod<V, F, P> & {
    /** Every member `implTrait` registered. Read by `Trait`'s `dyn`. */
    readonly __valof_traits: Members;
  };

/**
 * A companion that kept the constructor it was built from.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 */
export type Sealed<V extends AnyVal, M extends CompanionMembers<V>> = ((value: SeedOf<V>) => V) & {
  nocopy: Nocopy<V>;
} & Companion<V, M>;

/**
 * What `.impl` accepts once a name is taken: anything but a name a trait already uses, its shared
 * members included, or one an earlier `.impl` collected. Shadowing a trait's member would make
 * `User.greet(u)` and `Greetable.greet(u)` disagree.
 *
 * The check is placed on the parameter rather than the constraint. In the constraint the inferred
 * `M & T` stops satisfying {@link CompanionMembers}, and `equals` breaks with it.
 */
type Grown<Taken, M> = M & {
  [K in keyof M]: K extends Taken ? "this name is already taken" : unknown;
};

/**
 * What `implTrait` accepts for `Tr`, or the `Invalid` message saying why this type cannot implement
 * it.
 *
 * The checks are placed on a parameter. In the return type they would fail only where the companion
 * is assigned, which is a line away from the call and reads as something else.
 *
 * The shape is not among them: a Val that declares a trait it does not hold the fields for is
 * rejected where it is declared, so it never reaches a companion. See {@link Val}.
 *
 * `Tr` infers only through a branch that names it structurally, which the type-argument form's
 * mapped type does not. A call written in that form leaves `Tr` at its constraint, where
 * `NamesOf<Tr>` is `string`: the first branch catches that before the rest read a name that is not
 * there.
 */
type Takes<V extends AnyVal, Tr extends AnyTrait, T, Ok> =
  string extends NamesOf<Tr>
    ? "pass the members this trait leaves open, or name the trait as the type argument"
    : [NamesOf<Tr>] extends [TraitsOf<V>]
      ? [keyof MembersOf<Tr> & keyof T] extends [never]
        ? [keyof MembersOf<Tr> & PayloadKeys<V>] extends [never]
          ? Ok
          : "a member cannot take the name of a field the payload holds"
        : "another trait already answers to one of these names"
      : "the type does not declare this trait";

/** What the companion form takes once the trait itself has answered for every {@link Final}. */
type Complete<Tr extends AnyTrait, G> = [Exclude<FinalsOf<Tr>, keyof G>] extends [never]
  ? TraitCompanion<Tr, G>
  : "this trait's companion has not implemented every member declared Final";

/** The second argument, absent where the trait answered for every member itself. */
type Passes<Tr extends AnyTrait, G, V> = [keyof Omit<MembersOf<Tr>, keyof G>] extends [never]
  ? [impl?: Implement<Tr, G, V>]
  : [impl: Implement<Tr, G, V>];

/** What the companion-less form takes: every member, and only where the trait declares no final. */
type Alone<Tr extends AnyTrait, V> = [FinalsOf<Tr>] extends [never]
  ? Implement<Tr, Record<never, never>, V>
  : "this trait implements members of its own: pass its companion";

/**
 * A constructor for `V`, which can grow members without ceasing to be one.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 *
 * No `.implSeal` here: a sealer is the default seal, and a second one beside it would bypass the
 * first. No `.implCreate` either: beside a callable constructor, a `create` narrows nothing.
 */
export type Sealer<V extends AnyVal, T extends CompanionMembers<V> = Record<never, never>> = Sealed<
  V,
  T
> & {
  /**
   * Collects the members for the type, in one call, which ends the chain. Call it with no argument
   * to close the chain with no member.
   *
   * A member reaching the companion, for `patch`, for the constructor, for a trait's member or for
   * a sibling, references it and annotates its return type. Referencing a declaration inside its
   * own initializer is a circularity, which TypeScript reports as TS7023.
   */
  impl: {
    // A separate step because TypeScript cannot infer type arguments partially, and two
    // overloads rather than a default `M`: a defaulted type parameter stops TypeScript using
    // the constraint as a contextual type, leaving every first parameter implicitly `any`.
    (): Sealed<V, T>;
    <M extends CompanionMembers<V>>(fns: Grown<keyof T, M>): Sealed<V, M & T>;
  };
  /** Implements a trait the type declares. See {@link CompanionBuilder.implTrait}. */
  implTrait: {
    <Tr extends AnyTrait>(
      impl: Takes<V, Tr, T, Alone<Tr, V>>,
    ): Sealer<V, T & Unbound<MembersOf<Tr>, V>>;
    <Tr extends AnyTrait, G>(
      trait: Takes<V, Tr, T, Complete<Tr, G>>,
      ...impl: Passes<Tr, G, V>
    ): Sealer<V, T & Unbound<MembersOf<Tr>, V>>;
  };
};

/**
 * What `Val.companion` returns: the mirror of {@link Sealer}, differing only in that nothing
 * was ever callable.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 *
 * `implSeal` and `implCreate` are separate steps because a seal must be idempotent. Minting
 * belongs in `create`, whose payload is then sealed like any other.
 */
export type CompanionBuilder<
  V extends AnyVal,
  N = undefined,
  F = undefined,
  P = never,
  T extends CompanionMembers<V> = Record<never, never>,
> = Companion<V, T, N, F, P> & {
  /**
   * Collects the members for the type, in one call. Everything the library reserves has its own
   * step. See {@link Sealer.impl}.
   */
  impl: {
    (): Companion<V, T, N, F, P>;
    // A trait's member is registered, so `.impl` may not register one over it: the type would keep
    // the trait's signature while `dyn` kept calling what `implTrait` recorded.
    <M extends CompanionMembers<V>>(fns: Grown<keyof T, M>): Companion<V, M & T, N, F, P>;
  };
  /**
   * Implements a trait the type declares. The members the trait leaves open arrive as a second
   * argument, with their first parameter fixed to the Val as everywhere else; a trait that
   * leaves none takes no second argument.
   *
   * A member the trait declared {@link Final} is not passed here: it arrives unchanged, and nothing
   * can override it.
   */
  implTrait: {
    // No companion to pass when the trait implements nothing of its own: the type argument is
    // the whole of it, and the members arrive where the companion would have.
    <Tr extends AnyTrait>(
      impl: Takes<V, Tr, T, Alone<Tr, V>>,
    ): CompanionBuilder<V, N, F, P, T & Unbound<MembersOf<Tr>, V>>;
    <Tr extends AnyTrait, G>(
      trait: Takes<V, Tr, T, Complete<Tr, G>>,
      ...impl: Passes<Tr, G, V>
    ): CompanionBuilder<V, N, F, P, T & Unbound<MembersOf<Tr>, V>>;
  };
  /** Registers the payload-minting constructor as `create`. Any arguments, a payload out. */
  implCreate: <G extends Minter<V>>(create: G) => CompanionBuilder<V, G, F, P, T>;
  /**
   * Replaces the seal. Its parameter may be wider than the payload, so a schema library can parse
   * into it, but not so wide that a wire format fits: see {@link CheckedSeal}.
   */
  implSeal: <G extends SealImpl<V>>(seal: CheckedSeal<V, G>) => CompanionBuilder<V, N, G, P, T>;
  /**
   * Takes keys out of the derivation path: `patch` stops accepting them in its patch.
   *
   * For what a `create` mints and nothing afterwards may change: an id, a `createdAt`, a
   * version counter.
   *
   * ```ts
   * Val.companion<User>()
   *   .implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f }))
   *   .implSeal(seal)
   *   .fixed<"id">();
   * ```
   *
   * The keys are a type argument and do not exist at runtime. This constrains the derivation
   * path, not the value: `Val.of` can still forge one.
   */
  fixed: <K extends keyof SeedOf<V> & string>() => CompanionBuilder<V, N, F, P | K, T>;
};

/**
 * The payload's own keys, which a trait member may not shadow: a box forwards everything but a
 * member to the value, and a frozen field a member shadowed would break the proxy's invariant.
 */
type PayloadKeys<V extends AnyVal> = PayloadOf<V> extends object ? keyof PayloadOf<V> : never;

const isObjectShaped = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

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

const development =
  typeof process === "undefined" ? false : process.env["NODE_ENV"] !== "production";

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
    if (value === null || typeof value !== "object") {
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
    if (value === null || typeof value !== "object") return value;
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
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    owned.add(value);
    for (const key of Object.keys(value)) visit((value as Record<string, unknown>)[key]);
  };
  visit(root);
  adopted.delete(root);
};

/** Adopt a caller-owned payload. Development validates and freezes every node before returning. */
const adopt = <T>(value: T): T => {
  if (value === null || typeof value !== "object") return value;
  if (owned.has(value)) return value;

  if (!development) {
    adopted.add(value);
    return value;
  }

  const active = new WeakSet<object>();
  const done = new WeakSet<object>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object" || owned.has(node) || done.has(node)) return;
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
 * Assignment cannot carry a user's function: a sealer's target is a function, whose `name` and
 * `length` are read-only, so `impl({ name })` would throw. Both are configurable, so defining
 * works. The library's own keys never collide and are assigned.
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

/** What the builder's steps registered. `.fixed` is a type argument alone, so it leaves none. */
type Ctors = {
  create?: AnyFn;
  seal?: (value: unknown, seal: (value: unknown) => unknown) => unknown;
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
 * Attaches what the steps registered, plus the user's own members, to `target`.
 *
 * Everything that produces a value goes through `seal`: the registered one, or a copy when the
 * type did not replace it. Nothing is copied before that. The one deep copy happens in the
 * default seal that a custom one returns through.
 */
const attach = (
  target: Record<string, unknown>,
  fns: Record<string, unknown>,
  ctors: Ctors,
  traits: Record<string, unknown>,
  callable: boolean,
): Record<string, unknown> => {
  const { create, seal: custom } = ctors;
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
  // A derivation that changed nothing returns the value it started from, so a framework comparing
  // by identity sees no update. A custom seal owns the return shape, so the value goes back
  // through it: the copy inside recognizes the node and returns the same one.
  const keep: (value: unknown) => unknown = custom ? seal : (value) => value;

  if (create) {
    const minted = (...args: never[]) => seal(create(...args));
    minted.nocopy = (...args: never[]) => nocopy(create(...args));
    target.create = minted;
  }
  if (custom) {
    define(seal, "nocopy", nocopy);
    target.seal = seal;
  }
  if (callable) target.nocopy = nocopy;

  // Same idea for a registered derivation, which cannot reach the companion it is being
  // defined on: the seal arrives as its third argument.
  target.patch = (value: unknown, patch: Record<string, unknown>) => {
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
  };

  // A trait's members join the type's own, so they grow the same way. The record is
  // what `Trait`'s `dyn` reads, and keeping it here means `val.ts` never imports `trait.ts`.
  target.__valof_traits = traits;
  for (const key of Object.keys(traits)) define(target, key, traits[key]);
  for (const key of Object.keys(fns)) define(target, key, fns[key]);

  return target;
};

/**
 * One builder state: what the steps registered so far, plus the ones still open.
 *
 * A sealer's target is the default constructor itself, which is what lets its steps return
 * something still callable. `.impl` closes the chain either way.
 */
const build = <V extends AnyVal>(
  ctors: Ctors,
  callable: boolean,
  traits: Record<string, unknown> = {},
): object => {
  // A function is not a `Record`, so the cast is here rather than at every assignment in
  // `attach`.
  const base = () =>
    (callable ? (value: SeedOf<V>): V => own(value) as unknown as V : {}) as unknown as Record<
      string,
      unknown
    >;
  const target = attach(base(), {}, ctors, traits, callable);
  const step = (next: Ctors): object => build<V>(next, callable, traits);

  // `.impl` takes one call, so what it returns carries no step.
  target.impl = (fns: Record<string, unknown> = {}) => attach(base(), fns, ctors, traits, callable);
  // The finals go on last: the type keeps them out of `impl`, and this keeps a cast out too.
  // No companion where the trait implements nothing of its own: the members arrive in its place.
  // The Val's own go on last, the type having kept every `Final` one out of them.
  target.implTrait = (
    trait: { __valof_shared?: Record<string, unknown> },
    impl: Record<string, unknown> = {},
  ) =>
    build<V>(ctors, callable, {
      ...traits,
      ...(trait.__valof_shared ?? trait),
      ...impl,
    });
  if (callable) return target;

  target.implCreate = (create: AnyFn) => step({ ...ctors, create });
  target.implSeal = (seal: NonNullable<Ctors["seal"]>) => step({ ...ctors, seal });
  target.fixed = () => step(ctors);
  return target;
};

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

export const Val = {
  /**
   * The default seal, with the type named explicitly: brand the payload and copy it. A called
   * `Val.sealer` and the seal passed to a custom one do the same thing; only the type differs.
   */
  of: Object.assign(own as <V extends AnyVal>(value: SeedOf<V>) => V, {
    /**
     * Uses a payload without copying it. With an explicit `V`, TypeScript cannot also infer
     * the argument's precise readonlyness; the caller must ensure it will not change.
     */
    nocopy: adopt as <V extends AnyVal>(value: SeedOf<V>) => V,
  }),
  /**
   * The other direction: a plain, mutable copy of the payload, for code that does not know
   * about `readonly`.
   *
   * It copies because the brand is phantom: a Val is its payload at run time, so returning that
   * object under a mutable type would put the caller's writes into the value.
   */
  unwrap: detach as <V extends AnyVal>(value: V) => PayloadOf<V>,
  /**
   * Creates the constructor for a Val. `Val.companion` is the same shape for a type with a
   * smart constructor, minus the callability.
   *
   * `V` is given as a type argument; the members are inferred by `.impl()`.
   */
  sealer: <V extends AnyVal & NotEnum<V>>(): Sealer<V> => build<V>({}, true) as Sealer<V>,
  /**
   * Bundles a type's members without a constructor.
   *
   * Constructors get their own steps rather than sitting in `.impl`, which fixes every
   * function's first parameter to the Val. A constructor does not fit that shape.
   */
  companion: <V extends AnyVal & NotEnum<V>>(): CompanionBuilder<V> =>
    build<V>({}, false) as CompanionBuilder<V>,
} as const;
