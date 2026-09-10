import type {
  AnyTrait,
  FinalsOf,
  Implement,
  Members,
  MembersOf,
  NamesOf,
  ShapeOf,
  TraitCompanion,
  TraitsOf,
  Unbound,
} from "./trait.ts";

/** Primitives allowed as values. `undefined` is deliberately excluded. */
type Primitive = string | number | boolean | bigint | null;

export type AnyVal = { readonly __valof_internal_phantom_brand: string };

/** Marker surfaced in the type when a payload violates the allowed-type rules. */
type Invalid<Msg extends string> = { readonly __valError: Msg };

type OptionalKeys<T> = {
  [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? K : never;
}[keyof T];

type Validate<T, Root extends boolean = true> = [T] extends [AnyVal]
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
        ? [Exclude<keyof T, string>] extends [never]
          ? {
              [K in keyof T]: K extends OptionalKeys<T>
                ? Validate<Exclude<T[K], undefined>, false> | undefined
                : undefined extends T[K]
                  ? Invalid<"required property cannot be undefined; use null or make it optional">
                  : Validate<T[K], false>;
            }
          : Invalid<"keys must be strings; a number or symbol key does not survive a JSON round trip">
        : Invalid<"not a plain value">;

/** Recursion stops at a nested Val: it is already deep-readonly. */
export type DeepReadonly<T> = [T] extends [AnyVal]
  ? T
  : [T] extends [Primitive]
    ? T
    : [T] extends [ReadonlyArray<infer E>]
      ? number extends T["length"]
        ? ReadonlyArray<DeepReadonly<E>>
        : { readonly [I in keyof T]: DeepReadonly<T[I]> }
      : [T] extends [object]
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

/** The payload, or the annotated version of it when it breaks the allowed-type rules. */
export type Checked<T> = [T] extends [Validate<T>] ? T : Validate<T>;

/**
 * The conditional lives here, not {@link Val}. An alias whose top level is a conditional loses
 * its name once it resolves, so `User` would print as the expanded intersection, phantom keys
 * included, in every hover. An alias over an intersection keeps the name.
 *
 * `T extends Validate<T>` is the natural spelling. On a type alias that is TS2313 "circular
 * constraint", hence the conditional.
 */
type Phantom<K extends string, T> = [T] extends [Validate<T>]
  ? {
      readonly __valof_internal_phantom_brand: K;
      /** Exists only so the original payload type can be recovered. */
      readonly __valof_internal_phantom_payload: T;
    }
  : { readonly __valof_internal_phantom_brand: Validate<T> };

/**
 * The trait brands, or the marker when the payload does not hold what a trait requires.
 *
 * Several traits are one intersection: `Val<"User", P, Greetable & Serializable>`. Their brand
 * maps intersect too, which is what lets a Val stay assignable to each of them.
 */
type TraitBrand<T, Tr> = [Tr] extends [never]
  ? unknown
  : Tr extends AnyTrait
    ? {
        readonly __valof_internal_phantom_trait_brands: DeepReadonly<Checked<T>> extends ShapeOf<Tr>
          ? Tr["__valof_internal_phantom_trait_brands"]
          : Invalid<"the payload does not hold what the trait requires">;
      }
    : unknown;

/** A branded value type. A payload that breaks the allowed-type rules is a type error. */
export type Val<K extends string, T, Tr extends AnyTrait = never> = DeepReadonly<Checked<T>> &
  Phantom<K, T> &
  TraitBrand<T, Tr>;

/** The Val's brand string. */
export type BrandOf<V extends AnyVal> = V["__valof_internal_phantom_brand"];

/** The Val's raw payload type. */
export type PayloadOf<V extends AnyVal> = V extends {
  readonly __valof_internal_phantom_payload: infer T;
}
  ? T
  : never;

/**
 * The payload as constructors, `Val.of` and a custom seal accept it.
 *
 * Deep-readonly to accept more, not to enforce: every constructor deep-copies its argument. A
 * Val is itself deep-readonly, so a payload taken from an existing value fits.
 */
export type SeedOf<V extends AnyVal> = DeepReadonly<PayloadOf<V>>;

/**
 * The patch accepted by `patch`, at every depth.
 *
 * Taken over a payload rather than a Val, so a custom `patch` can patch a subset of the fields:
 * `Patch<Omit<SeedOf<V>, "id">>` keeps a generated id out.
 *
 * - omit the key → leave it unchanged
 * - `{ k: undefined }` → delete it (only optional keys allow this at the type level)
 * - `{ k: value }` → set it
 * - `{ k: { j: value } }` → set `j` and leave the rest of `k` alone
 */
export type Patch<T> = T extends object
  ? T extends ReadonlyArray<unknown> | AnyVal
    ? never
    : { [K in Exclude<keyof T, OptionalKeys<T>>]?: PatchValue<T[K]> } & {
        [K in OptionalKeys<T>]?: PatchValue<T[K]> | undefined;
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

/** What a companion may hold besides functions: constants, lookup tables, and so on. */
type NonFn = Primitive | undefined | readonly unknown[] | Record<string, unknown>;

/** The functions a companion accepts, each taking its Val first. */
type CompanionFns<V extends AnyVal> = {
  /**
   * Rejected so they cannot be mistaken for registrations: everything the library wires has a
   * step of its own. A `seal` whose first parameter accepts the Val, common for primitive
   * payloads, would otherwise satisfy the index signature and attach as an ordinary function,
   * leaving `patch` / `update` unrouted. `equals` has a step of its own, and `patch` / `update`
   * are the library's, not yours: a derivation with different rules deserves its own name, and
   * can seal inside it. Use `.implEquals` / `.implSeal` / `.implCreate`.
   */
  equals?: never;
  patch?: never;
  update?: never;
  seal?: never;
  create?: never;
  /**
   * The record `Trait`'s `dyn` reads, and anything else the library keeps on a companion. Defined
   * before the registrations, so a function taking the name would stomp it and leave every boxed
   * member unbound.
   */
  [key: `__valof_${string}`]: never;
  /**
   * The steps are the library's, whichever ones it grows. Nothing is shadowed: `.impl` builds a
   * fresh object, and the chain has ended by then. But `User.implTrait(u)` reads as the step it
   * is not, so the prefix stays the library's.
   */
  [key: `impl${string}`]: never;
  /**
   * One callable member only. This is the contextual type for the Val parameter, and TypeScript
   * takes one from a union only while a single constituent has a call signature. `NonFn` has
   * none. A second function type would, and the parameter then falls back to implicit `any`
   * with no error.
   */
  // oxlint-disable-next-line no-explicit-any -- `never[]` would type unannotated extra parameters as `never`
  [key: string]: ((value: V, ...rest: any[]) => unknown) | NonFn;
};

type Eq<T> = (a: T, b: T) => boolean;

/**
 * How to compare one child. Written where structure alone gives the wrong answer, and left out
 * everywhere else, where the default deep comparison already agrees.
 *
 * The recursion stops at a nested Val, as {@link DeepReadonly} and {@link Patch} do: hand over
 * its companion rather than walking its payload by hand, which would bypass the equality the
 * type declared for itself.
 */
type EqSpec<T> = [T] extends [AnyVal]
  ? Eq<T> | { equals: Eq<T> }
  : [T] extends [Primitive]
    ? Eq<T>
    : [T] extends [readonly unknown[]]
      ? Eq<T> | EqElements<T>
      : [T] extends [object]
        ? Eq<T> | { [K in keyof T]?: EqSpec<T[K]> }
        : never;

/**
 * An array takes one spec for every element. A tuple takes one per position, all of them: a
 * shorter spec would be indistinguishable at run time from the single-element form, since the
 * spec is all `toEq` sees. `undefined` leaves a position on the default.
 */
type EqElements<T> = T extends readonly unknown[]
  ? number extends T["length"]
    ? readonly [EqSpec<T[number]>]
    : { readonly [I in keyof T]: EqSpec<T[I]> | undefined }
  : never;

/**
 * What `.implEquals` takes: your own comparison, or a spec for the payload's children. A bare
 * function is the override, so the spec drops that form at this level alone.
 *
 * A primitive payload has no children, which leaves the override by itself. That falls out of
 * the same rules rather than being a case of its own.
 */
type EqImpl<V extends AnyVal> = ((a: V, b: V, deepEquals: Eq<V>) => boolean) | EqPayload<SeedOf<V>>;

type EqPayload<T> = [T] extends [AnyVal]
  ? { equals: Eq<T> }
  : [T] extends [Primitive]
    ? never
    : [T] extends [readonly unknown[]]
      ? EqElements<T>
      : [T] extends [object]
        ? { [K in keyof T]?: EqSpec<T[K]> }
        : never;

/**
 * What the seal produces, propagated verbatim. The library never inspects it, so `Result` and
 * friends need no support here.
 */
type Constructed<V extends AnyVal, F> = F extends (...args: never[]) => infer R ? R : V;

type SealImpl<V extends AnyVal> = (value: SeedOf<V>, seal: (value: SeedOf<V>) => V) => unknown;

/**
 * The seal's parameter may be wider than the payload, so a schema library can parse into it,
 * but not so wide that it accepts a wire format. `patch` and `update` hand a payload back to the
 * seal, so one written to decode a JSON string breaks as soon as a value is derived from another.
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
 * What `create` must be: any arguments, a payload out. The result is not a value yet. The
 * type's seal closes it, so `create` is not a way past the seal.
 */
type Minter<V extends AnyVal> = (...args: never[]) => SeedOf<V>;

/** The public face of `create`: its own arguments, and whatever the seal returns. */
type Minting<V extends AnyVal, N, F> = N extends (...args: infer A) => unknown
  ? (...args: A) => Constructed<V, F>
  : undefined;

/** `create`, present only on a companion that registered one. */
type CreateMethod<V extends AnyVal, N, F> = [Minting<V, N, F>] extends [undefined]
  ? Record<never, never>
  : {
      /** Mints a payload and seals it, so it returns whatever the seal returns. */
      create: Minting<V, N, F>;
    };

/** `seal`, present only on a companion that replaced the default one. */
type SealMethod<F> = [WithoutDefaultSeal<F>] extends [undefined]
  ? Record<never, never>
  : {
      /**
       * The single gate a payload passes to become a value. `create`, `patch` and `update` all
       * go through it.
       */
      seal: WithoutDefaultSeal<F>;
    };

/**
 * `patch` and `update` derive by sealing the new payload. With a custom seal they propagate
 * whatever it returns. Without one the default seal is the copy, so they hand back the Val.
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

/** The payload minus the keys `.fixed` took out of the derivation path. */
type Derivable<V extends AnyVal, P> = [P] extends [never]
  ? SeedOf<V>
  : Omit<SeedOf<V>, P & keyof SeedOf<V>>;

/**
 * `T`, with every key it has beyond `S`'s mapped to `never`.
 *
 * Narrowing `update`'s callback by return type is not enough: excess-property checking fires
 * only when an object literal meets its target directly, and an un-annotated arrow body is
 * inferred first, so `(v) => ({ ...v, id: "forged" })` slips through. An uninhabitable key
 * catches it.
 */
type NoExtra<T, S> = T & Record<Exclude<keyof T, keyof S>, never>;

/**
 * `patch` exists only when there is something to patch: `Patch` is `never` for primitives and
 * arrays, so for those the function is left out of the type. Write a named derivation of your
 * own instead, and seal inside it.
 */
type PatchMethod<V extends AnyVal, F, P> = [Patch<Derivable<V, P>>] extends [never]
  ? Record<never, never>
  : {
      /**
       * Derives by sealing, so it returns whatever the seal returns: there is no hole through
       * which `patch` bypasses a smart constructor.
       *
       * A nested object merges, so a patch cannot shrink one. `{ staff: { u1: undefined } }`
       * drops one entry; handing over a whole smaller object leaves the rest in place. Use
       * `update` to replace it outright. See {@link Patch}.
       */
      patch: Derive<V, F, Patch<Derivable<V, P>>>;
    };

/**
 * With keys taken out of the patch path, the callback returns only what is left and the default
 * merges it onto the value.
 */
type UpdateMethod<V extends AnyVal, F, P> = {
  /**
   * Derives a value from a transform of it, by sealing the result.
   *
   * Value to value on purpose: a fallible transform chains into `Result<Result<...>>`.
   * Use `patch` and a combinator of your own for that.
   */
  update: [P] extends [never]
    ? Derive<V, F, (value: V) => SeedOf<V>>
    : <T extends Derivable<V, P>>(
        value: V,
        fn: (value: V) => NoExtra<T, Derivable<V, P>>,
      ) => Constructed<V, F>;
};

/**
 * A type's functions, and nothing else. Not callable: constructors come from `Val.sealer`, so a
 * companion built without one cannot build values.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 */
export type Companion<
  V extends AnyVal,
  M extends CompanionFns<V>,
  N = undefined,
  F = undefined,
  P = never,
> = Omit<M, "equals" | "patch" | "update"> &
  CreateMethod<V, N, F> &
  SealMethod<F> &
  PatchMethod<V, F, P> &
  UpdateMethod<V, F, P> & {
    /** Structural equality: key-order independent, ignoring `undefined`-valued keys. */
    equals: (a: V, b: V) => boolean;
    /** Every member `implTrait` registered. Read by `Trait`'s `dyn`. */
    readonly __valof_traits: Members;
  };

/**
 * A companion that kept the constructor it was built from.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 */
export type Sealed<V extends AnyVal, M extends CompanionFns<V>> = ((value: SeedOf<V>) => V) &
  Companion<V, M>;

/**
 * What `.impl` accepts once traits are registered: anything but a name a trait already answers
 * to, its shared functions included. Shadowing one of those is what would make `User.greet(u)`
 * and `Greetable.greet(u)` disagree.
 *
 * The check rides on the parameter rather than the constraint. In the constraint the inferred
 * `M & T` stops satisfying {@link CompanionFns}, and `equals` breaks with it.
 */
type Grown<Taken, M> = M & {
  [K in keyof M]: K extends Taken ? "a trait already answers to this name" : unknown;
};

/**
 * What `implTrait` accepts for `Tr`, or the sentence saying why this type cannot implement it.
 *
 * The checks ride on a parameter. In the return type they would fail only where the companion is
 * assigned, which is a line away from the call and reads as something else.
 */
type Takes<V extends AnyVal, Tr extends AnyTrait, T, Ok> = [NamesOf<Tr>] extends [TraitsOf<V>]
  ? V extends ShapeOf<Tr>
    ? [keyof MembersOf<Tr> & keyof T] extends [never]
      ? [keyof MembersOf<Tr> & PayloadKeys<V>] extends [never]
        ? Ok
        : "a member cannot take the name of a field the payload holds"
      : "another trait already answers to one of these names"
    : "the payload does not hold what this trait requires"
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
 * A constructor for `V`, which can grow functions without ceasing to be one.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 *
 * No `.implSeal` here: a sealer is the default seal, and a second one beside it would be a hole
 * past the first. No `.implCreate` either: beside a callable constructor, a `create` narrows
 * nothing.
 */
export type Sealer<V extends AnyVal, T extends CompanionFns<V> = Record<never, never>> = Sealed<
  V,
  T
> & {
  /** Collects the functions for the type. */
  impl: {
    // A separate step because TypeScript cannot infer type arguments partially, and two
    // overloads rather than a default `M`: a defaulted type parameter stops TypeScript using
    // the constraint as a contextual type, leaving every first parameter implicitly `any`.
    (): Sealed<V, T>;
    <M extends CompanionFns<V>>(fns: Grown<keyof T, M>): Sealed<V, M & T>;
  };
  /** Replaces the default deep equality. See {@link EqImpl}. */
  implEquals: (spec: EqImpl<V>) => Sealer<V, T>;
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
  T extends CompanionFns<V> = Record<never, never>,
> = Companion<V, T, N, F, P> & {
  /** Collects the functions for the type. Everything the library wires has its own step. */
  impl: {
    (): Companion<V, T, N, F, P>;
    // A trait's member is registered, so `.impl` may not grow one over it: the type would keep
    // the trait's signature while `dyn` kept calling what `implTrait` recorded.
    <M extends CompanionFns<V>>(fns: Grown<keyof T, M>): Companion<V, M & T, N, F, P>;
  };
  /**
   * Implements a trait the type declares. The members the trait leaves open arrive as a second
   * argument, with their first parameter fixed to the Val as everywhere else; a trait that
   * leaves none takes no second argument.
   *
   * A member the trait declared {@link Final} is not passed here: it arrives as it stands, and
   * nothing can override it.
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
  /** Replaces the default deep equality. See {@link EqImpl}. */
  implEquals: (spec: EqImpl<V>) => CompanionBuilder<V, N, F, P, T>;
  /** Registers the payload-minting constructor as `create`. Any arguments, a payload out. */
  implCreate: <G extends Minter<V>>(create: G) => CompanionBuilder<V, G, F, P, T>;
  /**
   * Replaces the seal. Its parameter may be wider than the payload, so a schema library can parse
   * into it, but not so wide that a wire format fits: see {@link CheckedSeal}.
   */
  implSeal: <G extends SealImpl<V>>(seal: CheckedSeal<V, G>) => CompanionBuilder<V, N, G, P, T>;
  /**
   * Takes keys out of the update path: `patch` stops accepting them in its patch, and `update`'s
   * callback returns only what is left, with the rest merged back on.
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
   * The keys are a type argument and do not exist at runtime. This constrains the update path,
   * not the value: `Val.of` can still forge one.
   */
  fixed: <K extends keyof SeedOf<V> & string>() => CompanionBuilder<V, N, F, P | K, T>;
};

/**
 * The payload's own keys, which a trait member may not shadow: a box forwards everything but a
 * member to the value, and a frozen field a member covered would break the proxy's invariant.
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
 * Structural deep comparison. Every companion carries it as the default `equals`.
 *
 * - independent of key order
 * - ignores keys whose value is `undefined` (`{ a: undefined }` equals `{}`)
 * - `NaN` equals `NaN`, and `-0` equals `0`
 *
 * Not exported from `./index.ts`: a free function cannot dispatch to a type's own `equals`, so
 * comparing two Vals with it would bypass a custom one. Overrides receive it as a third
 * argument instead (see {@link CompanionFns}).
 */
export const deepEquals = (a: unknown, b: unknown): boolean => {
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
      if (!deepEquals(x[i], y[i])) return false;
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
    if (!deepEquals(x[k], y[k])) return false;
  }
  return true;
};

/**
 * Builds the comparison a spec describes, falling back to {@link deepEquals} wherever it says
 * nothing. That fallback is what lets a spec name only the children structure gets wrong.
 *
 * A companion is told from a nested spec by its `equals`: a payload cannot hold a function
 * (see {@link Validate}), so an object whose `equals` is one can only be a companion. That test
 * comes first because a sealer is itself callable, and reading it as the comparison would run
 * the constructor and take its value for `true`.
 */
const toEq = (spec: unknown): ((a: unknown, b: unknown) => boolean) => {
  if (spec === undefined) return deepEquals;

  const companion = (spec as { equals?: unknown }).equals;
  if (typeof companion === "function") return companion as (a: unknown, b: unknown) => boolean;
  if (typeof spec === "function") return spec as (a: unknown, b: unknown) => boolean;

  if (Array.isArray(spec)) {
    // One spec compares every element, two or more compare by position. The readings coincide
    // for a one-element tuple, the only shape both can describe.
    const eqs = (spec as readonly unknown[]).map(toEq);
    const every = eqs.length === 1 ? eqs[0] : undefined;
    return (a, b) =>
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => (every ?? eqs[i] ?? deepEquals)(x, b[i]));
  }

  const named = new Map(Object.entries(spec as object).map(([k, s]) => [k, toEq(s)]));
  // The key rules are `deepEquals`', so a key the spec names but only one side carries still
  // fails on the count.
  return (a, b) => {
    if (a === b) return true;
    if (!isObjectShaped(a) || !isObjectShaped(b)) return false;
    const keys = Object.keys(a).filter((k) => a[k] !== undefined);
    if (keys.length !== Object.keys(b).filter((k) => b[k] !== undefined).length) return false;
    for (const key of keys) {
      if (!Object.hasOwn(b, key)) return false;
      if (!(named.get(key) ?? deepEquals)(a[key], b[key])) return false;
    }
    return true;
  };
};

/**
 * The nodes this module built. Subtrees are immutable, so recognising one lets a derivation
 * copy only the path down to what changed and share everything below it.
 *
 * Leaves are recorded too. A record costs about 20x a lookup and never earns that back in
 * copying time, but frameworks compare identity: without it every small nested Val gets a new
 * identity on each `patch`, and a memoised component re-renders for a change it never saw.
 *
 * Missing a node costs a copy, never correctness, so the set can be lost across a
 * `structuredClone` or a JSON round trip with nothing to repair.
 */
const owned = new WeakSet<object>();

const development =
  typeof process === "undefined" ? false : process.env["NODE_ENV"] !== "production";

/**
 * Builds the recursive deep copy, in an owning and a non-owning form.
 *
 * `owning` is closed over rather than passed, so it cannot change underneath a copy in progress:
 * copying runs a payload's getters, which is someone else's code and can seal or unwrap.
 *
 * Values are frozen in development only. Breaking `readonly` takes a cast, and with nodes shared
 * that write lands in every value holding the node. Freezing measured at 25-30% and buys nothing
 * at run time, so production skips it.
 */
const deepCopy = (owning: boolean) => {
  const copy = <T>(value: T): T => {
    if (value === null || typeof value !== "object") return value;
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
 * new identity for anything memoised on it.
 */
const own = deepCopy(true);

/** A plain deep copy. What `Val.unwrap` hands back is not the library's. */
const detach = deepCopy(false);

/**
 * Assignment cannot carry a user's function: a sealer's target is a function, whose `name` and
 * `length` are read-only, so `impl({ name })` would throw. Both are configurable, so defining
 * works. The library's own keys never collide and are assigned.
 */
const define = <T extends object>(target: T, key: string, value: unknown): T => {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return target;
};

/** What the builder's steps registered, plus whether `.fixed` was called. */
type Ctors = {
  create?: AnyFn;
  seal?: (value: unknown, seal: (value: unknown) => unknown) => unknown;
  equals?: unknown;
  fixed?: boolean;
};

/**
 * Merges a patch onto a value node, and hands the node itself back when nothing changed.
 *
 * Nodes are shared and never mutated, so identical children mean equal subtrees. The walk that
 * applies the patch answers whether anything changed, per level, which is what lets an untouched
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
 * Attaches what the steps registered, plus the user's own functions, to `target`.
 *
 * Everything that produces a value goes through `seal`: the registered one, or a copy when the
 * type did not replace it. Nothing copies on the way in. The one deep copy happens in the
 * default seal that a custom one returns through.
 */
const attach = (
  target: Record<string, unknown>,
  fns: Record<string, unknown>,
  ctors: Ctors,
  traits: Record<string, unknown>,
): Record<string, unknown> => {
  const { create, seal: custom, equals } = ctors;
  const seal: (value: unknown) => unknown = custom ? (value) => custom(value, own) : own;
  // A derivation that changed nothing returns the value it started from, so a framework comparing
  // by identity sees no update. A custom seal owns the return shape, so the value goes back
  // through it: the copy inside recognises the node and hands the same one back.
  const keep: (value: unknown) => unknown = custom ? seal : (value) => value;

  // Bound here rather than attached raw, which is what keeps callers at two arguments. A spec
  // is not callable, so it takes the other branch.
  target.equals =
    typeof equals === "function"
      ? (a: unknown, b: unknown) =>
          (equals as (a: unknown, b: unknown, deep: typeof deepEquals) => boolean)(a, b, deepEquals)
      : equals === undefined
        ? deepEquals
        : toEq(equals);

  if (create) target.create = (...args: never[]) => seal(create(...args));
  if (custom) target.seal = seal;

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
    const merged = patched(value, patch);
    return Object.is(merged, value) ? keep(value) : seal(merged);
  };

  // The merge is what lets the untouched keys survive without the library knowing their names.
  target.update = (value: unknown, fn: (value: unknown) => unknown) => {
    const next =
      ctors.fixed && isObjectShaped(value)
        ? { ...value, ...(fn(value) as Record<string, unknown>) }
        : fn(value);
    // Only the transform that hands its argument straight back. Recognising a fresh object that
    // happens to be equal is `patch`'s job, where the walk is already paid for.
    return Object.is(next, value) ? keep(value) : seal(next);
  };

  // A trait's members are the type's own functions, so they grow the same way. The record is
  // what `Trait`'s `dyn` reads, and keeping it here means `val.ts` never reaches for `trait.ts`.
  target.__valof_traits = traits;
  for (const key of Object.keys(traits)) define(target, key, traits[key]);
  for (const key of Object.keys(fns)) define(target, key, fns[key]);

  return target;
};

/**
 * One builder state: what the steps registered so far, plus the ones still open.
 *
 * A sealer's target is the default constructor itself, which is what lets its steps hand back
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
  const target = attach(base(), {}, ctors, traits);
  const step = (next: Ctors): object => build<V>(next, callable, traits);

  target.impl = (fns: Record<string, unknown> = {}) => attach(base(), fns, ctors, traits);
  target.implEquals = (spec: unknown) => step({ ...ctors, equals: spec });
  // The finals go on last: the type keeps them out of `impl`, and this keeps a cast out too.
  // No companion where the trait implements nothing of its own: the members arrive in its place.
  // The Val's own go on last, the type having kept every `Final` one out of them.
  target.implTrait = (
    trait: { __valof_shared?: Record<string, unknown> },
    impl: Record<string, unknown> = {},
  ) => build<V>(ctors, callable, { ...traits, ...(trait.__valof_shared ?? trait), ...impl });
  if (callable) return target;

  target.implCreate = (create: AnyFn) => step({ ...ctors, create });
  target.implSeal = (seal: NonNullable<Ctors["seal"]>) => step({ ...ctors, seal });
  target.fixed = () => step({ ...ctors, fixed: true });
  return target;
};

export const Val = {
  /**
   * The default seal, with the type named explicitly: brand the payload and copy it. A called
   * `Val.sealer` and the seal handed to a custom one do the same thing; only the type differs.
   */
  of: own as <V extends AnyVal>(value: SeedOf<V>) => V,
  /**
   * The other direction: a plain, mutable copy of the payload, for code that does not know
   * about `readonly`.
   *
   * It copies because the brand is phantom: a Val is its payload at run time, so handing that
   * object back under a mutable type would put the caller's writes into the value.
   */
  unwrap: detach as <V extends AnyVal>(value: V) => PayloadOf<V>,
  /**
   * Creates the constructor for a Val. `Val.companion` is the same shape for a type with a
   * smart constructor, minus the callability.
   *
   * `V` is given as a type argument; the functions are inferred by `.impl()`.
   */
  sealer: <V extends AnyVal>(): Sealer<V> => build<V>({}, true) as Sealer<V>,
  /**
   * Bundles a type's functions without a constructor.
   *
   * Constructors get their own steps rather than sitting in `.impl`, which fixes every
   * function's first parameter to the Val. A constructor does not fit that shape.
   */
  companion: <V extends AnyVal>(): CompanionBuilder<V> =>
    build<V>({}, false) as CompanionBuilder<V>,
} as const;
