import {
  createMembers,
  type Arity,
  type Duals,
  type LooseArity,
  type Looses,
  type Omission,
} from "./dual/index.ts";
import { Shared, Traits } from "./keys.ts";
import type {
  DeclaredBrands,
  DeclaredShape,
  DeclaredVerdict,
  InvalidKey,
  RefusedKey,
  TraitBrands,
  TraitTypes,
} from "./keys.ts";
import {
  associated,
  isObject,
  type AnyVal,
  type AssocMembers,
  type CallBuildFirst,
  type Checked,
  type DeepReadonly,
  type Grown,
  type Invalid,
  type Reserved,
} from "./val.ts";
import * as Trait from "./ns/trait.ts";

declare const SelfMark: unique symbol;

/**
 * The implementing Val, standing in for it inside a trait's member signatures.
 *
 * An opaque marker rather than a reference to the trait, which would be circular. It may appear only
 * as a member's first parameter, and `implTrait` substitutes the Val for it. No other parameter may
 * use it, because a {@link Dyn} would pass another Val there. The return type may not use it either.
 * Where another parameter is a value implementing the trait, type it with {@link Impl}:
 * `(self: Self, other: Impl<Same>) => boolean`.
 */
export type Self = { readonly [SelfMark]: true };

type AnyMember = (self: never, ...args: never[]) => unknown;

declare const FinalMark: unique symbol;

/**
 * Marks a member the trait implements permanently. `implTrait` may not replace it, and rejects the
 * trait until the trait's companion implements it.
 *
 * The mark exists only in the type, so it costs nothing at run time. The declaration shows it:
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

/**
 * The members a trait declares, whichever side implements them.
 */
export type Members = Readonly<Record<string, AnyMember>>;

/**
 * Type-only nominal identity, carried by every Val declaring a trait and by {@link Impl}. Private
 * members disappear from `keyof` and object spreads, so the brand stays out of `{ ...value }`.
 */
declare class TraitPhantom<B> {
  private readonly [TraitBrands]: B;
  /** Declaration emit erases private field types; protected keeps the brand map recoverable. */
  protected readonly [TraitTypes]: B;
}

/**
 * What a trait declares, read where the trait is used. `B` maps the trait's name to its members,
 * `S` is the shape, and `V`, the verdict, maps the name to the members as {@link Declarable}
 * checked them. Several traits intersect into one. Their records intersect by name, and their
 * shapes intersect.
 */
declare class TraitDeclaration<B, S, V> {
  protected readonly [DeclaredBrands]: B;
  protected readonly [DeclaredShape]: S;
  protected readonly [DeclaredVerdict]: V;
}

/**
 * Every trait, as a constraint.
 */
export type AnyTrait = TraitDeclaration<
  Readonly<Record<string, Members>>,
  unknown,
  Readonly<Record<string, Members & Unrejected>> & Unrejected
>;

// A broken declaration leaves an `Invalid` or a `Refused` in place of a trait's members. Both have
// only a symbol key, which `Record<string, …>` does not check.
type Unrejected = { readonly [InvalidKey]?: never; readonly [RefusedKey]?: never };

/**
 * A structural contract shared by several Vals: the fields they hold, plus the members they share.
 * `M` declares every function, and the declaration says which side implements one: {@link Final}
 * reserves a member for the trait, and every other one a Val may replace through `implTrait`.
 *
 * A trait is only a declaration. The type of a value implementing it is {@link Impl}.
 */
// A broken declaration puts the annotated version in the verdict, the way an invalid payload lands
// in a Val's brand. `Members` admits functions alone, so an `Invalid` there stops the trait
// satisfying `AnyTrait`, and every gate requires an `AnyTrait`. So the companion, `Val`, `Dyn`
// and `implTrait` all report it without a check of their own.
interface Trait<
  K extends string,
  Shape,
  M extends Members = Record<never, never>,
> extends TraitDeclaration<
  { readonly [P in K]: M },
  Shape,
  {
    readonly [P in K]: [Shape] extends [Checked<Shape>]
      ? [M] extends [Declarable<Shape, M>]
        ? M
        : Declarable<Shape, M>
      : Checked<Shape>;
  }
> {}

export { Trait };

/**
 * A value implementing the trait: any Val declaring it, or a {@link Dyn}. Write several traits as
 * one intersection, `Impl<Greetable & Serializable>`, as in a Val's declaration. A trait's member
 * may take one after {@link Self}.
 */
export type Impl<Tr extends AnyTrait> = ShapeOf<Tr> & TraitPhantom<BrandsOf<Tr>>;

/** The fields a trait requires, read-only. */
export type ShapeOf<Tr extends AnyTrait> = DeepReadonly<FieldsOf<Tr>>;

