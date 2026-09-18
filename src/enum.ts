import type {
  AnyTrait,
  Implement,
  Members,
  MembersOf,
  NamesOf,
  TraitCompanion,
  TraitsOf,
  Unbound,
} from "./trait.ts";
import {
  define,
  Val,
  type AnyVal,
  type CompanionMembers,
  type DeepReadonly,
  type Invalid,
  type Patch,
  type Wired,
} from "./val.ts";

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
type SharedIn<X> = Pick<X, keyof X>;

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
type Fault<D, S, Tg extends string> =
  | (Single<VariantKeys<D>> extends true
      ? "an enum needs at least two variants; one is a Val"
      : never)
  | {
      [N in VariantKeys<D>]: N extends "then"
        ? "a variant named `then` would make the companion a thenable"
        : N extends "match" | "seal" | `impl${string}` | `__valof_${string}`
          ? "a variant cannot take a name the library reserves"
          : [D[N]] extends [object]
            ? [D[N]] extends [ReadonlyArray<unknown>]
              ? "a variant's payload must be a record of fields"
              : Tg extends keyof D[N]
                ? "the tag cannot take the name of a field the payload holds"
                : never
            : "a variant's payload must be a record of fields";
    }[VariantKeys<D>]
  | (Tg extends keyof S ? "the tag cannot take the name of a shared field" : never);

// The fault goes in the brand the phantom carries, never at the top level of `Enum`. An alias
// whose top level is a conditional loses its name once it resolves, and a consumer's `.d.ts`
// then expands the union onto val.ts's private `Phantom`: TS4094 on the one line
// `export const Shape = Enum.sealer<Shape>()`.
type Named<K extends string, D, S, Tg extends string> = [Fault<D, S, Tg>] extends [never]
  ? K
  : Invalid<Fault<D, S, Tg>>;

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
export type Enum<K extends string, D extends object, X extends object = Record<never, never>> = {
  [N in VariantKeys<D>]: Val<
    `${K}.${N}`,
    D[N] & SharedIn<X> & { [P in TagIn<X>]: N },
    TraitsIn<X>
  > &
    EnumPhantom<
      Named<K, D, SharedIn<X>, TagIn<X>>,
      VariantsIn<D>,
      SharedIn<X>,
      TraitsIn<X>,
      TagIn<X>
    >;
}[VariantKeys<D>];

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
 * expanded intersection. Write `type Circle = VariantOf<Shape, "Circle">` for a shorter one
 * still.
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
  VariantsOf<E>[N] & SharedOf<E>
>;

/** One variant's payload as a seal sees it: the constructor has written the tag by then. */
type Tagged<E extends AnyEnum, N extends keyof VariantsOf<E>> = SeedFor<E, N> & {
  readonly [P in TagOf<E>]: N & string;
};

/**
 * What the boundary entry takes: a tagged payload of any one variant. The tag is what draws the
 * frame, so it is part of the input rather than something the entry writes.
 *
 * @experimental
 */
export type SealedPayload<E extends AnyEnum> = {
  [N in keyof VariantsOf<E>]: Tagged<E, N>;
}[keyof VariantsOf<E>];

/** One handler per variant, its argument narrowed. Every key is required, hence exhaustive. */
type Handlers<E extends AnyEnum, R> = { [N in keyof VariantsOf<E>]: (value: VariantOf<E, N>) => R };

/**
 * Rejects a key that names no variant. The excess property check cannot: `H` is inferred from the
 * literal, so the literal's type is `H` itself. The check is placed on the parameter instead (notes
 * §11.1).
 */
