import { dual, duals, type Arity, type Dual, type Duals } from "./dual.ts";
import { Shared, Traits } from "./keys.ts";
import type {
  EnumKey,
  EnumTypes,
  TagKey,
  TagTypes,
  VariantOptionsKey,
  VariantOptionsTypes,
} from "./keys.ts";
import type {
  AnyTrait,
  Implement,
  MembersOf,
  NamesOf,
  TraitHost,
  TraitsOf,
  Unbound,
} from "./trait.ts";
import { development } from "./env.ts";
import {
  assertVariantPayload,
  equals,
  notFixedPoint,
  of,
  Val,
  type AnyFn,
  type AnyVal,
  type Argumentless,
  type CallBuildFirst,
  type CompanionMembers,
  type Complete,
  type DeepReadonly,
  type Grown,
  type Invalid,
  type Options,
  type Passes,
  type Patch,
  type PrivateCreate,
  type PrivateSeal,
  type Synchronous,
  type Takes,
  type Unpatchable,
  type UnpatchableKeys,
  type Unsealed,
  type Wired,
  type Writable,
} from "./val.ts";
import * as Enum from "./ns/enum.ts";

/**
 * The key that holds an enum companion's `match` on a tag string, and its `key`:
 * `Command[Tag].match(tag, handlers)`.
 *
 * @experimental
 */
export const Tag: unique symbol = Symbol();

/**
 * The key of the handler `match` runs for the variants that have no handler of their own, like `_`.
 * In an enum with a variant named `_`, `_` is that variant's handler, and only this key handles the
 * rest.
 *
 * ```ts
 * Shape.match(shape, { Circle: (c) => c.r, [Otherwise]: (rest) => rest.side });
 * ```
 *
 * @experimental
 */
export const Otherwise: unique symbol = Symbol();

/** Type-only carrier for the tag name. Private and protected members stay out of `keyof`. */
declare class TagPhantom<T extends string> {
  private readonly [TagKey]: T;
  /** Declaration emit erases private field types; protected keeps the name recoverable. */
  protected readonly [TagTypes]: T;
}

/**
 * The name of the tag field, intersected into what every variant holds. The default is `_tag`.
 *
 * ```ts
 * type Event = Enum<"Event", { Click: { x: number }; Key: { code: string } }, Tag<"kind">>;
 * const Event = Enum.companion<Event>().tag("kind").build();
 * ```
 *
 * The tag is real data and crosses the wire, so you can customize the name when an API already has
 * one.
 *
 * @experimental
 */
export type Tag<T extends string> = TagPhantom<T>;

/**
 * Type-only nominal identity carrying the whole declaration, so a companion can read the
 * variants, the shared fields, the traits and the tag name back off the union.
 */
declare class EnumPhantom<K, V, S, Tr, Tg, VT> {
  private readonly [EnumKey]: [K, V, S, Tr, Tg, VT];
  /** Declaration emit erases private field types; protected keeps the type arguments recoverable. */
  protected readonly [EnumTypes]: [K, V, S, Tr, Tg, VT];
}

/**
 * Every enum, as a constraint. A broken declaration does not satisfy it, so one check covers the
 * companion and `match` alike.
 *
 * @experimental
 */
export type AnyEnum = AnyVal &
  EnumPhantom<string, Record<string, object>, object, AnyTrait, string, Record<string, AnyTrait>>;

/** The declaration's own keys, which are the variants and nothing else. */
type VariantKeys<D> = Extract<keyof D, string>;

/** A variant's fields. A trait it declares carries its own, so both arrive in one argument. */
type FieldsIn<P> = [P] extends [AnyTrait] ? Writable<Pick<P, keyof P>> : P;

type VariantsIn<D> = { [N in VariantKeys<D>]: FieldsIn<D[N]> };

type VariantTraitsIn<D> = { [N in VariantKeys<D>]: TraitsIn<D[N]> };

type TagIn<X> = [X] extends [TagPhantom<infer T>] ? T : "_tag";

/** The fields every variant holds. A trait carries its own, so both arrive in one argument. */
type SharedIn<X> = Writable<Pick<X, keyof X>>;

type TraitsIn<X> = Extract<X, AnyTrait>;

/** The traits the enum declares and the ones one variant declares, either of which may be none. */
type Joined<A, B> = [A] extends [never] ? B : [B] extends [never] ? A : A & B;

type TraitNames<Tr> = [Tr] extends [never] ? never : Tr extends AnyTrait ? NamesOf<Tr> : never;

/** Distributes, so each key is compared against the whole: they differ only in a union. */
type Single<N, All = N> = N extends unknown ? ([All] extends [N] ? true : false) : false;

/**
 * Why this declaration cannot stand, or `never`. Read from the type arguments alone, so it lives in
 * the brand position (notes §11.2).
 *
 * One variant is rejected for the declaration emit, not for the shape: an indexed access over a
 * single key returns the variant itself, and the alias is lost with the union. A consumer's `.d.ts`
 * then expands onto the private phantoms and fails with TS4094. One variant is a Val anyway, so the
 * `Invalid` message says that rather than naming the emit. No variant at all needs no message: the
 * indexed access is `never`, and there is no value to build.
 */
