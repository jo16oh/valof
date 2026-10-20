import { development } from "./env.ts";

/**
 * A member callable two ways: `User.rename(u, "x")`, or `User.rename("x")(u)` with the value
 * passed later. `pipe(u, User.rename("x"))` uses the second.
 *
 * The data-first form goes last, since a member passed as a callback is typed by its last
 * signature. That form is the member's own type, so a generic member stays generic in it. The
 * data-last form loses the type parameters, so call a generic member data-first inside an arrow
 * function: `pipe(u, (v) => User.pick(v, "name"))`.
 */
export type Dual<F, S> = F extends (self: never, ...args: infer A) => infer R
  ? ((...args: A) => (self: S) => R) & F
  : F;

/** {@link Dual} over every member. `S` is passed rather than inferred, so a hover shows `User` rather than its expansion. */
export type Duals<M, S> = { [K in keyof M]: Dual<M[K], S> };

/**
 * Rejects a member whose call could leave an argument out. The library tells data-last from
 * data-first by the argument count, so a call that leaves an argument out is taken as data-last.
 * Pass `undefined` instead. A parameter typed `T | undefined` is required.
 *
 * Placed on the parameter beside `CompanionMembers`, which has to stay a single function
 * type to give the Val parameter its contextual type.
 */
export type Arity<M> = { [K in keyof M]: Omission<M[K]> };

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

/** Makes each function a {@link Dual}, and leaves every other member as it is. See {@link dual}. */
export function duals(members: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(members)) out[key] = dual(members[key]);
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