type Only<E extends AnyEnum, H> = H & {
  [N in keyof H]: N extends keyof VariantsOf<E> ? unknown : "this enum has no such variant";
};

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
type Mints<A, R> = ((payload: A) => R) & {
  /** Reuses the seal without copying its terminal payload. */
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
type CheckedSeal<G extends (...args: never[]) => unknown> = [string] extends [Parameters<G>[0]]
  ? Invalid<"a seal takes the payload, not a wire format; decode before sealing">
  : G;

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

type Framed<E extends AnyEnum, N extends keyof VariantsOf<E>, R, Sealed, T> = Omit<T, Wired> & {
  /** Mints the payload with its tag and seals it, so it returns whatever the seal returns. */
  create: Mints<SeedFor<E, N>, R>;
  /** Derives through the same seal the constructor uses. See {@link Patch}. */
  patch: (value: VariantOf<E, N>, patch: Patch<SeedFor<E, N>>) => R;
} & (Sealed extends true
    ? {
        /** The single gate a payload of this variant passes. `create` and `patch` go through it. */
        seal: Mints<Tagged<E, N>, R>;
      }
    : Record<never, never>);

/** A variant's frame on a sealer: the constructor itself, its `patch`, and its own members. */
type SealerFrame<E extends AnyEnum, N extends keyof VariantsOf<E>, T> = ((
  payload: SeedFor<E, N>,
) => VariantOf<E, N>) & {
  /** Derives through the same seal the constructor uses. See {@link Patch}. */
  patch: (value: VariantOf<E, N>, patch: Patch<SeedFor<E, N>>) => VariantOf<E, N>;
} & Omit<T, Wired>;

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
  /** Collects the members taking this variant. */
  impl: {
    (): VariantFrame<E, N, FE, FV, T>;
    <M extends CompanionMembers<VariantOf<E, N>>>(fns: M): VariantFrame<E, N, FE, FV, M & T>;
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
  /** Collects the members taking this variant. */
  impl: {
    (): SealerFrame<E, N, T>;
    <M extends CompanionMembers<VariantOf<E, N>>>(fns: M): SealerFrame<E, N, M & T>;
  };
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

/** What a frame's constructor hands back, whichever form the frame takes. */
type Yields<X> = X extends { create: (...args: never[]) => infer R }
  ? R
  : X extends (...args: never[]) => infer R
    ? R
    : never;

/** The boundary entry's return: each variant's seal, as a union. `match`'s rule. */
type Boundary<C> = { [N in keyof C]: Yields<C[N]> }[keyof C];

/**
 * What `.impl` accepts. A variant's name is reserved: a member taking one would shadow the
 * constructor.
 */
type UnionMembers<E extends AnyEnum> = CompanionMembers<E> &
  Partial<Record<(keyof VariantsOf<E> & string) | "match", never>>;

/** Whether the enum declares the trait at all. The check is placed on the parameter (notes §11.1). */
type Takes<E extends AnyEnum, Tr extends AnyTrait, Ok> = [NamesOf<Tr>] extends [TraitsOf<E>]
  ? Ok
  : "the type does not declare this trait";

/** The second argument, absent where the trait answered for every member itself. */
type Passes<Tr extends AnyTrait, G, E> = [keyof Omit<MembersOf<Tr>, keyof G>] extends [never]
  ? [impl?: Implement<Tr, G, E>]
  : [impl: Implement<Tr, G, E>];

/** Dispatches on the tag. See {@link EnumCompanion.match}. */
type Match<E extends AnyEnum> = <H extends Handlers<E, unknown>>(
  value: E,
  handlers: Only<E, H>,
) => ReturnType<H[keyof H]>;

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
  Omit<M, Wired | "match" | keyof VariantsOf<E>> & {
    /**
     * Dispatches on the tag. Every variant needs a handler, so adding one to the declaration
     * fails here rather than falling through at run time.
     *
     * The return type is the handlers' union: taking it as a type argument of its own would fix
     * it to the first handler and reject the rest. For a guard rather than a tag, use ts-pattern.
     */
    match: Match<E>;
    /**
     * The boundary entry: selects the variant from the tag and passes the payload to its seal. The
     * return is the variants' seals as a union, for the same reason `match` returns one.
     */
    seal: (value: SealedPayload<E>) => Boundary<Constructors<E, VM, F>>;
    /** Every member `implTrait` registered. Read by `Trait`'s `dyn`. */
    readonly __valof_traits: Members;
  };

/**
 * The same for `Enum.sealer`, where the companion itself is the boundary entry and every variant
 * is callable.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 *
 * @experimental
 */
export type EnumSealed<E extends AnyEnum, VM = Record<never, never>, M = Record<never, never>> = ((
  value: SealedPayload<E>,
) => Boundary<SealerConstructors<E, VM>>) &
  SealerConstructors<E, VM> &
  Omit<M, Wired | "match" | keyof VariantsOf<E>> & {
    /** See {@link EnumCompanion.match}. */
    match: Match<E>;
    /** Every member `implTrait` registered. Read by `Trait`'s `dyn`. */
    readonly __valof_traits: Members;
  };

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
   */
  impl: {
    (): EnumCompanion<E, VM, M, F>;
    <G extends UnionMembers<E>>(fns: G): EnumCompanion<E, VM, M & G, F>;
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
  implTrait: <Tr extends AnyTrait, G>(
    trait: Takes<E, Tr, TraitCompanion<Tr, G>>,
    ...impl: Passes<Tr, G, E>
  ) => EnumBuilder<E, VM, M & Unbound<MembersOf<Tr>, E>, F>;
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
    <G extends UnionMembers<E>>(fns: G): EnumSealed<E, VM, M & G>;
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
  implTrait: <Tr extends AnyTrait, G>(
    trait: Takes<E, Tr, TraitCompanion<Tr, G>>,
    ...impl: Passes<Tr, G, E>
  ) => EnumSealer<E, VM, M & Unbound<MembersOf<Tr>, E>>;
};

/** Forgotten, misspelled, or passed when the default holds: the type rejects all three. */
type TagArg<E extends AnyEnum> = [TagOf<E>] extends ["_tag"] ? [tag?: "_tag"] : [tag: TagOf<E>];

type Payload = Record<string, unknown>;

type Seal = (value: Payload, seal: (value: Payload) => unknown) => unknown;

type Sealer = ((payload: Payload) => unknown) & {
  patch: (value: Payload, patch: Payload) => unknown;
};

type Companion = {
  create: ((payload: Payload) => unknown) & { nocopy: (payload: Payload) => unknown };
};

type Builds = Record<string, (b: object) => object>;

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

  const built = (name: string, custom: Seal | undefined, fns: Payload): object => {
    const mint = (payload: Payload) => ({ ...payload, [tag]: name });
    if (callable) {
      // The default seal, plus the `patch` that derives through it. The tag is not in the patch's
      // type and the value carries it already, so the merge leaves it alone.
      const sealer = Val.sealer() as unknown as Sealer;
      const frame = (payload: Payload) => sealer(mint(payload));
      define(frame, "patch", sealer.patch);
      for (const key of Object.keys(fns)) define(frame, key, fns[key]);
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
    ).implCreate(mint);
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
        return (
          value: Record<string, unknown>,
          handlers: Record<string, (v: unknown) => unknown>,
        ) => handlers[value[tag] as string]!(value);
      }
      // A sealer's boundary entry is the call, so the name stays reserved and resolves to nothing.
      if (key === "seal") return callable ? undefined : enter;
      if (key === "__valof_traits") return traits;
      if (key === "impl") {
        // One call, which closes every step: what it returns carries no `impl` of its own.
        return open
          ? (fns: Payload = {}) => step(builds, { ...members, ...fns }, traits, seal, false)
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
              return step(builds, { ...members, ...grown }, grown, seal, true);
            }
          : undefined;
      }
      return frame(key);
    },
  });
  return self;
};

/** @experimental */
export const Enum = {
  /**
   * Builds the constructors for an enum: every variant is callable, and the companion itself is
   * the boundary entry. `Enum.companion` is the same shape for an enum with a smart constructor.
   *
   * The tag name is passed again here because the proxy has to write it at run time, and the type
   * argument is not readable from a value.
   */
  sealer: <E extends AnyEnum>(...tag: TagArg<E>): EnumSealer<E> =>
    state(tag[0] ?? "_tag", true, {}, {}, {}, undefined, true) as EnumSealer<E>,
  /**
   * Bundles an enum's members with a seal of its own. Every variant builds with `.create`, and
   * the boundary entry is `.seal`.
   */
  companion: <E extends AnyEnum>(...tag: TagArg<E>): EnumBuilder<E> =>
    state(tag[0] ?? "_tag", false, {}, {}, {}, undefined, true) as EnumBuilder<E>,
} as const;