type Fault<D, S, Tr extends AnyTrait, Tg extends string> =
  | (Single<VariantKeys<D>> extends true
      ? "an enum needs at least two variants; one is a Val"
      : never)
  | {
      [N in VariantKeys<D>]: [D[N]] extends [object]
        ? [D[N]] extends [ReadonlyArray<unknown>]
          ? "a variant's payload must be a record of fields"
          : Tg extends keyof D[N]
            ? "the tag cannot take the name of a field the payload holds"
            : // `dyn` picks the implementation by the companion it is passed, so the enum's
              // and the variant's would answer the same call differently.
              [TraitNames<Tr> & TraitNames<TraitsIn<D[N]>>] extends [never]
              ? never
              : "a variant cannot declare a trait the enum declares"
        : "a variant's payload must be a record of fields";
    }[VariantKeys<D>]
  | (Tg extends keyof S ? "the tag cannot take the name of a shared field" : never)
  // The companion reads a member first, so the type would show the library's and run the member.
  | ([MemberNames<Tr> & VariantKeys<D>] extends [never]
      ? never
      : "a trait member cannot take a variant's name")
  | ("match" extends MemberNames<Tr> ? "a trait member cannot take the name `match`" : never);

/** Every trait's member names. `keyof` over their union would keep only the shared ones. */
type MemberNames<Tr extends AnyTrait> =
  MembersOf<Tr> extends infer M ? (M extends unknown ? keyof M : never) : never;

// The fault goes in the brand the phantom carries, never at the top level of `Enum`. An alias
// whose top level is a conditional loses its name once it resolves, and a consumer's `.d.ts`
// then expands the union onto val.ts's private `Phantom`: TS4094 on the one line
// `export const Shape = Enum.companion<Shape>().build()`.
type Named<K extends string, D, S, Tr extends AnyTrait, Tg extends string> = [
  Fault<D, S, Tr, Tg>,
] extends [never]
  ? K
  : Invalid<Fault<D, S, Tr, Tg>>;

/**
 * A closed set of variants, declared as one record and derived into their union. Each variant is
 * a Val of its own, branded `` `${K}.${Name}` ``, holding its own payload plus the shared fields
 * plus the tag.
 *
 * ```ts
 * type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
 * const Shape = Enum.companion<Shape>().build();
 * ```
 *
 * The third argument is what every variant holds: shared fields, traits, the tag's name, or all
 * of them intersected. A trait intersected into one variant's payload is that variant's alone.
 *
 * ```ts
 * type Shape = Enum<"Shape", { Circle: { r: number } & Round }, Tag<"kind"> & { id: string }>;
 * ```
 *
 * @experimental
 */
type Enum<K extends string, D extends object, X extends object = Record<never, never>> = {
  [N in VariantKeys<D>]: Val<
    `${K}.${N}`,
    FieldsIn<D[N]> & SharedIn<X> & { [P in TagIn<X>]: N },
    Joined<TraitsIn<X>, TraitsIn<D[N]>>
  > &
    EnumPhantom<
      Named<K, D, SharedIn<X>, TraitsIn<X>, TagIn<X>>,
      VariantsIn<D>,
      SharedIn<X>,
      TraitsIn<X>,
      TagIn<X>,
      VariantTraitsIn<D>
    >;
}[VariantKeys<D>];

export { Enum };

/** Read through the class, since a private key is unreachable by an index. */
type Declared<E> =
  E extends EnumPhantom<infer K, infer V, infer S, infer Tr, infer Tg, infer VT>
    ? { name: K; variants: V; shared: S; traits: Tr; tag: Tg; variantTraits: VT }
    : never;

/**
 * The enum's own name, which every variant's brand is derived from.
 *
 * @experimental
 */
export type NameOf<E extends AnyEnum> = Declared<E>["name"] & string;

/**
 * The declared variants, as the record they were written in.
 *
 * @experimental
 */
export type VariantsOf<E extends AnyEnum> = Declared<E>["variants"];

/**
 * The fields every variant holds.
 *
 * @experimental
 */
export type SharedOf<E extends AnyEnum> = Declared<E>["shared"];

/**
 * The name of the tag field.
 *
 * @experimental
 */
export type TagOf<E extends AnyEnum> = Declared<E>["tag"] & string;

type DeclaredTraits<E extends AnyEnum> = Extract<Declared<E>["traits"], AnyTrait>;

type OwnTraits<E extends AnyEnum, N extends keyof VariantsOf<E>> = Extract<
  Declared<E>["variantTraits"][N],
  AnyTrait
>;

/**
 * One variant of the union.
 *
 * The top level is an intersection rather than an `Extract`, which is the same type and a
 * different hover: `Extract` resolves and the alias name goes with it, so an error prints the
 * expanded intersection.
 *
 * Write it where the variant is used, rather than giving it a second name with `type Circle =
 * VariantOf<Shape, "Circle">`. The prefix is what says which enum the variant belongs to, and a
 * variant is built through its companion for the same reason: `Shape.Circle.create({ r: 2 })`.
 *
 * @experimental
 */
export type VariantOf<E extends AnyEnum, N extends keyof VariantsOf<E>> = Val<
  `${NameOf<E>}.${N & string}`,
  VariantsOf<E>[N] & SharedOf<E> & { [P in TagOf<E>]: N & string },
  Joined<DeclaredTraits<E>, OwnTraits<E, N>>
> &
  EnumPhantom<
    NameOf<E>,
    VariantsOf<E>,
    SharedOf<E>,
    DeclaredTraits<E>,
    TagOf<E>,
    Declared<E>["variantTraits"]
  >;

/**
 * What a variant's `create` takes: its payload and the shared fields, without the tag. Its seal
 * takes this with the tag.
 *
 * Built from the declaration rather than from the variant. `SeedOf<VariantOf<E, N> & AnyVal>`
 * reads `unknown` off the second phantom and collapses to `{}`, which leaves `patch` accepting
 * anything.
 *
 * @experimental
 */
