import { development } from "./env.ts";

/**
 * A member callable two ways: `User.rename(u, "x")`, or `User.rename("x")(u)` with the value
 * passed later. `pipe(u, User.rename("x"))` uses the second. A member taking only the value is
 * left as it is: `pipe(u, User.greet)`.
 *
 * The data-first form goes last, since a member passed as a callback is typed by its last
 * signature. That form is the member's own type, so a generic member stays generic in it. The
 * data-last form loses the type parameters, so call a generic member data-first inside an arrow
 * function: `pipe(u, (v) => User.pick(v, "name"))`.
 */
export type Dual<F, S> = F extends (self: never, ...args: infer A) => infer R
  ? A extends []
    ? F
    : ((...args: A) => (self: S) => R) & F
  : F;

/** {@link Dual} over every member. `S` is passed rather than inferred, so a hover shows `User` rather than its expansion. */
export type Duals<M, S> = { [K in keyof M]: Dual<M[K], S> };

/**
 * {@link Dual} for a member that does not take the value: its first argument moves last instead.
 * One taking one argument or none is left as it is.
 */
export type Loose<F> = F extends (first: infer S, ...args: infer A) => infer R
  ? A extends []
    ? F
    : ((...args: A) => (first: S) => R) & F
  : F;

/** {@link Loose} over every member. */
export type Looses<M> = { [K in keyof M]: Loose<M[K]> };

/**
 * Rejects a member whose call could leave an argument out. The library tells data-last from
 * data-first by the argument count, so a call that leaves an argument out is taken as data-last.
 * Pass `undefined` instead. A parameter typed `T | undefined` is required.
 *
 * Placed on the parameter beside `CompanionMembers`, which has to stay a single function
 * type to give the Val parameter its contextual type.
 */
export type Arity<M> = { [K in keyof M]: Omission<M[K]> };

/** {@link Arity} for a member that does not take the value, which may take no argument at all. */
export type LooseArity<M> = {
  [K in keyof M]: M[K] extends (...args: infer P) => unknown
    ? P extends []
      ? unknown
      : Omission<M[K]>
    : unknown;
};

/** Why {@link Arity} rejects a member, or `unknown` where it does not. */
export type Omission<F> = F extends (...args: infer P) => unknown
  ? P extends []
    ? "a member takes the value as its first parameter"
    : number extends P["length"]
      ? "a member cannot have a rest parameter, because the argument count tells data-last from data-first"
      : // A trailing `T | void` is optional too. One before a required parameter cannot be left out.
        P extends Required<P>
        ? unknown
        : "a member cannot have an optional or default parameter. Pass `undefined` instead"
  : unknown;

/**
 * Makes each function a {@link Dual}, and leaves every other member as it is. See {@link dual}.
 * `wrap` replaces {@link dual}.
 */
export function duals(
  members: Record<string, unknown>,
  wrap: (f: unknown) => unknown = dual,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(members)) out[key] = wrap(members[key]);
  return out;
}

/**
 * Wraps `f`. Called with one argument fewer than `f` declares, the wrapper returns a function that
 * takes the value. Any other count calls `f` directly, so `xs.map(User.greet)` still passes the element first.
 */
export function dual(f: unknown): unknown {
  if (typeof f != "function") return f;
  // A wrapper that spreads its arguments has a `length` of 0, so every data-last call to it would
  // run data-first.
  if (development && !f.length) {
    throw new TypeError(
      "A member must have the value as its first parameter, not inside a rest parameter.",
    );
  }
  const n = f.length;
  return (...args: unknown[]) =>
    args.length === n - 1 ? (self: unknown) => f(self, ...args) : f(...args);
}

/**
 * {@link dual} for a member that does not take the value. One taking no argument is bound to
 * `undefined` rather than wrapped, so `this` is `undefined` as in every other member.
 *
 * A `length` of 0 is also what a rest or default parameter leaves, which would run every
 * first-argument-last call first-argument-first. Development reads the source to tell them apart:
 * an empty parameter list is the only one that declares no parameter. Comments are dropped
 * first, and a source it cannot read, a bound or native function's, reads as empty.
 */
export function loose(f: unknown): unknown {
  if (typeof f != "function" || f.length) return dual(f);
  if (
    development &&
    /^[^(]*\(\s*[^)\s]/.test(
      Function.prototype.toString.call(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ""),
    )
  ) {
    throw new TypeError(
      "A member cannot hide its parameters behind a rest or a default parameter.",
    );
  }
  return f.bind(undefined);
}
