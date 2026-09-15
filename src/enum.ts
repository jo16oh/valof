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
 * The name of the tag field, intersected into the declaration. The default is `_tag`.
 *
 * ```ts
 * type Event = Enum<"Event", Tag<"kind"> & { Click: { x: number }; Key: { code: string } }>;
 * ```
 *
 * The tag is real data and crosses the wire, so the name is yours when an API already has one.
 * A marker rather than a key of the record, so no variant name is reserved: `tag` is a variant
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
 * Every enum, as a constraint. A broken declaration does not satisfy it, which is what makes one
 * check answer for the companion and for `match` alike.
 *
 * @experimental
 */
export type AnyEnum = AnyVal &
  EnumPhantom<string, Record<string, object>, object, AnyTrait, string>;

/** The declaration's own keys. The tag marker has none, so only variants are left. */
type VariantKeys<D> = Extract<keyof D, string>;

type VariantsIn<D> = { [N in VariantKeys<D>]: D[N] };

type TagIn<D> = [D] extends [TagPhantom<infer T>] ? T : "_tag";

/** The fields every variant holds. A trait carries its own, so both arrive in one argument. */
type SharedIn<X> = Pick<X, keyof X>;

type TraitsIn<X> = Extract<X, AnyTrait>;

/** Distributes, so each key is compared against the whole: they differ only in a union. */
type Single<N, All = N> = N extends unknown ? ([All] extends [N] ? true : false) : false;

/**
 * Why this declaration cannot stand, or `never`. Read from the type arguments alone, so it rides
 * the brand position (notes §11.2).
 *
 * One variant is rejected for the declaration emit, not for the shape: an indexed access over a
 * single key hands back the variant itself, and the alias is lost with the union. A consumer's
 * `.d.ts` then expands onto the private phantoms and fails with TS4094. One variant is a Val
 * anyway, so the sentence says that rather than naming the emit. No variant at all needs no
 * sentence: the indexed access is `never`, and there is no value to build.
 */