/** The fields a trait requires, as the declaration wrote them. */
export type FieldsOf<Tr> = Tr extends TraitDeclaration<unknown, infer S, unknown> ? S : never;

/** The trait's name mapped to its members, as declared. */
export type BrandsOf<Tr> = Tr extends TraitDeclaration<infer B, unknown, unknown> ? B : never;

/**
 * The trait's name mapped to its members, with an `Invalid` in place of each one {@link Declarable}
 * rejects. Unconstrained, so that a broken declaration, which does not satisfy {@link AnyTrait}, can
 * be read out.
 */
export type VerdictOf<Tr> = Tr extends TraitDeclaration<unknown, unknown, infer V> ? V : never;

/**
 * The trait brands a Val carries, or nothing when it declares none.
 *
 * The same class {@link Impl} carries, which is what keeps a Val assignable to it. Several traits
 * are one intersection: `Val<"User", P, Greetable & Serializable>`. Their brand maps intersect too,
 * so the Val stays assignable to each of them.
 */
export type TraitBrand<Tr extends AnyTrait> = [Tr] extends [never]
  ? unknown
  : TraitPhantom<BrandsOf<Tr>>;

/**
 * The traits a Val declares, or `never` when it declares none.
 *
 * Read through a conditional rather than an index: intersecting a plain Val with
 * {@link TraitPhantom} to reach the key would return `string`, and every trait would look declared.
 */
export type TraitsOf<V> = V extends TraitPhantom<infer B> ? keyof B : never;

/** The names a trait carries: one, or several when traits were intersected. */
export type NamesOf<Tr extends AnyTrait> = keyof BrandsOf<Tr>;

/** The members the trait declares. */
export type MembersOf<Tr extends AnyTrait> = BrandsOf<Tr>[keyof BrandsOf<Tr>];

/** The ones declared {@link Final}: the trait's to implement, and no Val's to replace. */
export type FinalsOf<Tr extends AnyTrait> = {
  [K in keyof MembersOf<Tr>]: MembersOf<Tr>[K] extends { readonly [FinalMark]: true } ? K : never;
}[keyof MembersOf<Tr>];

/** A trait's members as a Val implements them: the receiver first, as in every companion. */
export type Unbound<M extends Members, S> = {
  [K in keyof M]: M[K] extends (self: Self, ...args: infer A) => infer R
    ? (self: S, ...args: A) => R
    : never;
};

/** The same members on a {@link Dyn}, where the receiver is already bound. */
export type Bound<M extends Members> = {
  [K in keyof M]: M[K] extends (self: Self, ...args: infer A) => infer R
    ? (...args: A) => R
    : never;
};

// The search stops at five levels, the parameter or return type itself being the first. Without the
// bound, a type that refers to itself, such as `Promise` or a linked list, makes it fail with TS2615.
// Self inside more than four nested types is missed.
type HasSelf<T, Depth extends unknown[] = []> = Depth["length"] extends 5
  ? false
  : true extends (T extends unknown ? HasSelfBranch<T, [...Depth, unknown]> : never)
    ? true
    : false;

// A `PromiseLike` is unwrapped rather than searched. Searched through `then`, its `T` appears at the
// callback's parameter, two levels deeper than the unwrapped `T`, so the depth bound reaches two
// fewer levels inside it.
//
// `any` is not `Self`. Without the check, a member returning `Map` is rejected because of
// the `thisArg?: any` parameter of `forEach`.
type HasSelfBranch<T, Depth extends unknown[]> = 0 extends 1 & T
  ? false
  : [T] extends [Self]
    ? true
    : T extends AnyVal
      ? false
      : T extends PromiseLike<infer U>
        ? HasSelf<U, Depth>
        : T extends (...args: infer A) => infer R
          ? true extends HasSelf<R, Depth> | { [I in keyof A]: HasSelf<A[I], Depth> }[number]
            ? true
            : false
          : T extends readonly unknown[]
            ? true extends { [I in keyof T]: HasSelf<T[I], Depth> }[number]
              ? true
              : false
            : T extends object
              ? true extends { [K in keyof T]: HasSelf<T[K], Depth> }[keyof T]
                ? true
                : false
              : false;

/**
 * Rejects a member a Val could not carry: one with `Self` in a parameter after the first, one
 * returning `Self`, and one named after something the library reserves, the trait's own `dyn` included.
 *
 * What wants to return a `Self` is a constructor, and a trait has no brand to seal with. Take
 * the field out through a member instead.
 *
 * Taken over the shape rather than the trait, so {@link Trait} can read it while defining
 * itself. Every check here reads the declaration alone, which is what lets it live in the verdict.
 */