export type SeedFor<E extends AnyEnum, N extends keyof VariantsOf<E>> = DeepReadonly<
  VariantsOf<E>[N] & SharedOf<E>,
  true
>;

/** One variant's payload with its tag. */
type Tagged<E extends AnyEnum, N extends keyof VariantsOf<E>> = SeedFor<E, N> & {
  readonly [P in TagOf<E>]: N & string;
};

/**
 * A tagged payload of any one variant, which `seal` on the enum reads the variant from.
 *
 * @experimental
 */
export type SealedPayload<E extends AnyEnum> = {
  [N in keyof VariantsOf<E>]: Tagged<E, N>;
}[keyof VariantsOf<E>];

/** One handler per variant, its argument narrowed. */
type Handlers<E extends AnyEnum> = {
  [N in keyof VariantsOf<E>]: (value: VariantOf<E, N>) => unknown;
};

/**
 * The keys whose handler runs for the rest: `[Otherwise]`, and `_` unless a variant is named `_`.
 */
type Wild<F> = typeof Otherwise | ("_" extends keyof F ? never : "_");

/**
 * What `match` accepts. `F` holds a handler per tag. Without a {@link Wild} key, the literal needs
 * every one of them. With one, it needs only that key, which takes `Rest` and is rejected once no
 * tag is left. The literal may hold only one of them. A key `F` does not hold gets `Stray`.
 *
 * The excess property check cannot reject a stray key: the parameter intersects `H`, which is
 * inferred from the literal, so the check is placed on the parameter instead (notes §11.1).
 */
// Only the key set `K` is inferred. Inferring the whole literal as `H` leaves `_`'s argument at
// `never`. A union of the two forms in place of the conditional reports a forgotten variant as
// "Property '_' is missing".
type Arms<F, K extends PropertyKey, Rest, Stray> = [Extract<K, Wild<F>>] extends [never]
  ? { [N in K | keyof F]: N extends keyof F ? F[N] : Stray }
  : {
      [N in K]: N extends keyof F
        ? F[N]
        : N extends Wild<F>
          ? [Exclude<keyof F, K>] extends [never]
            ? N extends "_"
              ? "every variant has a handler, so `_` never runs"
              : "every variant has a handler, so `[Otherwise]` never runs"
            : N extends "_"
              ? typeof Otherwise extends K
                ? "`[Otherwise]` handles the rest already"
                : Rest
              : Rest
          : Stray;
    };

type EnumArms<E extends AnyEnum, K extends PropertyKey> = Arms<
  Handlers<E>,
  K,
  (rest: Exclude<E, Record<TagOf<E>, K>>) => unknown,
  "this enum has no such variant"
>;

type TagArms<T extends PropertyKey, K extends PropertyKey, Stray> = Arms<
  { [N in T]: () => unknown },
  K,
  () => unknown,
  Stray
>;

/** What a registered seal hands back. The library never inspects it. */
type Returned<F> = F extends (...args: never[]) => infer R ? R : never;

/** A gate and the same gate without the copy. See `Val`'s `seal`. */
type Creates<A extends unknown[], R> = ((...args: A) => R) & {
  /** The same, without copying the payload. */
  nocopy: (...args: A) => R;
};

/**
 * One variant's seal. It takes the payload a value holds, tag included, so it can check the tag
 * the way it checks any other field. The seal it receives brands the payload and copies it.
 */
type VariantSealImpl<E extends AnyEnum, N extends keyof VariantsOf<E>> = (
  value: Tagged<E, N>,
  seal: (value: Tagged<E, N>) => VariantOf<E, N>,
) => unknown;

/**
 * The seal's parameter may be wider than the payload, so a schema library can parse into it, but
 * not so wide that it accepts a wire format. See `Val`'s `implSeal`.
 */
type CheckedSeal<G extends (...args: never[]) => unknown> = Synchronous<
  G,
  [string] extends [Parameters<G>[0]]
    ? Invalid<"a seal takes the payload, not a wire format; decode before sealing">
    : G
>;

/** A list a variant's options sit in. See {@link VariantOptions}. */
declare class VariantOptionsPhantom<N extends string, L> {
  private readonly [VariantOptionsKey]: [N, L];
  /** Declaration emit erases private field types; protected keeps the type arguments recoverable. */
  protected readonly [VariantOptionsTypes]: [N, L];
}

/**
 * The options one variant takes, in the list after the enum. The enum's own options cover every
 * variant, and these add to them.
 *
 * ```ts
 * const Order = Enum.companion<Order, [
 *   Unpatchable<"id">, // every variant holding `id`
 *   VariantOptions<"Shipped", [Unpatchable<"shippedAt">]>,
 * ]>().build();
 * ```
 *
 * {@link PrivateSeal} goes on the enum alone: `Order.seal` reaches every variant by its tag.
 * {@link PrivateCreate} may go on one variant.
 *
 * @experimental
 */
export type VariantOptions<N extends string, L extends Options> = VariantOptionsPhantom<N, L>;

/** Every key some variant's seal takes. */
type AnyKey<E extends AnyEnum> = {
  [N in keyof VariantsOf<E>]: keyof SeedFor<E, N>;
}[keyof VariantsOf<E>] &
  string;

/** What the list after the enum accepts. */
type EnumOption<E extends AnyEnum> =
  | PrivateSeal
  | PrivateCreate
  | Unpatchable<AnyKey<E>>
  | {
      [N in keyof VariantsOf<E>]: VariantOptions<
        N & string,
        readonly (PrivateCreate | Unpatchable<keyof SeedFor<E, N> & string>)[]
      >;
    }[keyof VariantsOf<E>];

