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
 * Makes each function a {@link Dual}, and leaves every other member as it is. One taking one
 * argument or none has no second form, so it is bound to `undefined` rather than wrapped. `this`
 * is then `undefined`, as in a wrapped member. `loose` marks members that do not take the value.
 * Such a member may take no argument.
 *
 * Development throws on a member whose source shows a default or a rest parameter. A type
 * annotation can hide one from {@link Arity}, and `length` stops counting at it, so a data-last
 * call would run data-first.
 */
export function createMembers(
  members: Record<string, unknown>,
  loose?: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(members)) {
    const f = members[key];
    if (development && typeof f == "function") {
      if (hidesParameter(f)) {
        throw new TypeError(
          "A member cannot have a default or a rest parameter, because the argument count tells data-last from data-first.",
        );
      }
      if (!loose && !f.length) {
        throw new TypeError("A member must have the value as its first parameter.");
      }
    }
    out[key] = typeof f != "function" ? f : f.length > 1 ? dual(f as AnyFn) : f.bind(undefined);
  }
  return out;
}

/**
 * Wraps `f`. Called with one argument fewer than `f` declares, the wrapper returns a function that
 * takes the value. Any other count calls `f` directly, so `xs.map(User.rename)` still passes the
 * element first.
 */
export function dual(f: (...args: never[]) => unknown): AnyFn {
  const n = f.length;
  return (...args) =>
    args.length === n - 1 ? (self: unknown) => (f as AnyFn)(self, ...args) : (f as AnyFn)(...args);
}

type AnyFn = (...args: unknown[]) => unknown;

/**
 * Whether the parameter list in `f`'s source has `=` or `...` at its top level. One inside a
 * destructured parameter does not shorten `length`, so it is allowed. The list starts at the first `(`
 * outside brackets, so a computed method key is skipped. An arrow reached first means a bare `x =>`. Strings
 * and comments are read as whole tokens. A bound or native function's source shows no parameter.
 */
function hidesParameter(f: object): boolean {
  let depth = 0;
  let list = false;
  for (const [token] of Function.prototype.toString
    .call(f)
    .matchAll(/\/\/.*|\/\*[\s\S]*?\*\/|(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1|=>|\.\.\.|\S/g)) {
    if (list && depth == 1 && (token == "=" || token == "...")) return true;
    if (token == "(" || token == "[" || token == "{") {
      if (!depth++ && token == "(") list = true;
    } else if (token == ")" || token == "]" || token == "}") {
      if (!--depth && list) return false;
    } else if (!depth && token == "=>") return false;
  }
  return false;
}