type Declarable<Shape, M extends Members> = {
  [K in keyof M]: K extends keyof DeepReadonly<Checked<Shape>>
    ? Invalid<"a trait member cannot take a field's name">
    : K extends "dyn"
      ? Invalid<"a trait member cannot take the name the trait itself uses">
      : K extends Reserved
        ? Invalid<"a trait member cannot take a name the library reserves">
        : M[K] extends (self: never, ...args: infer A) => infer R
          ? true extends { [I in keyof A]: HasSelf<A[I]> }[number]
            ? Invalid<"Self can only be a member's first parameter; type a later parameter with Impl">
            : HasSelf<R> extends true
              ? Invalid<"a trait member cannot return Self">
              : Omission<M[K]> extends string
                ? Invalid<Omission<M[K]> & string>
                : M[K]
          : M[K];
};

/**
 * A value paired with one Val's implementation of a trait: Rust's `Box<dyn Trait>`, with the
 * vtable passed rather than looked up. The concrete Val is gone, which is what lets values of
 * different types share an array.
 *
 * The trait's fields read straight off it, so a box goes anywhere the trait does: a function
 * taking `Impl<Greetable>` accepts one.
 *
 * Not a Val, and not the value either: it is a proxy, so it has its own identity. It has no
 * `equals` and no `patch`, and a payload cannot hold one.
 */
export type Dyn<Tr extends AnyTrait> = Impl<Tr> & Bound<MembersOf<Tr>>;

/**
 * Where a companion records every member `implTrait` registered. Read by
 * {@link TraitCompanion.dyn}.
 *
 * One flat record, because no two traits on a Val may register the same name. A box therefore
 * binds every member the Val implements, and the ones outside this trait are invisible through
 * {@link Dyn}.
 */
export type TraitHost = { readonly [Traits]: Members };

/**
 * What the trait's `.build()` returns: `dyn`, the members declared {@link Final}, and the
 * `.implAssoc` members. A member a Val may replace is not on it. Call such a member through
 * the Val's companion or a {@link Dyn}.
 */
// A trait namespace that could call a default would look like it dispatched, and it cannot: every
// call goes through the Val's companion or a `Dyn`, both of which reach the Val's own version. The
// replaceable members are on the object all the same, since telling them apart at run time would
// take a mark the type erases.
//
// What it publishes takes the trait, not the shape the implementation was written over. A trait is
// a contract between Vals, and an object that merely holds the fields is not one of them.
export type TraitCompanion<
  Tr extends AnyTrait,
  G = Record<never, never>,
  A = Record<never, never>,
> = Duals<Unbound<Pick<MembersOf<Tr>, FinalsOf<Tr> & keyof G>, Impl<Tr>>, Impl<Tr>> &
  Looses<A> & {
    /** Everything the trait implemented, which `implTrait` copies onto the Val. */
    readonly [Shared]: G;
    /**
     * Boxes a value with one Val's implementation. See {@link Dyn}.
     *
     * The two arguments are tied together: the companion has to match the value's own type,
     * which is what keeps another Val's companion out.
     */
    readonly dyn: <W extends Impl<Tr>>(
      companion: TraitHost & Unbound<MembersOf<Tr>, W>,
      value: W,
    ) => Dyn<Tr>;
  };

/**
 * What the trait implements itself: its own members, over the trait.
 *
 * The receiver is `Impl<Tr>` rather than `ShapeOf<Tr>` so that a member can call a {@link Final}
 * sibling through the companion, which publishes one taking `Impl<Tr>`. Contravariance keeps the
 * implementation assignable where `implTrait` binds it to the Val.
 */
export type Shared<Tr extends AnyTrait, G> = {
  readonly [K in keyof G]: K extends keyof MembersOf<Tr>
    ? Unbound<MembersOf<Tr>, Impl<Tr>>[K]
    : "a trait's own implementation must be one of its members";
};

/**
 * What the function passed to `implTrait` returns: the members the trait left open, and any
 * override of the ones it implemented.
 *
 * A {@link Final} member is declared `never` rather than left out. Left out, it is only the
 * excess property check that rejects one, and that check reads a fresh object literal alone: a
 * payload taken from an existing value would carry the override straight through.
 */
export type Implement<Tr extends AnyTrait, G, V> = Unbound<Omit<MembersOf<Tr>, keyof G>, V> &
  Partial<Unbound<Pick<MembersOf<Tr>, Exclude<keyof G, FinalsOf<Tr>> & keyof MembersOf<Tr>>, V>> &
  Partial<Record<FinalsOf<Tr>, never>>;