type ListFor<O extends Options, N> = O[number] extends infer X
  ? X extends VariantOptionsPhantom<infer M, infer L extends Options>
    ? M extends N
      ? L
      : never
    : never
  : never;

/** The keys `patch` leaves out on one variant: the enum's, and the variant's own. */
type Unpatched<O extends Options, N> = UnpatchableKeys<O> | UnpatchableKeys<ListFor<O, N>>;

type Hidden<O extends Options> = [Extract<O[number], PrivateSeal>] extends [never] ? false : true;

/** Whether `PrivateCreate` takes `create` off variant `N`: on the enum, or in its own list. */
type NoCreate<O extends Options, N> = [
  Extract<O[number] | ListFor<O, N>[number], PrivateCreate>,
] extends [never]
  ? false
  : true;

/** What one variant's builder state holds under `` `${N}:${K}` ``, or `D` where nothing does. */
type At<VM, N extends string, K extends string, D = undefined> = `${N}:${K}` extends keyof VM
  ? VM[`${N}:${K}`]
  : D;

/** What a variant's gates return: its seal's return, or the variant. */
type Sealed<E extends AnyEnum, N extends keyof VariantsOf<E>, F> = [F] extends [undefined]
  ? VariantOf<E, N>
  : Returned<F>;

/** The public face of `create`: its own arguments, and whatever the seal returns. */
type CreateMethod<E extends AnyEnum, N extends keyof VariantsOf<E>, C, R> = [C] extends [undefined]
  ? {
      /**
       * Writes the tag and passes the payload to `seal`, so it returns whatever the seal returns.
       * The tag is minted here, the way `.implCreate` mints what it generates.
       */
      create: Creates<[payload: SeedFor<E, N>], R>;
    }
  : {
      /**
       * Creates a payload and seals it, so it returns whatever the seal returns. With
       * `.implCreate.noseal`, returns the variant.
       */
      create: [C] extends [Unsealed]
        ? Creates<[], VariantOf<E, N>>
        : Creates<C extends (...args: infer A) => unknown ? A : never, R>;
    };

/**
 * A variant's frame on a companion: `seal`, `create`, `patch`, and the members its steps
 * registered.
 *
 * The seal takes the tag, which `create` writes. `patch` cannot reach it, the way `Unpatchable`
 * excludes a key from `patch`.
 *
 * {@link PrivateSeal} takes `seal` off alone. The default `create` mints the tag and generates
 * nothing else a caller could forge. {@link PrivateCreate} takes `create` off, the default one or
 * one `.implCreate` registered.
 *
 * What the seal produces arrives as `R` rather than being read off `F` at each member: one
 * instantiation for the frame instead of one per signature.
 */
type Framed<
  E extends AnyEnum,
  N extends keyof VariantsOf<E>,
  O extends Options,
  R,
  C,
  T,
  U = Unpatched<O, N>,
> = Duals<Omit<T, Wired>, VariantOf<E, N>> &
  (NoCreate<O, N> extends true ? unknown : CreateMethod<E, N, C, R>) &
  (Hidden<O> extends true
    ? unknown
    : {
        /** The single gate a payload of this variant passes. `create` and `patch` go through it. */
        seal: Creates<[payload: Tagged<E, N>], R>;
      }) & {
    /** Derives through the same seal. See {@link Patch}. */
    patch: Dual<
      (
        value: VariantOf<E, N>,
        patch: Patch<
          [U] extends [never] ? SeedFor<E, N> : Omit<SeedFor<E, N>, U & keyof SeedFor<E, N>>
        >,
      ) => R,
      VariantOf<E, N>
    >;
  } & TraitHost;

type Frame<
  E extends AnyEnum,
  O extends Options,
  VM,
  N extends keyof VariantsOf<E> & string,
> = Framed<
  E,
  N,
  O,
  Sealed<E, N, At<VM, N, "seal">>,
  At<VM, N, "create">,
  At<VM, N, "members", Record<never, never>>
>;

/** Rejects a trait member's name. The companion and `dyn` would still call the trait's. */
type Unclaimed<E extends AnyEnum, M> = M & {
  [K in keyof M]: K extends MemberNames<Declared<E>["traits"]>
    ? "a trait the enum declares answers to this name"
    : unknown;
};

/**
 * What `.impl` accepts. A variant's name is reserved: a member taking one would shadow the
 * variant.
 */
type UnionMembers<E extends AnyEnum> = CompanionMembers<E> &
  Partial<Record<(keyof VariantsOf<E> & string) | "match", never>>;

/** Dispatches on the tag. See {@link EnumCompanion.match}. */
type Match<E extends AnyEnum> = {
  <K extends PropertyKey, H>(handlers: EnumArms<E, K> & H): (value: E) => Returned<H[keyof H]>;
  <K extends PropertyKey, H>(value: E, handlers: EnumArms<E, K> & H): Returned<H[keyof H]>;
};

/** Every field some variant declares. */
type VariantFields<E extends AnyEnum> = {
  [N in keyof VariantsOf<E>]: keyof VariantsOf<E>[N];
}[keyof VariantsOf<E>];

/**
 * A tagged payload that holds no other variant's field. TypeScript accepts an object whose tag is a
 * union wherever each of the tag's values fits, so one holding every variant's fields would pass
 * {@link SealedPayload} and keep the fields the selected variant does not declare.
 */
type Exclusive<E extends AnyEnum> = {
  [N in keyof VariantsOf<E>]: Tagged<E, N> & {
    readonly [K in Exclude<VariantFields<E>, keyof VariantsOf<E>[N]>]?: never;
  };
}[keyof VariantsOf<E>];

