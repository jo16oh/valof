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

/** The members a trait leaves to each Val. Its defaults are not written here. */
export type Members = Readonly<Record<string, AnyMember>>;

/** Every trait, as a constraint. */
export type AnyTrait = {
  readonly __valof_internal_phantom_trait_brands: Readonly<Record<string, Members>>;
};

/**
 * A structural contract shared by several Vals: the fields they hold, plus the functions they
 * share. `M` lists what each Val implements for itself; the shared ones are the defaults given
 * to {@link TraitBuilder.impl} and live on the trait alone.
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

/** The members the trait leaves to each Val. */
export type MembersOf<Tr extends AnyTrait> = BrandsOf<Tr>[keyof BrandsOf<Tr>];

// Only parameters are walked: a member returning `Self` is rejected by `ObjectSafe`.
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

/**
 * Rejects a member returning `Self`. What wants to return one is a constructor, and a trait has
 * no brand to seal with. Take the field out through a shared member instead.
 */
export type ObjectSafe<M extends Members> = {
  [K in keyof M]: M[K] extends (...args: never[]) => infer R
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
 * The trait's fields read straight off it, so a box goes anywhere the shape does.
 *
 * Not a Val, and not the value either: it is a proxy, so it has its own identity. It has no
 * `equals` and no `patch`, and `Checked` keeps it out of a payload.
 */
export type Dyn<Tr extends AnyTrait> = ShapeOf<Tr> & Bound<MembersOf<Tr>, ShapeOf<Tr>>;

/**
 * Where a companion records what it implemented. Read by {@link TraitCompanion.dyn}.
 *
 * One flat record, because no two traits on a Val may register the same name. A box therefore
 * binds every member the Val implements, and the ones outside this trait are invisible through
 * {@link Dyn}.
 */
export type TraitHost = { readonly __valof_traits: Members };

/** What `Trait.companion` returns once `.impl` closed the chain. */
export type TraitCompanion<Tr extends AnyTrait, D> = D & {
  /**
   * Boxes a value with one Val's implementation. See {@link Dyn}.
   *
   * A Val whose payload is a primitive cannot be boxed: a proxy needs an object to stand in
   * front of. Call the companion directly there, where the type is known anyway.
   */
  readonly dyn: (companion: TraitHost, value: ShapeOf<Tr> & Record<string, unknown>) => Dyn<Tr>;
};

/**
 * The shared functions a trait may hold: anything but a name it left to each Val. The two sets
 * stay disjoint, which is what makes a call through the trait unable to skip a Val's own version.
 */
export type Defaults<Tr extends AnyTrait, D> = {
  readonly [K in keyof D]: K extends keyof MembersOf<Tr>
    ? "a shared function cannot take the name of a member each Val implements"
    : (self: ShapeOf<Tr>, ...args: never[]) => unknown;
};

/** Collects a trait's shared functions. */
export type TraitBuilder<Tr extends AnyTrait> = TraitCompanion<Tr, Record<never, never>> & {
  /**
   * The functions computed from the shape alone. They cannot be overridden, so calling one
   * through the trait can never skip a Val's own version.
   */
  impl: <D extends Defaults<Tr, D>>(fns: D) => TraitCompanion<Tr, D>;
};

type AnyFn = (...args: never[]) => unknown;

const make = (fns: Record<string, unknown>): Record<string, unknown> => ({
  ...fns,
  // A proxy rather than a built object: a member is bound when it is called, and everything
  // else is the value's own. Nothing is copied, so the box costs one allocation whatever the
  // trait holds.
  dyn: (companion: TraitHost, value: object) =>
    new Proxy(value, {
      get(target, key) {
        const member = (companion.__valof_traits as unknown as Record<string, AnyFn>)[
          key as string
        ];
        return member
          ? (...args: never[]) => member(target as never, ...args)
          : (target as Record<string, unknown>)[key as string];
      },
    }),
});

export const Trait = {
  /** Declares a trait's runtime side: what every Val implementing it shares. */
  companion: <Tr extends AnyTrait>(): MembersOf<Tr> extends ObjectSafe<MembersOf<Tr>>
    ? TraitBuilder<Tr>
    : ObjectSafe<MembersOf<Tr>> => {
    const target = make({});
    target["impl"] = (fns: Record<string, unknown>) => make(fns);
    return target as never;
  },
} as const;