/**
 * What `Trait.companion` returns, which `impl` adds to and `.build()` closes.
 */
// Interfaces rather than `{ … } & (Open extends true ? { impl } : unknown)`. After `impl` is
// called, that intersection reduces to its first member and loses the alias name, so the emitted
// declaration of an inferred builder repeats the builder in full, nested once per `implAssoc`.
export type TraitBuilder<
  Tr extends AnyTrait,
  G = Record<never, never>,
  Open = true,
  A = Record<never, never>,
> = Open extends true ? TraitImplStep<Tr, G, A> : TraitSteps<Tr, G, A, Open>;

/** The steps a {@link TraitBuilder} has in every state. */
export interface TraitSteps<Tr extends AnyTrait, G, A, Open> {
  readonly dyn: CallBuildFirst;
  /**
   * Closes the chain and returns the companion. The builder holds the steps alone: `dyn` and the
   * members are the companion's.
   */
  build: () => TraitCompanion<Tr, G, A>;
  /**
   * Collects members that do not take the trait first, such as one over boxes:
   * `total: (shapes: readonly Dyn<Sized>[]) => …`. Write it any number of times. The function
   * receives nothing.
   *
   * `implTrait` does not copy them onto a Val. A member reaching the companion references it and
   * annotates its return type. A member taking more than one argument can be called with its first
   * argument first, or last. None can have an optional, a default or a rest parameter.
   */
  implAssoc: <M extends TraitAssoc<Tr>>(
    fns: () => Grown<keyof A, M> & LooseArity<M> & ThisType<undefined>,
  ) => TraitBuilder<Tr, G, Open, A & M>;
}

/** A {@link TraitBuilder} before `impl`. */
export interface TraitImplStep<Tr extends AnyTrait, G, A> extends TraitSteps<Tr, G, A, true> {
  /**
   * Implements over the trait the members the function returns. The declaration says which
   * side of the contract implements a member: a Val may replace an ordinary member through
   * `implTrait`, and may not replace one declared {@link Final}.
   *
   * It takes one call. A member calling a {@link Final} sibling references the companion and
   * annotates its return type: referencing it inside its own initializer is a circularity
   * TypeScript reports as TS7023, and the annotation cuts it. A member a Val may replace is
   * not on the companion; see {@link TraitCompanion}.
   *
   * A member taking more than one argument can be called with the value first or last. None can
   * have an optional, a default or a rest parameter.
   *
   * See {@link https://jo16oh.github.io/valof/latest/adding-functions.html#call-a-member-with-the-value-last | Call a member with the value last}.
   */
  impl: <H extends Shared<Tr, H>>(
    fns: () => H & Arity<H> & ThisType<undefined>,
  ) => TraitBuilder<Tr, G & H, false, A>;
}

/** What `.implAssoc` accepts: anything but a member's name, `dyn` and a name the library reserves. */
type TraitAssoc<Tr extends AnyTrait> = AssocMembers &
  Partial<Record<"dyn" | keyof MembersOf<Tr>, never>>;

type AnyFn = (...args: never[]) => unknown;

const make = (impls: Record<string, unknown>): Record<string, unknown> => ({
  // Spread whole rather than the finals alone: the mark saying which those are is a type, gone by
  // now. Only the finals are named on the type, so the rest are unreachable without a cast.
  ...createMembers(impls),
  [Shared]: impls,
  // A proxy rather than a built object: a member is bound when it is called, and everything
  // else is the value's own. Nothing is copied, so the box costs one allocation whatever the
  // trait holds.
  //
  // A primitive cannot be a proxy's target, so an empty object is used as the target. Nothing is
  // lost: a trait a primitive Val can declare has no fields to read.
  dyn: (companion: TraitHost, value: unknown) =>
    new Proxy(isObject(value) ? value : {}, {
      get(_, key) {
        const member = (companion[Traits] as unknown as Record<string, AnyFn>)[key as string];
        return member
          ? (...args: never[]) => member(value as never, ...args)
          : (value as Record<string, unknown>)[key as string];
      },
    }),
});

/**
 * Declares a trait's runtime side: what every Val implementing it shares.
 */
export const companion = <Tr extends AnyTrait>(): TraitBuilder<Tr> => builder() as never;

type Step = () => Record<string, unknown>;

/** One builder state: the `impl` function and the `implAssoc` ones registered so far. */
const builder = (impl?: Step, assoc: Step[] = []): object => ({
  impl: (fns: Step) => builder(fns, assoc),
  implAssoc: (fns: Step) => builder(impl, [...assoc, fns]),
  build: () => ({ ...make(impl?.() ?? {}), ...associated(assoc, {}) }),
});