/** What an enum dispatches on a tag alone, under {@link Tag}. */
type ByTag<E extends AnyEnum> = {
  /**
   * Dispatches on a tag that arrives without its payload. Every tag the argument's type allows needs
   * a handler, or `_` or {@link Otherwise} covers the rest. A handler takes no argument and calls
   * its variant's `create`, which checks the payload literal for fields the variant does not hold.
   *
   * ```ts
   * Command[Tag].match(input.tag, {
   *   New: () => Command.New.create({ name: input.args[0] ?? "" }),
   *   Rename: () => Command.Rename.create({ from: input.args[0] ?? "", to: input.args[1] ?? "" }),
   *   Check: () => Command.Check.create({}),
   * });
   * ```
   */
  readonly match: {
    // The data-last form takes every tag, since the tag arrives after the handlers.
    <K extends PropertyKey, H>(
      handlers: TagArms<keyof VariantsOf<E>, K, "the enum has no such variant"> & H,
    ): (tag: keyof VariantsOf<E>) => Returned<H[keyof H]>;
    <T extends keyof VariantsOf<E>, K extends PropertyKey, H>(
      tag: T,
      handlers: TagArms<T, K, "the tag never takes this value"> & H,
    ): Returned<H[keyof H]>;
  };
  /**
   * The name of the tag field, for a schema library that asks for the discriminator:
   * `z.discriminatedUnion(Command[Tag].key, [...])`.
   */
  readonly key: TagOf<E>;
};

/**
 * An enum's members: one frame per variant, `match`, `seal`, and whatever the steps registered.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 *
 * @experimental
 */
export type EnumCompanion<
  E extends AnyEnum,
  O extends Options = [],
  VM = Record<never, never>,
  M = Record<never, never>,
  F = undefined,
  C = undefined,
> = {
  [N in keyof VariantsOf<E>]: Frame<E, O, VM, N & string>;
} & Duals<Omit<M, Wired | "match" | keyof VariantsOf<E>>, E> &
  (Hidden<O> extends true
    ? unknown
    : {
        /**
         * Reads the tag, selects that variant, and passes the payload to its seal. With
         * `.implSeal`, the enum's seal runs first, and its return is what this returns. Without
         * one, the return is the variants' seals' returns, as a union.
         *
         * Passing a field of another variant is a type error, even when the tag is a union. A tag
         * the declaration lacks gets past the type through a cast or `any` alone, and only the
         * enum's seal can reject it: the variants' seals run once one is selected.
         */
        seal: [F] extends [undefined]
          ? (payload: Exclusive<E>) => Dispatched<E, VM>
          : (
              value: F extends (value: infer V, ...rest: never[]) => unknown ? V : never,
            ) => Returned<F>;
      }) &
  ([C] extends [undefined]
    ? unknown
    : [Extract<O[number], PrivateCreate>] extends [never]
      ? {
          /** Creates a tagged payload and passes it to `seal`, so it returns what `seal` returns. */
          create: C extends Unsealed & { payload: infer P }
            ? () => Extract<E, Record<TagOf<E>, P[TagOf<E> & keyof P]>>
            : (
                ...args: C extends (...args: infer A) => unknown ? A : never
              ) => [F] extends [undefined] ? Dispatched<E, VM> : Returned<F>;
        }
      : unknown) & {
    /**
     * Dispatches on the tag. Every variant needs a handler, so adding one to the declaration
     * fails here rather than falling through at run time. `_` handles the variants that have no
     * handler of their own, narrowed to them, and is a type error beside a handler for every
     * variant. {@link Otherwise} does the same, and is the only one that handles the rest where a
     * variant is named `_`.
     *
     * The return type is the handlers' union: taking it as a type argument of its own would fix
     * it to the first handler and reject the rest. For a guard rather than a tag, use ts-pattern.
     */
    match: Match<E>;
    readonly [Tag]: ByTag<E>;
  } & TraitHost;

/** The steps the enum's own part of the chain has taken. */
type EnumTaken = "implSeal" | "implCreate" | "impl" | "implTrait";

/** The steps one variant has taken, read off the builder's state. */
type VariantTaken<VM, N extends string> = {
  [S in "seal" | "create" | "impl" | "trait"]: `${N}:${S}` extends keyof VM ? S : never;
}["seal" | "create" | "impl" | "trait"];

/** The builder after one variant's step, with `S` added. */
type After<E extends AnyEnum, O extends Options, VM, M, S> = EnumBuilder<E, O, VM & S, M>;

/** What `seal` on the enum hands back once it selects a variant: that variant's seal's return. */
type Dispatched<E extends AnyEnum, VM> = {
  [N in keyof VariantsOf<E>]: Sealed<E, N, At<VM, N & string, "seal">>;
}[keyof VariantsOf<E>];

/** The enum's seal. The seal it receives selects the variant by the tag, and runs its seal. */
type EnumSealImpl<E extends AnyEnum, VM> = (
  value: Exclusive<E>,
  seal: (value: Exclusive<E>) => Dispatched<E, VM>,
) => unknown;

/**
 * Implements a trait one variant declares. See {@link EnumBuilder}'s `implTrait`, which this
 * mirrors for the variant.
 */
type VariantTrait<
  E extends AnyEnum,
  O extends Options,
  VM,
  M,
  N extends keyof VariantsOf<E> & string,
> = <Tr extends AnyTrait, G, I extends Implement<Tr, G, VariantOf<E, N>>>(
  trait: Takes<VariantOf<E, N>, Tr, At<VM, N, "members", Record<never, never>>, Complete<Tr, G>>,
  ...impl: Passes<Tr, G, I>
) => After<
  E,
  O,
  VM,
  M,
  { [K in `${N}:trait`]: true } & {
    [K in `${N}:members`]: Unbound<MembersOf<Tr>, VariantOf<E, N>>;
  }
