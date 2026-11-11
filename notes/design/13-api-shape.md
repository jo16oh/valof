# 13. API shape decisions (during implementation)

A record of the deliberation that settled on `Val.sealer<V>().impl({...})` / `Val.companion<V>().impl({...})`. Each option was actually compiled and checked.

At the time, the smart constructor was named `from` and passed as a key of `.impl`. The text below keeps the spelling of that time. Today it is `seal`, registered with `.implSeal` (§6.9), and writing it in `.impl` is a type error (§6.5).

## 13.1 Why two calls: partial inference of type arguments

The Val type `V` must be explicit (it cannot be inferred from a value), while the methods `M` should be inferred. But **TypeScript does not infer type arguments partially**. Once one is explicit, the rest are not inferred and fall back to their defaults ([microsoft/TypeScript#26242](https://github.com/microsoft/TypeScript/issues/26242), the `_` placeholder proposal, unimplemented since 2018).

So `Val.companion<User>({ ... })` **cannot be written**. Currying is the only option.

## 13.2 Rejected: `M` as the second type argument

```ts
function companion<V extends AnyVal, M extends CompanionMethods<V> = Record<never, never>>(
  methods: M,
): Companion<V, M>;
```

With a default on `M`, it **compiles but breaks silently**. `companion<Age>({ from })` falls back to `M = Record<never, never>`, and

- the user's methods disappear from the companion (`A.greet` does not exist)
- `patch` no longer returns `ReturnType<typeof from>`
- the gate of that time (§6.1) is disabled, and `A(30)` **passes without an error**

Without a default it raises `Expected 2 type arguments, but got 1`, and the caller has to split out a `const` and write `typeof`: `Val.companion<User, typeof methods>(methods)`. That is more verbose than an empty `()`.

## 13.3 Rejected: inferring `V` from a value-level token

```ts
declare const __token: unique symbol;
export type TypeToken<V extends AnyVal> = { readonly [__token]: V };
const TOKEN = {} as TypeToken<never>;
export function type<V extends AnyVal>(): TypeToken<V> {
  return TOKEN as unknown as TypeToken<V>;
}

Val.companion(Val.type<User>(), { greet }); // both V and M are inferred
```

One call infers both, and it actually works. Making `[__token]` optional weakens inference, so it is a non-optional phantom, and the cast stays in one place, inside `type()`.

Rejected on cost versus benefit. The empty `()` goes away, but a public type `TypeToken`, a function `Val.type` and a run-time object are added. Currying is an idiom TypeScript users already know, from zustand's `create<T>()(...)` among others, so it beats adding an unfamiliar concept.

## 13.4 Rejected: inferring `V` from a sealer passed as an argument

This option passes the sealer itself instead of a token. `from` uses the sealer anyway, so it is a real value, and both `V` and `M` can be inferred without another phantom (verified to work).

```ts
const seal = Val.sealer<Age>();
export const Age = Val.companion(seal, { from });
```

Rejected because of **line count**. `Val.of<Age>(n)` does the same lifting, so a private sealer is not really needed. This form forces an extra `const seal = ...` line just to fix `V`. An empty `()` costs less.

## 13.5 Rejected: passing an argument to the first call

The only arguments that fit in the `???` of `Val.companion<V>(???)({ ... })` are **those whose type `V` fully determines**. The first call already has an explicit `V`, so an argument that needs inference of its own runs into exactly the same limit as §13.1.

```ts
declare function companion<V extends AnyVal, R = never>(from: (value: SeedOf<V>) => R): …;

companion<Age>((n: number): Result<Age> => …);
// TS2345: Argument of type '(n: number) => Result<Age>' is not assignable
//         to parameter of type '(value: number) => never'   ← R stays at its default
```

Moving `from` there loses `R`, and with it the type of `Age.from` and the return type of `patch` (breaking §6.3's "the library passes the type through without knowing what is inside the Result"). `from` lives in the second call's object because that call has no explicit type arguments at all, so both `M` and `R` are free to be inferred.

Three-step currying, `Val.companion<Age>()(from)({ ... })`, works, but it is worse than `()()`.

## 13.6 Rejected: a Rust-style builder

**2026-10-23: reversed. Every companion's chain now closes with `.build()` (§6.12, "Close the chain with `.build()`").**
Only one reason for rejection below still holds: the extra length.

```ts
Val.builder<Age>().from(fn).impl({ label }).build();
```

Each step is a separate call, so the return type of `from` is inferred on the spot, and `build(): "from" extends keyof M ? Companion<V, M> : Sealed<V, M>` can express whether the result is callable. It compiled too.

Reasons for rejection:

- Every case gets longer (`Val.sealer<Tags>()` → `Val.builder<Tags>().build()`)
- `.build()` is pure ceremony, and it cannot be skipped. If each step doubled as the companion, `Age.from(30)` would collide with a builder step, so a terminator is needed
- Rust has builders in the first place because it lacks named and optional arguments. In TypeScript, object literals play that role, and `.impl({ from, equals, ...fns })` **already is a TypeScript-style builder**

## 13.7 Adopted: `sealer` / `companion` + `.impl()`

**2026-10-21: `sealer` was removed, leaving only `companion` (§6.12).** The argument-less `.impl()` was removed too. `Val.companion<V>()` is the companion as is. **2026-10-23: it now closes with `.build()` (§13.6).**

- **`sealer`**: the `-er` keeps it from being misread as `Val.of`. The name shows that it returns a function, not a value
- **`.impl()`**: originally the means of attaching members was split in two, `.companion()` (on the sealer side) and `()({...})` (on the companion side), and the only difference was whether the result was callable, which was hard to see. Unifying on `.impl()` moved the difference onto **the one axis that means something**: `sealer` or `companion`. `methods` was not adopted because it suggests a class (values do not get methods). `fns` is a tautology, since everything inside is a function. `impl` also matches Rust's `impl` block

A bare `Val.sealer<V>()` / `Val.companion<V>()` is also a complete companion with the default behavior (`equals` / `patch`). A Val with no methods does not have to write `.impl({})`.

## 13.8 Secondary decisions

- **`-0` and `0` are equal.** `JSON.stringify(-0)` is `"0"`, so a round trip erases the difference. This is the same argument as for `undefined` in §3.5, which makes the difference between the two paths unobservable. The implementation is `a === b` with special handling for NaN only
- **This repository's `tsconfig.json` enables `exactOptionalPropertyTypes: true`.** Having strongly recommended it in §3.5, valof follows it itself. The tests that reject `undefined` for a required key do not pass without it
