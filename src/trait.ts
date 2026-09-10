import type { AnyVal, Checked, DeepReadonly } from "./val.ts";

declare const SelfMark: unique symbol;

/**
 * The implementing Val, standing in for it inside a trait's member signatures.
 *
 * An opaque marker rather than a reference to the trait, which would be circular. `implTrait`
 * substitutes the Val for it, in parameter positions only: a member may not return `Self`.
 */
export type Self = { readonly [SelfMark]: true };

type AnyMember = (self: never, ...args: never[]) => unknown;

declare const FinalMark: unique symbol;

/**
 * Marks a member the trait implements for good: `implTrait` may not replace it, and a trait
 * carrying one cannot be implemented without its companion.
 *
 * The mark is phantom, so it costs nothing at run time and reads off the declaration:
 *
 * ```ts
 * type Greetable = Trait<
 *   "Greetable",
 *   { name: string },
 *   { greet: (self: Self) => string; shout: Final<(self: Self) => string> }
 * >;
 * ```
 */
export type Final<F extends AnyMember> = F & { readonly [FinalMark]: true };

/** The functions a trait declares, whichever side implements them. */
export type Members = Readonly<Record<string, AnyMember>>;

/** Every trait, as a constraint. */
export type AnyTrait = {
  readonly __valof_internal_phantom_trait_brands: Readonly<Record<string, Members>>;
};

/**
 * A structural contract shared by several Vals: the fields they hold, plus the functions they
 * share. `M` declares every function, and the trait's own two steps say which side implements
 * one: {@link TraitBuilder.implDefault} leaves it to each Val, {@link TraitBuilder.implFinal}
 * does not.
 *
 * The type is also the value type: a Val declaring the trait is assignable to it.
 */
export type Trait<K extends string, Shape, M extends Members = Record<never, never>> = DeepReadonly<
  Checked<Shape>
> & {
  // The members ride in the brand map rather than a key of their own, so a Val can carry the
  // brand without carrying a phantom key per trait. Several traits compose by intersection.
  readonly __valof_internal_phantom_trait_brands: { readonly [P in K]: M };
};

/** The fields a trait requires. */
export type ShapeOf<Tr extends AnyTrait> = Omit<Tr, "__valof_internal_phantom_trait_brands">;

type BrandsOf<Tr extends AnyTrait> = Tr["__valof_internal_phantom_trait_brands"];

/**
 * The traits a Val declares, or `never` when it declares none.
 *
 * Read through a conditional rather than an index: intersecting a plain Val with {@link AnyTrait}
 * to reach the key would hand back `string`, and every trait would look declared.
 */
export type TraitsOf<V> = V extends {
  readonly __valof_internal_phantom_trait_brands: infer B;
}
  ? keyof B
  : never;

/** The names a trait answers to: one, or several when traits were intersected. */
export type NamesOf<Tr extends AnyTrait> = keyof BrandsOf<Tr>;

/** The functions the trait declares. */
export type MembersOf<Tr extends AnyTrait> = BrandsOf<Tr>[keyof BrandsOf<Tr>];

/** The ones declared {@link Final}: the trait's to implement, and no Val's to replace. */
export type FinalsOf<Tr extends AnyTrait> = {
  [K in keyof MembersOf<Tr>]: MembersOf<Tr>[K] extends { readonly [FinalMark]: true } ? K : never;
}[keyof MembersOf<Tr>];

// Only parameters are walked: a member returning `Self` is rejected by `Declarable`.
type SubstArgs<A extends readonly unknown[], S> = {
  [I in keyof A]: [A[I]] extends [Self] ? S : A[I];
};

/** A trait's members as a Val implements them: the receiver first, as in every companion. */
export type Unbound<M extends Members, S> = {
  [K in keyof M]: M[K] extends (self: Self, ...args: infer A) => infer R
    ? (self: S, ...args: SubstArgs<A, S>) => R
    : never;
};

/** The same members on a {@link Dyn}, where the receiver is already bound. */
export type Bound<M extends Members, S> = {
  [K in keyof M]: M[K] extends (self: Self, ...args: infer A) => infer R
    ? (...args: SubstArgs<A, S>) => R
    : never;
};

type HasSelf<T> = [T] extends [Self]
  ? true
  : T extends AnyVal
    ? false
    : T extends readonly unknown[]
      ? { [I in keyof T]: HasSelf<T[I]> }[number] extends false
        ? false
        : true
      : T extends object
        ? { [K in keyof T]: HasSelf<T[K]> }[keyof T] extends false
          ? false
          : true
        : false;

/** Names the library wires onto a companion. A member taking one would shadow it. */
type Wired = "equals" | "patch" | "update" | "seal" | "create";

/**
 * Rejects a member a Val could not carry: one returning `Self`, and one named after something
 * the library wires, `__valof_`, the `impl` step and the trait's own `dyn` included.
 *
 * What wants to return a `Self` is a constructor, and a trait has no brand to seal with. Take
 * the field out through a member instead.
 */
export type Declarable<Tr extends AnyTrait, M extends Members> = {
  [K in keyof M]: K extends keyof ShapeOf<Tr>
    ? "a trait member cannot take a field's name"
    : K extends "dyn"
      ? "a trait member cannot take the name the trait itself uses"
      : K extends Wired | `__valof_${string}` | `impl${string}`
        ? "a trait member cannot take a name the library wires"
        : M[K] extends (...args: never[]) => infer R
          ? HasSelf<R> extends true
            ? "a trait member cannot return Self"
            : M[K]
          : M[K];
};

