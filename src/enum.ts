import { dual, duals, type Arity, type Dual, type Duals } from "./dual.ts";
import type { AnyTrait, Implement, Members, MembersOf, Unbound } from "./trait.ts";
import {
  assertVariantPayload,
  define,
  Val,
  type AnyVal,
  type CompanionMembers,
  type Complete,
  type DeepReadonly,
  type Invalid,
  type Passes,
  type Patch,
  type Steps,
  type Synchronous,
  type Takes,
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
export const Tag = "__valof_tag";

/** Type-only carrier for the tag name. Private and protected members stay out of `keyof`. */
declare class TagPhantom<T extends string> {
  private readonly __valof_internal_phantom_tag: T;
  /** Declaration emit erases private field types; protected keeps the name recoverable. */
  protected readonly __valof_internal_phantom_tag_types: T;
}

/**
 * The name of the tag field, intersected into what every variant holds. The default is `_tag`.
 *
 * ```ts
 * type Event = Enum<"Event", { Click: { x: number }; Key: { code: string } }, Tag<"kind">>;
 * ```
 *
 * The tag is real data and crosses the wire, so you can customize the name when an API already has
 * one. A marker rather than a key of the record, so no variant name is reserved: `tag` is a variant
 * Git itself would need.
 *
 * @experimental
 */
export type Tag<T extends string> = TagPhantom<T>;

/**
 * Type-only nominal identity carrying the whole declaration, so a companion can read the
 * variants, the shared fields and the tag name back off the union.
 */
declare class EnumPhantom<K, V, S, Tr, Tg> {
  private readonly __valof_internal_phantom_enum: [K, V, S, Tr, Tg];
  /** Declaration emit erases private field types; protected keeps the type arguments recoverable. */
  protected readonly __valof_internal_phantom_enum_types: [K, V, S, Tr, Tg];
}

/**
 * Every enum, as a constraint. A broken declaration does not satisfy it, so one check covers the
 * companion and `match` alike.
 *
 * @experimental
 */
export type AnyEnum = AnyVal &
  EnumPhantom<string, Record<string, object>, object, AnyTrait, string>;

/** The declaration's own keys, which are the variants and nothing else. */
type VariantKeys<D> = Extract<keyof D, string>;

type VariantsIn<D> = { [N in VariantKeys<D>]: D[N] };

type TagIn<X> = [X] extends [TagPhantom<infer T>] ? T : "_tag";

/** The fields every variant holds. A trait carries its own, so both arrive in one argument. */
type SharedIn<X> = Writable<Pick<X, keyof X>>;

type TraitsIn<X> = Extract<X, AnyTrait>;

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
      [N in VariantKeys<D>]: N extends "then"
        ? "a variant named `then` would make the companion a thenable"
        : N extends "match" | "seal" | "_" | keyof Steps | `__valof_${string}`
          ? "a variant cannot take a name the library reserves"
          : [D[N]] extends [object]
            ? [D[N]] extends [ReadonlyArray<unknown>]
              ? "a variant's payload must be a record of fields"
              : Tg extends keyof D[N]
                ? "the tag cannot take the name of a field the payload holds"
                : never
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
// `export const Shape = Enum.sealer<Shape>()`.
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
 * const Shape = Enum.sealer<Shape>();
 * ```
 *
 * The third argument is what every variant holds: shared fields, traits, the tag's name, or all
 * of them intersected.
 *
 * ```ts
 * type Shape = Enum<"Shape", { Circle: { r: number } }, Tag<"kind"> & { id: string }>;
 * ```
 *
 * @experimental
 */
type Enum<K extends string, D extends object, X extends object = Record<never, never>> = {
  [N in VariantKeys<D>]: Val<
    `${K}.${N}`,
    D[N] & SharedIn<X> & { [P in TagIn<X>]: N },
    TraitsIn<X>
  > &
    EnumPhantom<
      Named<K, D, SharedIn<X>, TraitsIn<X>, TagIn<X>>,
      VariantsIn<D>,
      SharedIn<X>,
      TraitsIn<X>,
      TagIn<X>
    >;
}[VariantKeys<D>];

export { Enum };

/** Read through the class, since a private key is unreachable by an index. */
type Declared<E> =
  E extends EnumPhantom<infer K, infer V, infer S, infer Tr, infer Tg>
    ? { name: K; variants: V; shared: S; traits: Tr; tag: Tg }
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

/**
 * One variant of the union.
 *
 * The top level is an intersection rather than an `Extract`, which is the same type and a
 * different hover: `Extract` resolves and the alias name goes with it, so an error prints the
 * expanded intersection.
 *
 * Write it where the variant is used, rather than giving it a second name with `type Circle =
 * VariantOf<Shape, "Circle">`. The prefix is what says which enum the variant belongs to, and a
 * variant is built through its companion for the same reason: `Shape.Circle({ r: 2 })`.
 *
 * @experimental
 */
export type VariantOf<E extends AnyEnum, N extends keyof VariantsOf<E>> = Val<
  `${NameOf<E>}.${N & string}`,
  VariantsOf<E>[N] & SharedOf<E> & { [P in TagOf<E>]: N & string },
  DeclaredTraits<E>
> &
  EnumPhantom<NameOf<E>, VariantsOf<E>, SharedOf<E>, DeclaredTraits<E>, TagOf<E>>;

/**
 * What a variant's constructor takes: its payload and the shared fields, and never the tag.
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

/** One variant's payload as a seal sees it: the constructor has written the tag by then. */
type Tagged<E extends AnyEnum, N extends keyof VariantsOf<E>> = SeedFor<E, N> & {
  readonly [P in TagOf<E>]: N & string;
};

/**
 * What a seal registered with `.implSeal` receives: a tagged payload of any one variant.
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
 * What `match` accepts. `F` holds a handler per tag. Without `_`, the literal needs every one of
 * them. With `_`, it needs only `_`, which takes `Rest` and is rejected once no tag is left. A key
 * `F` does not hold gets `Stray`.
 *
 * The excess property check cannot reject a stray key: the parameter intersects `H`, which is
 * inferred from the literal, so the check is placed on the parameter instead (notes §11.1).
 */
// Only the key set `K` is inferred. Inferring the whole literal as `H` leaves `_`'s argument at
// `never`. A union of the two forms in place of the conditional reports a forgotten variant as
// "Property '_' is missing".
type Arms<F, K extends PropertyKey, Rest, Stray> = "_" extends K
  ? {
      [N in K]: N extends keyof F
        ? F[N]
        : N extends "_"
          ? [Exclude<keyof F, K>] extends [never]
            ? "every variant has a handler, so `_` never runs"
            : Rest
          : Stray;
    }
  : { [N in K | keyof F]: N extends keyof F ? F[N] : Stray };

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

/**
 * What the enum's seal produces for one variant: its return, with the union narrowed to that
 * variant. The payload the constructor sealed was that variant's, so nothing else can be returned.
 *
 * A return that carries the union inside another type, `Result<Shape, E>`, is propagated
 * verbatim. The library does not look into it, so the union there stays the union.
 *
 * The branches nest rather than reading `Exclude<…> | (… ? never : VariantOf<…>)`, which is the
 * same type. TypeScript 5.9 gives up on the union of the two deferred conditionals with TS2590,
 * "union type too complex to represent", where the enum also implements a trait.
 */
type Made<E extends AnyEnum, N extends keyof VariantsOf<E>, F> = [F] extends [undefined]
  ? VariantOf<E, N>
  : [Extract<Returned<F>, E>] extends [never]
    ? Returned<F>
    : Exclude<Returned<F>, E> | VariantOf<E, N>;

/** What one variant's constructor hands back: its own seal's return, or the enum's. */
type Built<E extends AnyEnum, N extends keyof VariantsOf<E>, FE, FV> = [FV] extends [undefined]
  ? Made<E, N, FE>
  : Returned<FV>;

/** A constructor and the same constructor without the copy. See `Val`'s `create`. */
type Creates<A, R> = ((payload: A) => R) & {
  /** The same, without copying the payload. */
  nocopy: (payload: A) => R;
};

/** The enum's seal, which checks what every variant holds. See {@link EnumBuilder.implSeal}. */
type EnumSealImpl<E extends AnyEnum> = (
  value: SealedPayload<E>,
  seal: (value: SealedPayload<E>) => E,
) => unknown;

/** One variant's seal. Its default seal runs the enum's first, so the two compose into one. */
type VariantSealImpl<E extends AnyEnum, N extends keyof VariantsOf<E>, FE> = (
  value: Tagged<E, N>,
  seal: (value: Tagged<E, N>) => Made<E, N, FE>,
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

/**
 * A variant's frame on a companion: `create`, `patch`, a `seal` where one was registered, and
 * whatever `implVariant` wrote for it.
 *
 * The constructor does not take the tag and `patch` cannot reach it, the way `.fixed` excludes a
 * key from `patch`.
 *
 * What the seals produce arrives as `R` rather than being read off `FE` and `FV` at each member:
 * one instantiation for the frame instead of one per signature.
 *
 * The aliases below carry `in out`, which stops TypeScript measuring their variance. It measures
 * by instantiating the alias with marker types, a constant the program pays once per alias and
 * the largest single cost `vp run type-perf` reads. This one cannot carry them: an alias whose
 * top level is an intersection or a reference to one is TS2637.
 */
type VariantFrame<E extends AnyEnum, N extends keyof VariantsOf<E>, FE, FV, T> = Framed<
  E,
  N,
  Built<E, N, FE, FV>,
  [FE | FV] extends [undefined] ? false : true,
  T
>;

type Framed<E extends AnyEnum, N extends keyof VariantsOf<E>, R, Sealed, T> = Duals<
  Omit<T, Wired>,
  VariantOf<E, N>
> & {
  /** Creates the payload with its tag and seals it, so it returns whatever the seal returns. */
  create: Creates<SeedFor<E, N>, R>;
  /** Derives through the same seal the constructor uses. See {@link Patch}. */
  patch: Dual<(value: VariantOf<E, N>, patch: Patch<SeedFor<E, N>>) => R, VariantOf<E, N>>;
} & (Sealed extends true
    ? {
        /** The single gate a payload of this variant passes. `create` and `patch` go through it. */
        seal: Creates<Tagged<E, N>, R>;
      }
    : Record<never, never>);

/** A variant's frame on a sealer: the constructor itself, its `patch`, and its own members. */
type SealerFrame<E extends AnyEnum, N extends keyof VariantsOf<E>, T> = ((
  payload: SeedFor<E, N>,
) => VariantOf<E, N>) & {
  /** Derives through the same seal the constructor uses. See {@link Patch}. */
  patch: Dual<
    (value: VariantOf<E, N>, patch: Patch<SeedFor<E, N>>) => VariantOf<E, N>,
    VariantOf<E, N>
  >;
} & Duals<Omit<T, Wired>, VariantOf<E, N>>;

/**
 * The steps a variant adds, inside an `implVariant` callback. It is already the frame, so a
 * callback with no member to collect returns it unchanged, the way `Val.companion<V>()` is a
 * companion before `.impl()`. A frame a step made is closed: the steps go no further.
 *
 * The enum's entry point decides each variant's entry point, so there is no step that picks one:
 * every variant of a companion builds with `.create`, every variant of a sealer is callable.
 *
 * No `in out` here: the top level is a reference to an intersection, which is TS2637.
 */
type VariantSteps<
  in out E extends AnyEnum,
  in out N extends keyof VariantsOf<E>,
  in out FE,
  in out FV,
  in out T,
> = {
  /**
   * Collects the members taking this variant. They can be called with the value first or last, and
   * cannot have an optional, a default or a rest parameter.
   *
   * See {@link https://jo16oh.github.io/valof/latest/companion-objects.html#call-a-member-with-the-value-last | Call a member with the value last}.
   */
  impl: {
    (): VariantFrame<E, N, FE, FV, T>;
    <M extends CompanionMembers<VariantOf<E, N>>>(
      fns: Unclaimed<E, M> & Arity<M>,
    ): VariantFrame<E, N, FE, FV, M & T>;
  };
  /**
   * Replaces this variant's seal. The enum's seal runs inside the default seal it receives, so a
   * value built here passes both.
   */
  implSeal: <G extends VariantSealImpl<E, N, FE>>(
    seal: CheckedSeal<G>,
  ) => VariantSteps<E, N, FE, G, T> & VariantFrame<E, N, FE, G, T>;
};

/** The same, for a sealer: the constructor is the default seal, so there is no `implSeal`. */
type SealerVariantSteps<
  in out E extends AnyEnum,
  in out N extends keyof VariantsOf<E>,
  in out T,
> = {
  /**
   * Collects the members taking this variant. They can be called with the value first or last, and
   * cannot have an optional, a default or a rest parameter.
   *
   * See {@link https://jo16oh.github.io/valof/latest/companion-objects.html#call-a-member-with-the-value-last | Call a member with the value last}.
   */
  impl: {
    (): SealerFrame<E, N, T>;
    <M extends CompanionMembers<VariantOf<E, N>>>(
      fns: Unclaimed<E, M> & Arity<M>,
    ): SealerFrame<E, N, M & T>;
  };
};

/** Rejects a trait member's name. The companion and `dyn` would still call the trait's. */
type Unclaimed<E extends AnyEnum, M> = M & {
  [K in keyof M]: K extends MemberNames<Declared<E>["traits"]>
    ? "a trait the enum declares answers to this name"
    : unknown;
};

/** A frame the callback may hand back, loose enough for any seal's return. */
type ClosedFrame<E extends AnyEnum, N extends keyof VariantsOf<E>> = {
  create: (payload: SeedFor<E, N>) => unknown;
  patch: (...args: never[]) => unknown;
};

type ClosedSealerFrame<E extends AnyEnum, N extends keyof VariantsOf<E>> = ((
  payload: SeedFor<E, N>,
) => unknown) & { patch: (...args: never[]) => unknown };

/** A variant no step has built yet. Naming one twice would drop the first frame. */
type Fresh<E extends AnyEnum, VM> = Exclude<keyof VariantsOf<E>, keyof VM>;

/**
 * Rejects a seal written after a variant. The frame that variant built reads the enum's seal off
 * the chain as it stands, so it would be typed without this one and still run it. The check is
 * placed on the parameter (notes §11.1).
 */
type Before<VM, Ok> = [keyof VM] extends [never]
  ? Ok
  : "write `implSeal` before the first `implVariant`";

/** A variant the callback left out keeps the default frame. */
type Constructors<in out E extends AnyEnum, in out VM, in out FE> = {
  [N in keyof VariantsOf<E>]: N extends keyof VM
    ? VM[N]
    : VariantFrame<E, N, FE, undefined, Record<never, never>>;
};

type SealerConstructors<in out E extends AnyEnum, in out VM> = {
  [N in keyof VariantsOf<E>]: N extends keyof VM ? VM[N] : SealerFrame<E, N, Record<never, never>>;
};

/**
 * What `.impl` accepts. A variant's name is reserved: a member taking one would shadow the
 * constructor.
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

/** What a frame's constructor returns, whichever form the frame takes. */
type Yields<X> = X extends { create: (...args: never[]) => infer R }
  ? R
  : X extends (...args: never[]) => infer R
    ? R
    : never;

/** What an enum dispatches on a tag alone, under {@link Tag}. */
type ByTag<E extends AnyEnum> = {
  /**
   * Dispatches on a tag that arrives without its payload. Every tag the argument's type allows needs
   * a handler, or `_` covers the rest. A handler takes no argument and calls its variant's
   * constructor, which checks the payload literal for fields the variant does not hold.
   *
   * ```ts
   * Command[Tag].match(input.tag, {
   *   New: () => Command.New({ name: input.args[0] ?? "" }),
   *   Rename: () => Command.Rename({ from: input.args[0] ?? "", to: input.args[1] ?? "" }),
   *   Check: () => Command.Check({}),
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

/** See {@link EnumCompanion.seal}. */
type EnumSeal<E extends AnyEnum, C> = (payload: Exclusive<E>) => {
  [N in keyof C]: Yields<C[N]>;
}[keyof C];

/**
 * An enum's members: one frame per variant, `match`, `seal`, and whatever the steps registered.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 *
 * @experimental
 */
export type EnumCompanion<
  E extends AnyEnum,
  VM = Record<never, never>,
  M = Record<never, never>,
  F = undefined,
> = Constructors<E, VM, F> &
  Duals<Omit<M, Wired | "match" | keyof VariantsOf<E>>, E> & {
    /**
     * Dispatches on the tag. Every variant needs a handler, so adding one to the declaration
     * fails here rather than falling through at run time. `_` handles the variants that have no
     * handler of their own, narrowed to them, and is a type error beside a handler for every
     * variant.
     *
     * The return type is the handlers' union: taking it as a type argument of its own would fix
     * it to the first handler and reject the rest. For a guard rather than a tag, use ts-pattern.
     */
    match: Match<E>;
    /**
     * Reads the tag, selects that variant, and passes the payload to its constructor. For a payload
     * a schema library has already split by the tag. The return is the variants' constructors'
     * returns, as a union.
     *
     * Passing a field of another variant is a type error, even when the tag is a union.
     */
    seal: EnumSeal<E, Constructors<E, VM, F>>;
    readonly [Tag]: ByTag<E>;
    /** Every member `implTrait` registered. Read by `Trait`'s `dyn`. */
    readonly __valof_traits: Members;
  };

/**
 * The same for `Enum.sealer`, where the companion and every variant are callable. Calling the
 * companion is {@link EnumCompanion.seal}.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 *
 * @experimental
 */
export type EnumSealed<
  E extends AnyEnum,
  VM = Record<never, never>,
  M = Record<never, never>,
> = EnumSeal<E, SealerConstructors<E, VM>> &
  SealerConstructors<E, VM> &
  Duals<Omit<M, Wired | "match" | keyof VariantsOf<E>>, E> & {
    /** See {@link EnumCompanion.match}. */
    match: Match<E>;
    readonly [Tag]: ByTag<E>;
    /** Every member `implTrait` registered. Read by `Trait`'s `dyn`. */
    readonly __valof_traits: Members;
  };

/** The steps an enum's builder takes. A variant's are among them. */
export type EnumStep = "impl" | "implVariant" | "implSeal" | "implTrait";

/**
 * What `Enum.companion` returns, which its steps add to. `.impl` ends the chain, so a companion
 * that left it open cannot be given another seal after it was exported.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 *
 * @experimental
 */
export type EnumBuilder<
  E extends AnyEnum,
  VM = Record<never, never>,
  M = Record<never, never>,
  F = undefined,
> = EnumCompanion<E, VM, M, F> & {
  /**
   * Collects the members taking the union, in one call, which closes every step. Call it with no
   * argument to close with no member.
   *
   * A member reaching the companion, for `match`, for a variant or for a sibling, references it and
   * annotates its return type. Referencing a declaration inside its own initializer is a
   * circularity, which TypeScript reports as TS7023.
   *
   * The members, `match` and `[Tag].match` can be called with the value first or last. A member
   * cannot have an optional, a default or a rest parameter.
   *
   * See {@link https://jo16oh.github.io/valof/latest/companion-objects.html#call-a-member-with-the-value-last | Call a member with the value last}.
   */
  impl: {
    (): EnumCompanion<E, VM, M, F>;
    <G extends UnionMembers<E>>(fns: Unclaimed<E, G> & Arity<G>): EnumCompanion<E, VM, M & G, F>;
  };
  /**
   * Builds one variant: members, a seal of its own, or both. A variant you write nothing for
   * keeps the default frame, and one already built cannot be named again.
   *
   * The callback's argument is already that variant's frame, so one with no member to collect
   * returns it unchanged.
   *
   * Call it after `implSeal`: a variant's seal receives the enum's, and the enum's is read from the
   * chain as it stands then.
   */
  implVariant: <N extends Fresh<E, VM>, R extends ClosedFrame<E, N>>(
    name: N,
    build: (
      sealer: VariantSteps<E, N, F, undefined, Record<never, never>> &
        VariantFrame<E, N, F, undefined, Record<never, never>>,
    ) => R,
  ) => EnumBuilder<E, VM & { [P in N]: R }, M, F>;
  /**
   * Replaces the seal every variant passes, for what they all hold. A variant checks its own
   * payload in `implVariant`, and receives this one to call.
   *
   * Write it before the first `implVariant`.
   */
  implSeal: <G extends EnumSealImpl<E>>(
    seal: Before<VM, CheckedSeal<G>>,
  ) => EnumBuilder<E, VM, M, G>;
  /**
   * Implements a trait the enum declares. The implementation takes the union, so a member that
   * differs per variant is a `match` inside it.
   */
  implTrait: {
    <Tr extends AnyTrait, G, I extends Implement<Tr, G, E>>(
      trait: Takes<E, Tr, M, Complete<Tr, G>>,
      ...impl: Passes<Tr, G, I>
    ): EnumBuilder<E, VM, M & Unbound<MembersOf<Tr>, E>, F>;
  };
};

/**
 * What `Enum.sealer` returns: the mirror of {@link EnumBuilder}, minus the seals. A sealer's
 * constructors are the default seal, and a second one beside them would bypass the first.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 *
 * @experimental
 */
export type EnumSealer<
  E extends AnyEnum,
  VM = Record<never, never>,
  M = Record<never, never>,
> = EnumSealed<E, VM, M> & {
  /** See {@link EnumBuilder.impl}. */
  impl: {
    (): EnumSealed<E, VM, M>;
    <G extends UnionMembers<E>>(fns: Unclaimed<E, G> & Arity<G>): EnumSealed<E, VM, M & G>;
  };
  /** See {@link EnumBuilder.implVariant}. A sealer's variants take no seal of their own. */
  implVariant: <N extends Fresh<E, VM>, R extends ClosedSealerFrame<E, N>>(
    name: N,
    build: (
      sealer: SealerVariantSteps<E, N, Record<never, never>> &
        SealerFrame<E, N, Record<never, never>>,
    ) => R,
  ) => EnumSealer<E, VM & { [P in N]: R }, M>;
  /** See {@link EnumBuilder.implTrait}. */
  implTrait: {
    <Tr extends AnyTrait, G, I extends Implement<Tr, G, E>>(
      trait: Takes<E, Tr, M, Complete<Tr, G>>,
      ...impl: Passes<Tr, G, I>
    ): EnumSealer<E, VM, M & Unbound<MembersOf<Tr>, E>>;
  };
};

/** Forgotten, misspelled, or passed when the default holds: the type rejects all three. */
type TagArg<E extends AnyEnum> = [TagOf<E>] extends ["_tag"] ? [tag?: "_tag"] : [tag: TagOf<E>];

type Payload = Record<string, unknown>;

type Seal = (value: Payload, seal: (value: Payload) => unknown) => unknown;

type Sealer = ((payload: Payload) => unknown) & {
  patch: (value: Payload, patch: Payload) => unknown;
};

type Companion = {
  create: (payload: Payload) => unknown;
};

type Builds = Record<string, (b: object) => object>;

// No variant is named `_`: the declaration rejects it.
const matchTag = dual((tag: string, handlers: Record<string, () => unknown>) =>
  (handlers[tag] ?? handlers._)!(),
);

/**
 * One builder state. The companion is a proxy: it does not know the variant names, so anything it
 * does not handle itself becomes a frame.
 */
const state = (
  tag: string,
  callable: boolean,
  builds: Builds,
  members: Record<string, unknown>,
  traits: Record<string, unknown>,
  seal: Seal | undefined,
  open: boolean,
): object => {
  // Remembered for the allocation, not for identity: a frame built twice behaves the same, and
  // rebuilding one on every read would make a fresh closure per member per access.
  const frames = new Map<string, unknown>();
  const byTag = { match: matchTag, key: tag };

  const built = (name: string, custom: Seal | undefined, fns: Payload): object => {
    const tagged = (payload: Payload) => {
      assertVariantPayload(payload);
      return { ...payload, [tag]: name };
    };
    if (callable) {
      // The default seal, plus the `patch` that derives through it. The tag is not in the patch's
      // type and the value carries it already, so the merge leaves it alone.
      const sealer = Val.sealer() as unknown as Sealer;
      const frame = (payload: Payload) => sealer(tagged(payload));
      define(frame, "patch", sealer.patch);
      for (const key of Object.keys(fns)) define(frame, key, dual(fns[key]));
      return frame;
    }
    // The variant runs first and passes its result to the enum's, which passes it to the default
    // seal. `Val`'s frame holds one seal, so the two are composed before they reach it.
    const composed = custom
      ? (value: Payload, terminal: (value: Payload) => unknown) =>
          custom(value, (checked) => (seal ? seal(checked, terminal) : terminal(checked)))
      : seal;
    const chain = (
      Val.companion() as unknown as {
        implCreate: (create: (payload: Payload) => Payload) => {
          implSeal: (seal: Seal) => { impl: (fns: object) => object };
          impl: (fns: object) => object;
        };
      }
    ).implCreate(tagged);
    return composed ? chain.implSeal(composed).impl(fns) : chain.impl(fns);
  };

  // The steps are the frame with no member on it, so a callback that collects none returns this
  // one. `built` again for `.impl(fns)`: the members go on a frame nothing else holds.
  const steps = (name: string, custom: Seal | undefined): object => {
    const target = built(name, custom, {});
    define(target, "impl", (fns: Payload = {}) => built(name, custom, fns));
    if (!callable) define(target, "implSeal", (next: Seal) => steps(name, next));
    return target;
  };

  const frame = (name: string): unknown => {
    const found = frames.get(name);
    if (found !== undefined) return found;
    const build = builds[name];
    // The builder is made here and dropped here, so no chain of it reaches the companion.
    const made = build ? build(steps(name, undefined)) : built(name, undefined, {});
    frames.set(name, made);
    return made;
  };

  const enter = (value: Payload): unknown => {
    const made = frame(value[tag] as string);
    return callable ? (made as Sealer)(value) : (made as Companion).create(value);
  };

  const step = (
    nextBuilds: Builds,
    nextMembers: Record<string, unknown>,
    nextTraits: Record<string, unknown>,
    nextSeal: Seal | undefined,
    nextOpen: boolean,
  ): object => state(tag, callable, nextBuilds, nextMembers, nextTraits, nextSeal, nextOpen);

  const self: object = new Proxy(callable ? () => undefined : {}, {
    apply: (_, __, args: [Payload]) => enter(args[0]),
    get(_, key) {
      // A symbol reaches here from `await`, `JSON.stringify` and every other protocol read, and
      // `then` would make the companion a thenable. Both would otherwise resolve to a frame,
      // since the proxy has no list of variant names to check against. A `then` variant is an
      // error at the declaration, like a `then` member anywhere else.
      if (typeof key !== "string" || key === "then") return undefined;
      if (Object.hasOwn(members, key)) return members[key];
      if (key === "match") {
        return dual(
          (value: Record<string, unknown>, handlers: Record<string, (v: unknown) => unknown>) =>
            (handlers[value[tag] as string] ?? handlers._)!(value),
        );
      }
      // A sealer's entry is the call, so the name stays reserved and resolves to nothing.
      if (key === "seal") return callable ? undefined : enter;
      if (key === Tag) return byTag;
      if (key === "__valof_traits") return traits;
      if (key === "impl") {
        // One call, which closes every step: what it returns carries no `impl` of its own.
        return open
          ? (fns: Payload = {}) => step(builds, { ...members, ...duals(fns) }, traits, seal, false)
          : undefined;
      }
      if (key === "implVariant") {
        return open
          ? (name: string, build: (sealer: object) => object) =>
              step({ ...builds, [name]: build }, members, traits, seal, true)
          : undefined;
      }
      if (key === "implSeal") {
        return open && !callable
          ? (custom: Seal) => step(builds, members, traits, custom, true)
          : undefined;
      }
      if (key === "implTrait") {
        // The trait's own members and the enum's, merged the way `val.ts` merges them.
        return open
          ? (
              trait: { __valof_shared: Record<string, unknown> },
              fns: Record<string, unknown> = {},
            ) => {
              const grown = { ...traits, ...trait.__valof_shared, ...fns };
              return step(builds, { ...members, ...duals(grown) }, grown, seal, true);
            }
          : undefined;
      }
      return frame(key);
    },
  });
  return self;
};

/**
 * Builds the constructors for an enum: the companion and every variant are callable.
 * `Enum.companion` is the same, for an enum with a custom seal.
 *
 * The tag name is passed again here because the proxy has to write it at run time, and the type
 * argument is not readable from a value.
 *
 * @experimental
 */
export const sealer = <E extends AnyEnum>(...tag: TagArg<E>): EnumSealer<E> =>
  state(tag[0] ?? "_tag", true, {}, {}, {}, undefined, true) as EnumSealer<E>;

/**
 * Bundles an enum's members with a custom seal. Every variant builds with `.create`.
 *
 * @experimental
 */
export const companion = <E extends AnyEnum>(...tag: TagArg<E>): EnumBuilder<E> =>
  state(tag[0] ?? "_tag", false, {}, {}, {}, undefined, true) as EnumBuilder<E>;