type Fault<D, S, Tg extends string> =
  | (Single<VariantKeys<D>> extends true
      ? "an enum needs at least two variants; one is a Val"
      : never)
  | {
      [N in VariantKeys<D>]: N extends "match" | `impl${string}` | `__valof_${string}`
        ? "a variant cannot take a name the library wires"
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
// `export const Shape = Enum.companion<Shape>()`.
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
 * const Shape = Enum.companion<Shape>();
 * ```
 *
 * The third argument is what every variant holds: shared fields, traits, or both intersected.
 *
 * ```ts
 * type Shape = Enum<"Shape", { Circle: { r: number } }, { id: string } & Describable>;
 * ```
 *
 * @experimental
 */
export type Enum<K extends string, D extends object, X extends object = Record<never, never>> = {
  [N in VariantKeys<D>]: Val<
    `${K}.${N}`,
    D[N] & SharedIn<X> & { [P in TagIn<D>]: N },
    TraitsIn<X>
  > &
    EnumPhantom<
      Named<K, D, SharedIn<X>, TagIn<D>>,
      VariantsIn<D>,
      SharedIn<X>,
      TraitsIn<X>,
      TagIn<D>
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

/** One handler per variant, its argument narrowed. Every key is required, hence exhaustive. */
type Handlers<E extends AnyEnum, R> = { [N in keyof VariantsOf<E>]: (value: VariantOf<E, N>) => R };

/**
 * Rejects a key that names no variant. The excess property check cannot: `H` is inferred from
 * the literal, so the literal's type is `H` itself. The check rides on the parameter instead
 * (notes §11.1).
 */
type Only<E extends AnyEnum, H> = H & {
  [N in keyof H]: N extends keyof VariantsOf<E> ? unknown : "this enum has no such variant";
};

/**
 * A variant's frame: its constructor, its `patch`, and whatever `implVariant` registered.
 *
 * The constructor does not take the tag and `patch` cannot reach it, the way `.fixed` keeps a
 * key out of the derivation path.
 */
type Constructors<E extends AnyEnum, VM> = {
  [N in keyof VariantsOf<E>]: ((payload: SeedFor<E, N>) => VariantOf<E, N>) & {
    /** Derives through the same seal the constructor uses. See {@link Patch}. */
    patch: (value: VariantOf<E, N>, patch: Patch<SeedFor<E, N>>) => VariantOf<E, N>;
  } & (N extends keyof VM ? VM[N] : unknown);
};

/** What `implVariant` accepts: members for some variants, each taking its own variant first. */
type VariantImpls<E extends AnyEnum> = {
  [N in keyof VariantsOf<E>]?: CompanionMembers<VariantOf<E, N>>;
};

/**
 * What `.impl` accepts. A variant's name is reserved: a member taking one would cover the
 * constructor.
 */
type UnionMembers<E extends AnyEnum> = CompanionMembers<E> &
  Partial<Record<(keyof VariantsOf<E> & string) | "match", never>>;

/** Whether the enum declares the trait at all. The check rides on the parameter (notes §11.1). */
type Takes<E extends AnyEnum, Tr extends AnyTrait, Ok> = [NamesOf<Tr>] extends [TraitsOf<E>]
  ? Ok
  : "the type does not declare this trait";

/** The second argument, absent where the trait answered for every member itself. */
type Passes<Tr extends AnyTrait, G, E, Self> = [keyof Omit<MembersOf<Tr>, keyof G>] extends [never]
  ? [impl?: (self: Self) => Implement<Tr, G, E>]
  : [impl: (self: Self) => Implement<Tr, G, E>];

/**
 * An enum's members: one frame per variant, `match`, and whatever the steps registered.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 *
 * @experimental
 */
export type EnumCompanion<
  E extends AnyEnum,
  VM = Record<never, never>,
  M = Record<never, never>,
> = Constructors<E, VM> &
  Omit<M, Wired | "match" | keyof VariantsOf<E>> & {
    /**
     * Dispatches on the tag. Every variant needs a handler, so adding one to the declaration
     * fails here rather than falling through at run time.
     *
     * The return type is the handlers' union: taking it as a type argument of its own would fix
     * it to the first handler and reject the rest. For a guard rather than a tag, use ts-pattern.
     */
    match: <H extends Handlers<E, unknown>>(
      value: E,
      handlers: Only<E, H>,
    ) => ReturnType<H[keyof H]>;
    /** Every member `implTrait` registered. Read by `Trait`'s `dyn`. */
    readonly __valof_traits: Members;
  };

/**
 * What `Enum.companion` returns, which its steps grow.
 *
 * Every step takes a callback. A member written over an enum reaches for `match` first, and
 * naming the companion inside its own initializer is TS7022.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 *
 * @experimental
 */
export type EnumBuilder<
  E extends AnyEnum,
  VM = Record<never, never>,
  M = Record<never, never>,
> = EnumCompanion<E, VM, M> & {
  /** Collects the members taking the union. A sibling from the same call needs an annotation. */
  impl: <G extends UnionMembers<E>>(
    fns: (self: EnumCompanion<E, VM, M>) => G,
  ) => EnumBuilder<E, VM, M & G>;
  /** Collects members for single variants. A variant you write nothing for can be left out. */
  implVariant: <W extends VariantImpls<E>>(
    fns: (self: EnumCompanion<E, VM, M>) => W,
  ) => EnumBuilder<E, VM & W, M>;
  /**
   * Implements a trait the enum declares. The implementation takes the union, so a member that
   * differs per variant is a `match` inside it.
   */
  implTrait: <Tr extends AnyTrait, G>(
    trait: Takes<E, Tr, TraitCompanion<Tr, G>>,
    ...impl: Passes<Tr, G, E, EnumCompanion<E, VM, M>>
  ) => EnumBuilder<E, VM, M & Unbound<MembersOf<Tr>, E>>;
};

/** Forgotten, misspelled, or passed when the default holds: the type rejects all three. */
type TagArg<E extends AnyEnum> = [TagOf<E>] extends ["_tag"] ? [tag?: "_tag"] : [tag: TagOf<E>];

type Frame = ((payload: object) => object) & { patch: (value: object, patch: object) => object };

type Impls = Record<string, Record<string, unknown>>;

/**
 * One builder state. The companion is a proxy: it does not know the variant names, so anything
 * it does not answer for itself becomes a frame.
 */
const state = (
  tag: string,
  variants: Impls,
  members: Record<string, unknown>,
  traits: Record<string, unknown>,
): object => {
  // Remembered for the allocation, not for identity: a frame built twice behaves the same, and
  // rebuilding one on every read would make a fresh closure per member per access.
  const frames = new Map<string, unknown>();

  const frame = (name: string): unknown => {
    const found = frames.get(name);
    if (found !== undefined) return found;
    // A sealer is the default seal, plus the `patch` that derives through it. The tag is not in
    // the patch's type and the value carries it already, so the merge leaves it alone.
    const sealer = Val.sealer() as unknown as Frame;
    const built = (payload: Record<string, unknown>) => sealer({ ...payload, [tag]: name });
    define(built, "patch", sealer.patch);
    const impl = variants[name];
    if (impl) for (const key of Object.keys(impl)) define(built, key, impl[key]);
    frames.set(name, built);
    return built;
  };

  const self: object = new Proxy(
    {},
    {
      get(_, key) {
        // A symbol reaches here from `await`, `JSON.stringify` and every other protocol read, and
        // `then` would make the companion thenable. Both would otherwise come back as a frame,
        // since the proxy has no list of variant names to check against. A `then` variant is lost.
        if (typeof key !== "string" || key === "then") return undefined;
        if (Object.hasOwn(members, key)) return members[key];
        if (key === "match") {
          return (
            value: Record<string, unknown>,
            handlers: Record<string, (v: unknown) => unknown>,
          ) => handlers[value[tag] as string]!(value);
        }
        if (key === "__valof_traits") return traits;
        if (key === "impl") {
          return (fns: (self: object) => Record<string, unknown>) =>
            state(tag, variants, { ...members, ...fns(self) }, traits);
        }
        if (key === "implVariant") {
          return (fns: (self: object) => Impls) => {
            const grown: Impls = { ...variants };
            const added = fns(self);
            for (const name of Object.keys(added)) {
              grown[name] = { ...grown[name], ...added[name] };
            }
            return state(tag, grown, members, traits);
          };
        }
        if (key === "implTrait") {
          // The trait's own members and the enum's, merged the way `val.ts` merges them.
          return (
            trait: { __valof_shared?: Record<string, unknown> },
            fns?: (self: object) => Record<string, unknown>,
          ) => {
            const grown = {
              ...traits,
              ...(trait.__valof_shared ?? trait),
              ...(fns ? fns(self) : {}),
            };
            return state(tag, variants, { ...members, ...grown }, grown);
          };
        }
        return frame(key);
      },
    },
  );
  return self;
};

/** @experimental */
export const Enum = {
  /**
   * Builds the companion for an enum. The tag name is passed again here because the proxy has to
   * write it at run time, and the type argument is not readable from a value.
   */
  companion: <E extends AnyEnum>(...tag: TagArg<E>): EnumBuilder<E> =>
    state(tag[0] ?? "_tag", {}, {}, {}) as EnumBuilder<E>,
} as const;