>;

/**
 * One variant's steps on the builder, `.Circle.implSeal(…)`: the steps `Val.companion` takes, in
 * its order. Each returns the enum's builder, so the next variant follows with `.Square`.
 *
 * The gates come first, `implSeal` then `implCreate`. `impl` (once) and `implTrait` follow, and
 * the first of them takes the gates off.
 */
type VariantSteps<
  E extends AnyEnum,
  O extends Options,
  VM,
  M,
  N extends keyof VariantsOf<E> & string,
  S = VariantTaken<VM, N>,
> = {
  readonly seal: CallBuildFirst;
  readonly create: CallBuildFirst;
  readonly patch: CallBuildFirst;
  implTrait: VariantTrait<E, O, VM, M, N>;
} & ([Extract<S, "impl" | "trait">] extends [never]
  ? ("seal" extends S
      ? unknown
      : {
          /**
           * Replaces this variant's seal. It takes the payload with its tag, and the seal it
           * receives brands the payload and copies it. Its parameter may be wider than the payload, so a schema library can
           * parse into it, but not so wide that a wire format fits.
           */
          implSeal: "create" extends S
            ? (seal: "write `implSeal` before `implCreate`") => After<E, O, VM, M, unknown>
            : <G extends VariantSealImpl<E, N>>(
                seal: CheckedSeal<G>,
              ) => After<E, O, VM, M, { [K in `${N}:seal`]: G }>;
        }) &
      ("create" extends S
        ? unknown
        : {
            /** Registers a function that creates this variant's payload, as `create`. */
            implCreate: (<G extends (...args: never[]) => SeedFor<E, N>>(
              create: G,
            ) => After<E, O, VM, M, { [K in `${N}:create`]: G }>) & {
              /**
               * A `create` that bypasses the seal and returns the variant. See `Val`'s
               * `implCreate.noseal`.
               */
              noseal: <G extends AnyFn>(
                create: Argumentless<SeedFor<E, N>, G>,
              ) => After<E, O, VM, M, { [K in `${N}:create`]: Unsealed }>;
            };
          })
  : unknown) &
  ("impl" extends S
    ? unknown
    : {
        /**
         * Collects the members taking this variant, in one call. They can be called with the value
         * first or last, and cannot have an optional, a default or a rest parameter.
         *
         * See {@link https://jo16oh.github.io/valof/latest/companion-objects.html#call-a-member-with-the-value-last | Call a member with the value last}.
         */
        impl: <G extends CompanionMembers<VariantOf<E, N>>>(
          fns: () => Grown<keyof At<VM, N, "members", Record<never, never>>, Unclaimed<E, G>> &
            Arity<G>,
        ) => After<E, O, VM, M, { [K in `${N}:impl`]: true } & { [K in `${N}:members`]: G }>;
      });

/**
 * What `implTrait` on the union accepts for `Tr`. A trait one variant declares is that variant's
 * to implement.
 */
type UnionTakes<E extends AnyEnum, Tr extends AnyTrait, M, Ok> =
  string extends NamesOf<Tr>
    ? Takes<E, Tr, M, Ok>
    : [NamesOf<Tr>] extends [TraitNames<DeclaredTraits<E>>]
      ? Takes<E, Tr, M, Ok>
      : [NamesOf<Tr>] extends [TraitsOf<E>]
        ? "a variant declares this trait, so it implements the trait itself"
        : Takes<E, Tr, M, Ok>;

/**
 * What `Enum.companion` returns, which its steps add to and `.build()` closes.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 *
 * Each variant's steps come first, under its name. Then the enum's, in `Val`'s order: `implSeal`
 * then `implCreate`, and `impl` (once) and `implTrait` after them. The enum's seal hands the payload
 * to the variants' seals, so its type is known once theirs are. The first of the enum's steps
 * takes the variants' off.
 *
 * @experimental
 */
export type EnumBuilder<
  E extends AnyEnum,
  O extends Options = [],
  VM = Record<never, never>,
  M = Record<never, never>,
  F = undefined,
  C = undefined,
  D extends EnumTaken = never,