/**
 * A value paired with one Val's implementation of a trait: Rust's `Box<dyn Trait>`, with the
 * vtable passed rather than looked up. The concrete Val is gone, which is what lets values of
 * different types share an array.
 *
 * The trait's fields read straight off it, so a box goes anywhere the trait does: a function
 * taking `Greetable` accepts one.
 *
 * Not a Val, and not the value either: it is a proxy, so it has its own identity. It has no
 * `equals` and no `patch`, and `Checked` keeps it out of a payload.
 */
export type Dyn<Tr extends AnyTrait> = Tr & Bound<MembersOf<Tr>, Tr>;

/**
 * Where a companion records what it implemented. Read by {@link TraitCompanion.dyn}.
 *
 * One flat record, because no two traits on a Val may register the same name. A box therefore
 * binds every member the Val implements, and the ones outside this trait are invisible through
 * {@link Dyn}.
 */
export type TraitHost = { readonly __valof_traits: Members };

/**
 * What `Trait.companion` returns, which its `impl` grows.
 *
 * Only the members declared {@link Final} are named on it. A trait namespace that could call a
 * default would look like it dispatched, and it cannot: every call goes through the Val's
 * companion or a {@link Dyn}, both of which reach the Val's own version. The rest are on the
 * object all the same, since telling them apart at run time would take a mark the type erases.
 */
export type TraitCompanion<Tr extends AnyTrait, G = Record<never, never>> = Pick<
  G,
  FinalsOf<Tr> & keyof G
> & {
  /** Everything the trait implemented, which `implTrait` copies onto the Val. */
  readonly __valof_shared: G;
  /** Boxes a value with one Val's implementation. See {@link Dyn}. */
  readonly dyn: (companion: TraitHost, value: ShapeOf<Tr>) => Dyn<Tr>;
};

/** What the trait implements itself: its own members, over the shape. `Taken` is what it already
 * answered, one call of `impl` ago. */
export type Shared<Tr extends AnyTrait, Taken, G> = {
  readonly [K in keyof G]: K extends Taken
    ? "the trait already implements this member"
    : K extends keyof MembersOf<Tr>
      ? Unbound<MembersOf<Tr>, ShapeOf<Tr>>[K]
      : "a trait's own implementation must be one of its members";
};

/**
 * What a Val must pass to `implTrait`: the members the trait left open, and any override of the
 * ones it implemented.
 *
 * A {@link Final} member is declared `never` rather than left out. Left out, it is only the
 * excess property check that rejects one, and that check reads a fresh object literal alone: a
 * payload taken from an existing value would carry the override straight through.
 */
export type Implement<Tr extends AnyTrait, G, V> = Unbound<Omit<MembersOf<Tr>, keyof G>, V> &
  Partial<Unbound<Pick<MembersOf<Tr>, Exclude<keyof G, FinalsOf<Tr>> & keyof MembersOf<Tr>>, V>> &
  Partial<Record<FinalsOf<Tr>, never>>;

/**
 * Collects what a trait carries. The chain ends wherever the trait runs out of functions: a
 * builder is a companion already.
 */
export type TraitBuilder<Tr extends AnyTrait, G = Record<never, never>> = TraitCompanion<Tr, G> & {
  /**
   * Implements members over the shape alone. Which side of the contract one lands on is the
   * declaration's to say: a Val may replace an ordinary member through `implTrait`, and may not
   * replace one declared {@link Final}.
   */
  impl: <H extends Shared<Tr, keyof G, H>>(fns: H) => TraitBuilder<Tr, G & H>;
};

type AnyFn = (...args: never[]) => unknown;

const make = (impls: Record<string, unknown>): Record<string, unknown> => ({
  // Spread whole rather than the finals alone: the mark saying which those are is a type, gone by
  // now. Only the finals are named on the type, so the rest are unreachable without a cast.
  ...impls,
  __valof_shared: impls,
  // A proxy rather than a built object: a member is bound when it is called, and everything
  // else is the value's own. Nothing is copied, so the box costs one allocation whatever the
  // trait holds.
  //
  // A primitive cannot be a proxy's target, so it gets an empty one to stand behind. Nothing is
  // lost: a trait a primitive Val can declare has no fields to read.
  dyn: (companion: TraitHost, value: unknown) =>
    new Proxy(value !== null && typeof value === "object" ? value : {}, {
      get(_, key) {
        const member = (companion.__valof_traits as unknown as Record<string, AnyFn>)[
          key as string
        ];
        return member
          ? (...args: never[]) => member(value as never, ...args)
          : (value as Record<string, unknown>)[key as string];
      },
    }),
});

export const Trait = {
  /** Declares a trait's runtime side: what every Val implementing it shares. */
  companion: <Tr extends AnyTrait>(): MembersOf<Tr> extends Declarable<Tr, MembersOf<Tr>>
    ? TraitBuilder<Tr>
    : Declarable<Tr, MembersOf<Tr>> => {
    const build = (impls: Record<string, unknown>): Record<string, unknown> => {
      const target = make(impls);
      target["impl"] = (fns: Record<string, unknown>) => build({ ...impls, ...fns });
      return target;
    };
    return build({}) as never;
  },
} as const;