> = {
  readonly seal: CallBuildFirst;
  readonly match: CallBuildFirst;
  /**
   * Closes the chain and returns the companion. The builder holds the steps alone: the variants'
   * frames, `seal`, `match` and the members are the companion's.
   */
  build: () => EnumCompanion<E, O, VM, M, F, C>;
} & ([D] extends [never]
  ? { readonly [N in keyof VariantsOf<E>]: VariantSteps<E, O, VM, M, N & string> }
  : unknown) &
  ([Extract<D, "impl" | "implTrait">] extends [never]
    ? ("implSeal" extends D
        ? unknown
        : {
            /**
             * Registers the seal `seal` on the enum runs, before the tag selects a variant. The
             * seal it receives selects the variant and runs that variant's seal. A variant's own
             * `seal`, `create` and `patch` do not pass through it.
             *
             * This is the place to check the tag: a payload from a cast or `any` can name a
             * variant the declaration lacks, and no variant's seal sees it. Its parameter may be
             * wider than the payload, so a schema library can parse into it, but not so wide that
             * a wire format fits.
             */
            implSeal: "implCreate" extends D
              ? (seal: "write `implSeal` before `implCreate`") => EnumBuilder<E, O, VM, M, F, C, D>
              : <G extends EnumSealImpl<E, VM>>(
                  seal: CheckedSeal<G>,
                ) => EnumBuilder<E, O, VM, M, G, C, D | "implSeal">;
          }) &
        ("implCreate" extends D
          ? unknown
          : {
              /**
               * Registers a function that creates a tagged payload, as `create`. Any arguments, a
               * payload of one variant out, which `seal` then receives.
               */
              implCreate: (<G extends (...args: never[]) => Exclusive<E>>(
                create: G,
              ) => EnumBuilder<E, O, VM, M, F, G, D | "implCreate">) & {
                /**
                 * A `create` that bypasses every seal and returns the variant its payload's tag
                 * names, for a payload the seals always accept. Takes no arguments. Development
                 * still runs the seals, and throws if one rejects the payload or changes it.
                 */
                noseal: <G extends AnyFn>(
                  create: Argumentless<Exclusive<E>, G>,
                ) => EnumBuilder<
                  E,
                  O,
                  VM,
                  M,
                  F,
                  Unsealed & { payload: ReturnType<G> },
                  D | "implCreate"
                >;
              };
            })
    : unknown) &
  ("impl" extends D
    ? unknown
    : {
        /**
         * Collects the members taking the union, in one call.
         *
         * A member reaching the companion, for `match`, for a variant or for a sibling,
         * references it and annotates its return type. Referencing a declaration inside its own
         * initializer is a circularity, which TypeScript reports as TS7023.
         *
         * The members, `match` and `[Tag].match` can be called with the value first or last. A
         * member cannot have an optional, a default or a rest parameter.
         *
         * See {@link https://jo16oh.github.io/valof/latest/companion-objects.html#call-a-member-with-the-value-last | Call a member with the value last}.
         */
        impl: <G extends UnionMembers<E>>(
          fns: () => Unclaimed<E, G> & Arity<G>,
        ) => EnumBuilder<E, O, VM, M & G, F, C, D | "impl">;
      }) & {
    /**
     * Implements a trait the enum declares. The implementation takes the union, so a member that
     * differs per variant is a `match` inside it.
     */
    implTrait: <Tr extends AnyTrait, G, I extends Implement<Tr, G, E>>(
      trait: UnionTakes<E, Tr, M, Complete<Tr, G>>,
      ...impl: Passes<Tr, G, I>
    ) => EnumBuilder<E, O, VM, M & Unbound<MembersOf<Tr>, E>, F, C, D | "implTrait">;
  };

/** Where the chain starts: a tag of its own is named first, since the builder writes it. */
type Start<E extends AnyEnum, O extends Options> = [TagOf<E>] extends ["_tag"]
  ? EnumBuilder<E, O>
  : {
      /**
       * Names the tag field, which the companion writes at run time. The type argument is not
       * readable from a value, so the name is given again here.
       */
      tag: (key: TagOf<E>) => EnumBuilder<E, O>;
    };

type Payload = Record<string, unknown>;

type Seal = (value: Payload, seal: (value: Payload) => unknown) => unknown;

/** What one variant's steps registered. */
type Registered = {
  seal?: Seal;
  create?: AnyFn;
  noseal?: boolean | undefined;
  members?: Payload;
  traits?: Payload;
};

type Variants = Record<string, Registered>;

/** A `Val.companion` builder, as the steps call it. */
type Chain = {
  implSeal: (seal: Seal) => Chain;
  implCreate: ((create: AnyFn) => Chain) & { noseal: (create: AnyFn) => Chain };
  impl: (fns: () => Payload) => Chain;
  implTrait: (trait: { [Shared]: Payload }) => Chain;
  build: () => object;
};

type Handler = (value?: unknown) => unknown;

type HandlerMap = Record<PropertyKey, Handler>;

/**
 * The handler for `tag`. `[Otherwise]` is read before `_`, because where a variant is named `_`,
 * `_` is that variant's handler and `[Otherwise]` handles the rest.
 */
const arm = (handlers: HandlerMap, tag: string): Handler =>
  (handlers[tag] ?? handlers[Otherwise] ?? handlers._)!;

const matchTag = dual((tag: string, handlers: HandlerMap) => arm(handlers, tag)());

/**
 * Reads `key` off `own` or resolves a string through `rest`, which returns the frame of the
 * variant by that name. A symbol `own` lacks reaches here from `await`, `JSON.stringify` and every
 * other protocol read, and would otherwise resolve to a variant, since nothing at run time lists
 * the names. `then` resolves to a frame, which is not a function, so the object is not a thenable.
 *
 * Each function in `own` reads its properties from the frame of the variant with the same name
 * first, so `.impl(…)` is the step and `.impl.implSeal(…)` the variant's. The frame's properties
 * hide the function's own, `name` and `length` included. No variant shares a name with one of
 * `members`.
 */
const resolving = (
  own: Record<string, unknown>,
  rest: (key: string) => unknown,
  members?: object,
): object => {
  for (const key in own)
    own[key] = new Proxy(own[key] as object, {
      get: (target, property) => {
        const frame = rest(key) as object;
        return (Object.hasOwn(frame, property) ? frame : target)[property as never];
      },
    });
  return new Proxy(
    { ...own, ...members },
    {
      get: (target, key) =>
        Object.hasOwn(target, key)
          ? (target as Record<PropertyKey, unknown>)[key]
          : typeof key === "string"
            ? rest(key)
            : undefined,
    },
  );
};

/**
 * One builder state: what the steps registered so far. The order of the steps is the type's to
 * enforce. A name that is not a step is a variant's, whose steps register under it.
 */
const builder = (tag: string, variants: Variants, own: Registered): object => {
  const { members = {}, traits = {} } = own;
  const step = (name: string, change: Registered) =>
    builder(tag, { ...variants, [name]: { ...variants[name], ...change } }, own);
  const grow = (change: Registered) => builder(tag, variants, { ...own, ...change });
  return resolving(
    {
      tag: (key: string) => builder(key, variants, own),
      implSeal: (seal: Seal) => grow({ seal }),
      implCreate: Object.assign((create: AnyFn) => grow({ create, noseal: false }), {
        noseal: (create: AnyFn) => grow({ create, noseal: true }),
      }),
      impl: (fns: () => Payload) => grow({ members: { ...members, ...duals(fns()) } }),
      // The trait's own members and the enum's, merged the way `val.ts` merges them.
      implTrait: (trait: { [Shared]: Payload }, fns?: () => Payload) => {
        const grown = { ...traits, ...trait[Shared], ...fns?.() };
        return grow({ members: { ...members, ...duals(grown) }, traits: grown });
      },
      build: () => assemble(tag, variants, own),
    },
    (name) => ({
      implSeal: (seal: Seal) => step(name, { seal }),
      implCreate: Object.assign((create: AnyFn) => step(name, { create, noseal: false }), {
        noseal: (create: AnyFn) => step(name, { create, noseal: true }),
      }),
      impl: (fns: () => Payload) => step(name, { members: fns() }),
      implTrait: (trait: { [Shared]: Payload }, fns?: () => Payload) =>
        step(name, { traits: { ...variants[name]?.traits, ...trait[Shared], ...fns?.() } }),
    }),
  );
};

/**
 * What development's check of the enum's `implCreate.noseal` hands the next variant's seal: it
 * hears what that seal passed to the default one.
 */
let watching: ((candidate: Payload, sealed: unknown) => void) | undefined;

/**
 * One variant's frame: a Val companion whose `create` mints the tag. `seal` takes the tag with the
 * payload and checks it like any other field, so nothing rewrites it.
 */
const frame = (tag: string, name: string, steps: Registered): object => {
  const mint = (payload: Payload): Payload => {
    // Before the spread, which would turn a string into a character map.
    assertVariantPayload(payload);
    return { ...payload, [tag]: name };
  };
  const { seal, create, noseal, members = {}, traits = {} } = steps;
  let chain = (Val.companion() as unknown as Chain).implSeal((value, terminal) => {
    // Taken here, so a value this seal builds on the way runs with nothing watching it.
    let watcher: typeof watching;
    if (development) [watcher, watching] = [watching, undefined];
    assertVariantPayload(value);
    const end = (checked: Payload) => {
      const sealed = terminal(checked);
      watcher?.(checked, sealed);
      return sealed;
    };
    return seal ? seal(value, end) : end(value);
  });
  // The tag is minted as the payload comes out, the way `create` generates what it generates.
  const made = create ? (...args: never[]) => mint(create(...args) as Payload) : mint;
  chain = noseal ? chain.implCreate.noseal(made) : chain.implCreate(made);
  return chain
    .impl(() => members)
    .implTrait({ [Shared]: traits })
    .build();
};

/**
 * The companion. It is a proxy: it does not know the variant names, so anything it does not
 * handle itself becomes a frame. A variant the steps named is built here, so a member it rejects
 * throws where the chain is.
 */
const assemble = (tag: string, variants: Variants, own: Registered): object => {
  const { seal, create, noseal, members = {}, traits = {} } = own;
  // Remembered for the allocation, not for identity: a frame built twice behaves the same, and
  // rebuilding one on every read would make a fresh closure per member per access.
  const frames = new Map<string, unknown>();
  const at = (name: string): unknown => {
    let found = frames.get(name);
    if (found === undefined) frames.set(name, (found = frame(tag, name, variants[name] ?? {})));
    return found;
  };
  for (const name of Object.keys(variants)) at(name);
  const dispatch = (value: Payload) =>
    (at(value[tag] as string) as { seal: (value: Payload) => unknown }).seal(value);
  const sealing = seal ? (value: Payload) => seal(value, dispatch) : dispatch;
  // Development runs every seal anyway, and throws unless the variant's seal hands the default
  // one a payload equal to the created one.
  const unsealed = (payload: Payload): unknown => {
    if (!development) return of(payload as never);
    const heard: unknown[] = [];
    const watch = (value: Payload) => {
      watching = (candidate, sealed) =>
        heard.push(equals(payload as never, candidate as never) ? sealed : notFixedPoint());
      return dispatch(value);
    };
    try {
      if (seal) seal(payload, watch);
      else watch(payload);
    } finally {
      watching = undefined;
    }
    return heard.length ? heard[0] : notFixedPoint();
  };

  return resolving(
    {
      match: dual((value: Payload, handlers: HandlerMap) =>
        arm(handlers, value[tag] as string)(value),
      ),
      seal: sealing,
      ...(create && {
        create: noseal
          ? () => unsealed(create() as Payload)
          : (...args: never[]) => sealing(create(...args) as Payload),
      }),
      [Tag]: { match: matchTag, key: tag },
      [Traits]: traits,
    },
    at,
    // Last, as the proxy read them first: the declaration keeps a trait member off `match`.
    members,
  );
};

/**
 * Bundles an enum's `seal`, its variants and its members. `.build()` closes the chain.
 *
 * A list may follow `E`: {@link PrivateSeal}, {@link PrivateCreate}, `Unpatchable`, and
 * {@link VariantOptions} for one variant, as in `Enum.companion<Order, [PrivateSeal, Unpatchable<"id">]>()`.
 *
 * @experimental
 */
export const companion = <
  E extends AnyEnum,
  const O extends readonly EnumOption<E>[] = [],
>(): Start<E, O> => builder("_tag", {}, {}) as Start<E, O>;
