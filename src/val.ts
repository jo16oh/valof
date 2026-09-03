/**
 * valof — values are plain data; behaviour lives outside them.
 *
 * Brands are phantom types and do not exist at runtime. Values therefore survive
 * `structuredClone` and round-trip symmetrically through JSON.
 *
 * Constructors deep-copy their argument, so a caller who keeps a mutable reference
 * to the input cannot mutate the value afterwards (design §4.1).
 *
 * This is the whole library. `./index.ts` is the entry point and names the subset of
 * it that is public; anything exported here but missing there is internal.
 */

/** Primitives allowed as values. `undefined` is deliberately excluded (design §3.5). */
type Primitive = string | number | boolean | bigint | null;

/**
 * Any Val.
 *
 * The brand keys are phantom: nothing ever writes them, so they do not exist at
 * runtime and never reach `Object.keys` or `JSON.stringify`. They are string keys
 * rather than `unique symbol`s so that a declaration emitted by a downstream package
 * can name them — a symbol would have to be in scope in the emitting file, which
 * fails with TS4023 for anyone re-exporting a companion (design §2.1). The names are
 * deliberately verbose to keep them from colliding with a real payload property, and
 * say `phantom` so that anyone who meets one in a hover or an error message knows not
 * to look for it at runtime.
 */
export type AnyVal = { readonly __valof_internal_phantom_brand: string };

/** Marker surfaced in the type when a payload violates the allowed-type rules. */
type Invalid<Msg extends string> = { readonly __valError: Msg };

// ---------------------------------------------------------------------------
// Allowed-type validation (design §3)
// ---------------------------------------------------------------------------

/** Extracts only the optional keys. `-?` keeps `undefined` out of the mapped value type. */
type OptionalKeys<T> = {
  [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? K : never;
}[keyof T];

/**
 * Allowed-type check. Applied once from `Val<K, T>`, not per call site.
 * Offending positions are replaced by `Invalid<Msg>`, so the message shows up
 * directly in the resulting type.
 */
type Validate<T> = [T] extends [AnyVal]
  ? T
  : [T] extends [Primitive]
    ? T
    : [T] extends [ReadonlyArray<infer E>]
      ? ReadonlyArray<Validate<E>>
      : // oxlint-disable-next-line no-unsafe-function-type
        [T] extends [Function]
        ? Invalid<"functions are not allowed">
        : [T] extends [object]
          ? {
              [K in keyof T]: K extends OptionalKeys<T>
                ? Validate<Exclude<T[K], undefined>> | undefined
                : undefined extends T[K]
                  ? Invalid<"required property cannot be undefined; use null or make it optional">
                  : Validate<T[K]>;
            }
          : Invalid<"not a plain value">;

// ---------------------------------------------------------------------------
// DeepReadonly (design §4)
// ---------------------------------------------------------------------------

/**
 * Because nesting goes through Vals, the recursion stops as soon as it hits one.
 */
type DeepReadonly<T> = [T] extends [AnyVal]
  ? T
  : [T] extends [Primitive]
    ? T
    : [T] extends [ReadonlyArray<infer E>]
      ? ReadonlyArray<DeepReadonly<E>>
      : [T] extends [object]
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

// ---------------------------------------------------------------------------
// Val (design §2)
// ---------------------------------------------------------------------------

/**
 * A branded value type.
 *
 * ```ts
 * export type User = Val<"app/User", { id: string; name: string }>;
 * ```
 *
 * The brand keys are phantom string keys (see {@link AnyVal}); the discriminant is a
 * string literal. Two Vals only collide when they share the same string, so
 * namespacing the key as `"app/User"` is the recommended convention.
 *
 * When `T` violates the allowed types, this resolves to `Validate<T>` — which
 * contains `Invalid<...>` and therefore does not satisfy `AnyVal`. Passing it to
 * `Val.of` / `Val.companion` then fails with the reason embedded in the message.
 *
 * (Design §3.5 specifies the self-referential constraint `T extends Validate<T>`,
 * but on a type alias that is TS2313 "circular constraint", so the same check is
 * performed with a conditional type instead.)
 */
export type Val<K extends string, T> = [T] extends [Validate<T>]
  ? DeepReadonly<T> & {
      readonly __valof_internal_phantom_brand: K;
      /** Phantom. Exists only so the original payload type can be recovered. */
      readonly __valof_internal_phantom_payload: T;
    }
  : Validate<T>;

/** The Val's brand string. */
export type BrandOf<V extends AnyVal> = V["__valof_internal_phantom_brand"];

/** The Val's raw payload type. */
export type PayloadOf<V extends AnyVal> = V extends {
  readonly __valof_internal_phantom_payload: infer T;
}
  ? T
  : never;

/**
 * What a value can be grown from: the payload as constructors, `Val.of` and a custom
 * seal accept it.
 *
 * Deep-readonly, and that is about what it *accepts*, not about enforcing anything —
 * ownership is already handled by the deep copy every constructor makes (design §4.1).
 * Property `readonly` does not affect assignability and `T[]` is assignable to
 * `readonly T[]`, so a readonly parameter takes strictly more callers than a mutable
 * one. That matters because a Val is itself deep-readonly: without it, deriving a new
 * value from an existing one — or from an `as const` literal, or from anything else
 * already readonly — would not type-check against `PayloadOf<V>`.
 */
export type SeedOf<V extends AnyVal> = DeepReadonly<PayloadOf<V>>;

// ---------------------------------------------------------------------------
// patch (design §6.2)
// ---------------------------------------------------------------------------

/**
 * The patch accepted by `with`.
 *
 * - omit the key → leave it unchanged
 * - `{ k: undefined }` → delete it (only optional keys allow this at the type level)
 * - `{ k: value }` → set it
 */
export type Patch<T> = T extends object
  ? T extends ReadonlyArray<unknown>
    ? never
    : { [K in Exclude<keyof T, OptionalKeys<T>>]?: T[K] } & {
        [K in OptionalKeys<T>]?: T[K] | undefined;
      }
  : never;

// ---------------------------------------------------------------------------
// sealer and companion (design §2 / §5 / §6)
// ---------------------------------------------------------------------------

type AnyFn = (...args: never[]) => unknown;

/** What a companion may hold besides methods: constants, lookup tables, and so on. */
type NonMethod = Primitive | undefined | readonly unknown[] | Record<string, unknown>;

/**
 * The methods a companion accepts. Every one of them takes its Val first.
 *
 * That is what lets the parameter go unannotated — `greet(u)` rather than
 * `greet(u: User)`. The index signature is a *single* function type, which is the
 * only shape TypeScript will use as a contextual type; a union or an F-bounded
 * mapped constraint both type-check but leave the parameter implicitly `any`
 * (design §6.5).
 *
 * Constructors are the one thing that cannot live here, since their first parameter
 * is a payload or an argument list rather than the Val. They go to `.implSeal` and
 * `.implCreate`.
 */
type CompanionMethods<V extends AnyVal, F = undefined> = {
  /**
   * Overrides the default deep equals. Applies to top-level comparisons only (design §5).
   *
   * `deepEquals` is that default, bound for you, so an override can fall back to it:
   *
   * ```ts
   * equals: (a, b, deepEquals) => a.id === b.id || deepEquals(a, b),
   * ```
   *
   * It is the structural comparison, not "the equals you are overriding", so it does
   * not recurse into a nested Val's own `equals` either (design §5). Handing it over
   * here rather than exporting it keeps the fallback where it is meaningful: a free
   * function would be a silent way past any type's `equals`.
   *
   * Callers never pass it — `YourVal.equals` stays `(a, b) => boolean`.
   */
  equals?: (a: V, b: V, deepEquals: (a: V, b: V) => boolean) => boolean;
  /**
   * Rejected here so they cannot be mistaken for registrations. A `seal` whose first
   * parameter happens to accept the Val — common for primitive payloads — would
   * otherwise satisfy the index signature and be attached as an ordinary method,
   * silently leaving `with` / `update` unrouted and, for `create`, minting values that
   * never went through the seal. Use `.implSeal` / `.implCreate` instead.
   */
  seal?: never;
  create?: never;
  /**
   * Overrides the default `with` / `update`, in the type as well as at runtime.
   *
   * The seal is handed over as the last parameter, the way `equals` receives the deep
   * comparison: a hand-written rebuild is the one place that could step around the type's
   * own seal, and the companion is still being initialised, so `YourVal.seal` cannot be
   * referenced from inside `.impl` (design §6.6).
   *
   * ```ts
   * with(u, patch: Patch<Fields>, seal) {
   *   return seal({ ...u, ...patch });
   * },
   * ```
   *
   * Callers never pass it: the published signature drops the trailing parameter. Writing
   * the two-parameter form is still fine — nothing forces you to take the seal.
   */
  // oxlint-disable-next-line no-explicit-any -- the patch is yours to choose; `never` would not fit the index signature
  with?: (value: V, patch: any, seal: (value: SeedOf<V>) => Constructed<V, F>) => unknown;
  /** Same as `with`, for the function-shaped update. */
  // oxlint-disable-next-line no-explicit-any -- same as `with`
  update?: (value: V, fn: any, seal: (value: SeedOf<V>) => Constructed<V, F>) => unknown;
  // oxlint-disable-next-line no-explicit-any -- `never[]` would type unannotated extra parameters as `never`
  [key: string]: ((value: V, ...rest: any[]) => unknown) | NonMethod;
};
/**
 * What the seal produces, propagated verbatim. The library stays ignorant of
 * `Result` and friends: it only ever infers this type and passes it along.
 */
type Constructed<V extends AnyVal, F> = F extends (...args: never[]) => infer R ? R : V;

/**
 * What a custom seal must be: a function that takes a whole payload and closes it into
 * a value. Enforced at registration, so a constructor that cannot seal a payload fails
 * where it is written rather than at the `with` that later needs it (design §6.7).
 *
 * The parameter is deep-readonly, which is about what it *accepts* — a caller's mutable
 * object goes straight in. Ownership is taken at the other end, by the lift the seal
 * returns through, so a seal never needs a copy of its argument to work from; normalising
 * means deriving (`toSorted`, spread), not writing (design §6.8).
 *
 * The default seal — brand and copy, which is `Val.of` bound to this type — comes in as a
 * second parameter, the way `equals` receives the deep comparison:
 *
 * ```ts
 * .implSeal((n, seal) => (n >= 0 ? ok(seal(n)) : err("negative")))
 * ```
 *
 * It is optional to take: a one-parameter seal is registered unchanged, and `Val.of` does
 * the same job with the type argument spelled out.
 */
type SealImpl<V extends AnyVal> = (value: SeedOf<V>, seal: (value: SeedOf<V>) => V) => unknown;

/**
 * What `create` must be: any arguments at all, a payload out. The payload it returns is
 * not a value yet — the type's seal closes it (design §6.7), which is what keeps `create`
 * from being a way past the seal.
 */
type Minter<V extends AnyVal> = (...args: never[]) => SeedOf<V>;

/** The public face of `create`: its own arguments, and whatever the seal returns. */
type Minting<V extends AnyVal, N, F> = N extends (...args: infer A) => unknown
  ? (...args: A) => Constructed<V, F>
  : undefined;

/** `{ [K]: T }`, or nothing at all when there is no `T`. */
type Slot<K extends string, T> = [T] extends [undefined] ? Record<never, never> : { [P in K]: T };

/**
 * How `with` and `update` rebuild a value: by sealing the new payload, since the seal is
 * the only way a payload becomes a value. With a custom one they propagate whatever it
 * returns; without one the default seal is the copy, so they hand back the Val itself.
 */
type Rebuild<V extends AnyVal, F, Arg> = (value: V, arg: Arg) => Constructed<V, F>;

/**
 * Drops the trailing seal parameter from an override, so callers see the two-parameter
 * method they actually call. An override written without it is published unchanged — a
 * two-element parameter list does not match the three-element pattern.
 */
type WithoutSeal<T> = T extends (...args: infer A) => infer R
  ? A extends [infer Value, infer Arg, unknown]
    ? (value: Value, arg: Arg) => R
    : T
  : T;

/**
 * Drops the trailing default-seal parameter from a registered seal, for the same reason
 * {@link WithoutSeal} does on an override: callers pass the payload and nothing else. A
 * seal written with one parameter is published unchanged.
 */
type WithoutDefaultSeal<F> = F extends (...args: infer A) => infer R
  ? A extends [infer Value, unknown]
    ? (value: Value) => R
    : F
  : F;

/** The payload minus the keys `.unpatchable` took out of the update path (design §6.10). */
type Patchable<V extends AnyVal, P> = [P] extends [never]
  ? SeedOf<V>
  : Omit<SeedOf<V>, P & keyof SeedOf<V>>;

/**
 * `T`, with every key it has beyond `S`'s mapped to `never`.
 *
 * Narrowing `update`'s callback to a return type is not enough: excess-property checking
 * only fires when an object literal meets its target directly, and an un-annotated arrow
 * body is inferred first, so `(v) => ({ ...v, id: "forged" })` slips through. Making the
 * extra key structurally uninhabitable catches it instead (design §6.10).
 */
type NoExtra<T, S> = T & Record<Exclude<keyof T, keyof S>, never>;

/**
 * `with` exists only when there is something to patch. `Patch` is `never` for
 * primitives and arrays, so for those the method is left out of the type entirely
 * rather than being offered with an uninhabitable argument (design §6.2).
 *
 * A `with` supplied in `.impl` wins, the way `equals` does. That is the escape hatch
 * for everything the default cannot express (design §6.6).
 */
type WithMethod<V extends AnyVal, M, F, P> = "with" extends keyof M
  ? { with: WithoutSeal<M["with"]> }
  : Slot<
      "with",
      [Patch<Patchable<V, P>>] extends [never] ? undefined : Rebuild<V, F, Patch<Patchable<V, P>>>
    >;

/**
 * Same as {@link WithMethod}: yours if you wrote one, the rebuilt default otherwise.
 *
 * With keys taken out of the patch path, the callback returns only what is left and the
 * default merges it onto the value, so the untouched keys survive without the library
 * knowing their names (design §6.10).
 */
type UpdateMethod<V extends AnyVal, M, F, P> = "update" extends keyof M
  ? { update: WithoutSeal<M["update"]> }
  : Slot<
      "update",
      [P] extends [never]
        ? Rebuild<V, F, (value: V) => SeedOf<V>>
        : <T extends Patchable<V, P>>(
            value: V,
            fn: (value: V) => NoExtra<T, Patchable<V, P>>,
          ) => Constructed<V, F>
    >;

/**
 * A type's behaviour, and nothing else. Notably not callable: a constructor comes
 * from `Val.sealer`, so a companion built without one cannot be used to build values.
 */
export type Companion<
  V extends AnyVal,
  M extends CompanionMethods<V, F>,
  N = undefined,
  F = undefined,
  P = never,
> = Omit<M, "equals" | "with" | "update"> &
  Slot<"create", Minting<V, N, F>> &
  Slot<"seal", WithoutDefaultSeal<F>> &
  WithMethod<V, M, F, P> &
  UpdateMethod<V, M, F, P> & {
    /** Structural equality: key-order independent, ignoring `undefined`-valued keys (design §5). */
    equals: (a: V, b: V) => boolean;
  };

/** A companion that kept the constructor it was built from. */
export type Sealed<V extends AnyVal, M extends CompanionMethods<V>> = ((value: SeedOf<V>) => V) &
  Companion<V, M>;

/**
 * A constructor for `V`, which can grow methods without ceasing to be one.
 *
 * Callability is provenance, not a rule: a sealer is a constructor, so anything
 * built from one stays callable, and a companion built without one never was.
 *
 * A sealer already carries the default behaviour, so a Val with no methods of its
 * own needs nothing further. There is no `.implSeal` here on purpose: a sealer *is*
 * the default seal, and a second, checked one beside it would be a hole straight past
 * the first (design §6.1).
 */
export type Sealer<V extends AnyVal> = Sealed<V, Record<never, never>> & {
  impl: {
    (): Sealed<V, Record<never, never>>;
    <M extends CompanionMethods<V>>(methods: M): Sealed<V, M>;
  };
};

/**
 * What `Val.companion` returns: a companion with no methods yet, and no constructor
 * — the mirror of {@link Sealer}, differing only in that nothing was ever callable.
 *
 * The two registration steps are deliberately separate (design §6.7):
 *
 * - `implSeal` replaces the seal — the single gate a payload passes to become a value.
 *   Checking, normalising and wrapping in a `Result` are all things a seal may do.
 *   `with` / `update` go through it, because re-deriving a value means sealing again.
 * - `implCreate` is free-form — generated ids, wire formats, several arguments — but it
 *   only ever builds a *payload*. What it returns is sealed like anything else, so it is
 *   not a way past the seal.
 *
 * They compose: `create` mints the payload, the seal closes it, and `with` re-seals an
 * existing value without ever re-running `create`.
 *
 * A seal must be idempotent — sealing a value's own payload has to give that value back.
 * Minting belongs in `create` for that reason; the type system cannot check it
 * (design §6.7).
 */
export type CompanionBuilder<V extends AnyVal, N = undefined, F = undefined, P = never> = Companion<
  V,
  Record<never, never>,
  N,
  F,
  P
> & {
  impl: {
    (): Companion<V, Record<never, never>, N, F, P>;
    <M extends CompanionMethods<V, F>>(methods: M): Companion<V, M, N, F, P>;
  };
  /** Registers the payload-minting constructor as `create`. Any arguments, a payload out. */
  implCreate: <G extends Minter<V>>(create: G) => CompanionBuilder<V, G, F, P>;
  /** Replaces the seal. `create`, `with` and `update` all go through it. */
  implSeal: <G extends SealImpl<V>>(seal: G) => CompanionBuilder<V, N, G, P>;
  /**
   * Takes keys out of the update path: `with` stops accepting them in its patch, and
   * `update`'s callback returns only what is left, with the rest merged back on.
   *
   * For what a `create` mints and nothing afterwards may change — an id, a `createdAt`,
   * a version counter:
   *
   * ```ts
   * Val.companion<User>()
   *   .implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f }))
   *   .implSeal(seal)
   *   .unpatchable<"id">();
   * ```
   *
   * The keys are a type argument: they never exist at runtime, so this is a guarantee
   * about the update path, not about the value. `Val.of` can still forge one, exactly as
   * it can forge anything else (design §6.10).
   */
  unpatchable: <K extends keyof SeedOf<V> & string>() => CompanionBuilder<V, N, F, P | K>;
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const isPlainRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Structural deep comparison. Every companion carries it as the default `equals`.
 *
 * - independent of key order
 * - ignores keys whose value is `undefined` (`{ a: undefined }` equals `{}`)
 * - `NaN` equals `NaN`, and `-0` equals `0`
 *
 * Deliberately absent from `./index.ts`. As a free function it is the `Val.equals`
 * design §5 rules out: it cannot dispatch to a type's own `equals`, so calling it on
 * two Vals would silently bypass a custom one, and its `unknown` parameters would not
 * even object to comparing two different types. Reach for `YourVal.equals` instead —
 * it is this function unless the type overrode it, and an override is handed it as a
 * third argument (see {@link CompanionMethods}).
 */
export function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Treat NaN as equal. `-0` and `0` are already equal via `===`, which matches JSON
  // round-tripping (`JSON.stringify(-0)` is `"0"`).
  if (typeof a === "number" && typeof b === "number") {
    return Number.isNaN(a) && Number.isNaN(b);
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;

  if (aIsArray) {
    const x = a as readonly unknown[];
    const y = b as readonly unknown[];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) {
      if (!deepEquals(x[i], y[i])) return false;
    }
    return true;
  }

  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const xKeys = Object.keys(x).filter((k) => x[k] !== undefined);
  const yKeys = Object.keys(y).filter((k) => y[k] !== undefined);
  if (xKeys.length !== yKeys.length) return false;

  for (const k of xKeys) {
    if (!Object.hasOwn(y, k)) return false;
    if (!deepEquals(x[k], y[k])) return false;
  }
  return true;
}

/**
 * Deep-copies a payload.
 *
 * Constructors take ownership of their argument. `DeepReadonly` is erased at
 * runtime, so without this a caller holding a mutable reference to the input could
 * mutate the value after the fact (design §4.1).
 *
 * Payloads are primitives, arrays, plain objects and nested Vals — themselves
 * plain data — so the recursion needs no special cases. The result is deliberately
 * not frozen (design §7.7).
 */
function copy<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return (value as unknown[]).map((element) => copy(element)) as T;
  }

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source)) out[key] = copy(source[key]);
  return out as T;
}

/**
 * Lifts a raw value into a Val. Use it inside custom constructors to avoid `as`
 * casts; it deep-copies, so the constructor owns the result.
 */
function of<V extends AnyVal>(value: SeedOf<V>): V {
  return copy(value) as unknown as V;
}

/**
 * The other direction: the payload, mutable and detached from the Val.
 *
 * A Val is deep-readonly, which third-party code does not know about — `readonly T[]`
 * is not a `T[]`, so even `Array.prototype.sort` refuses it (design §4). This hands
 * back a plain, mutable copy to give away.
 *
 * It deep-copies for the same reason constructors do (design §4.1): the brand is
 * phantom, so a Val *is* its payload at runtime, and returning it under a mutable type
 * would let the caller write straight through into the value.
 *
 * Not the way to derive one value from another — `SeedOf<V>` already accepts a Val, so
 * `Val.of` and `with` take one directly and copy once. Going through `unwrap` copies
 * twice.
 */
function unwrap<V extends AnyVal>(value: V): PayloadOf<V> {
  return copy(value) as unknown as PayloadOf<V>;
}

/** `Object.assign` onto a function throws on `name` / `length`, so define properties instead. */
function define(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/** The constructors a companion was given, plus whether `.unpatchable` was called. */
type Ctors = {
  create?: AnyFn;
  seal?: (value: unknown, seal: (value: unknown) => unknown) => unknown;
  unpatchable?: boolean;
};

/**
 * Attaches the default behaviour plus the user's methods to `target`.
 *
 * Everything that produces a value goes through one function, `seal`: the registered one,
 * or a copy when the type did not replace it. Nothing copies on the way *in* — the seal's
 * parameter is readonly, so it reads its argument rather than owning it, and the deep copy
 * that takes ownership happens once, in the `Val.of` the seal returns through (design
 * §4.1, §6.8).
 */
function attach(target: object, methods: Record<string, unknown>, ctors: Ctors = {}): void {
  const { create } = ctors;
  // A custom seal is handed the default one — brand and copy — so it does not have to
  // name its own type through `Val.of` (design §6.8).
  const custom = ctors.seal;
  const seal: (value: unknown) => unknown = custom ? (value) => custom(value, copy) : copy;

  define(target, "equals", deepEquals);
  if (create) define(target, "create", (...args: never[]) => seal(create(...args)));
  if (custom) define(target, "seal", seal);

  define(target, "with", (value: unknown, patch: Record<string, unknown>) => {
    if (!isPlainRecord(value)) {
      throw new TypeError("`with` is only available for object-shaped Vals.");
    }
    const merged: Record<string, unknown> = { ...value, ...patch };
    for (const key of Object.keys(merged)) {
      if (merged[key] === undefined) delete merged[key];
    }
    return seal(merged);
  });

  // With keys out of the patch path the callback returns only what is left, so its result
  // is merged onto the value; the keys it may not touch survive without being named here.
  define(target, "update", (value: unknown, fn: (value: unknown) => unknown) =>
    seal(
      ctors.unpatchable && isPlainRecord(value)
        ? { ...value, ...(fn(value) as Record<string, unknown>) }
        : fn(value),
    ),
  );

  for (const key of Object.keys(methods)) {
    // A custom `equals` is handed the structural default as a third argument, so an
    // override can fall back to it without that function being exported. Callers still
    // pass two, which is why the companion type keeps `equals` at `(a, b) => boolean`.
    if (key === "equals" && typeof methods[key] === "function") {
      const custom = methods[key] as (a: unknown, b: unknown, deep: typeof deepEquals) => boolean;
      define(target, key, (a: unknown, b: unknown) => custom(a, b, deepEquals));
      continue;
    }
    // Same idea for a hand-written rebuild: it is handed the seal, since it cannot reach
    // the companion it is being defined on, and `Val.of` in its place would step around
    // the type's own seal (design §6.6).
    if ((key === "with" || key === "update") && typeof methods[key] === "function") {
      const custom = methods[key] as (value: unknown, arg: unknown, seal: unknown) => unknown;
      define(target, key, (value: unknown, arg: unknown) => custom(value, arg, seal));
      continue;
    }
    define(target, key, methods[key]);
  }
}

/**
 * Creates the constructor for a Val.
 *
 * ```ts
 * export const Tags = Val.sealer<Tags>();
 *
 * export const User = Val.sealer<User>().impl({
 *   greet(u) {
 *     console.log(`Hi, I'm ${u.name}.`);
 *   },
 * });
 * ```
 *
 * Reach for {@link Val.companion} instead when the type has a smart constructor:
 * it is the same shape, but nothing it produces is callable, so the plain
 * constructor is not merely disabled — it is never created.
 *
 * TypeScript cannot infer type arguments partially, which is why `V` is pinned by
 * a type argument here and the methods are inferred by `.impl()`.
 *
 * `.impl` is overloaded rather than giving `M` a default: a defaulted type parameter
 * makes TypeScript stop using the constraint as a contextual type, and every method's
 * first parameter silently falls back to implicit `any` (design §6.5).
 */
function sealer<V extends AnyVal>(): Sealer<V> {
  const seal = (value: SeedOf<V>): V => copy(value) as unknown as V;
  attach(seal, {});

  define(
    seal,
    "impl",
    <M extends CompanionMethods<V> = Record<never, never>>(methods: M = {} as M): Sealed<V, M> => {
      const sealed = (value: SeedOf<V>): V => copy(value) as unknown as V;
      attach(sealed, methods);
      return sealed as unknown as Sealed<V, M>;
    },
  );

  return seal as unknown as Sealer<V>;
}

/**
 * Bundles a type's behaviour without a constructor.
 *
 * ```ts
 * export const Age = Val.companion<Age>()
 *   .implSeal((n: number): Result<Age> => …)
 *   .impl({
 *     next(a) { … }, // `a` is contextually an Age
 *   });
 * ```
 *
 * `implSeal` takes the payload; anything else — a generated id, a wire format, several
 * arguments — is `implCreate`, which builds a payload for the seal to close (design §6.7):
 *
 * ```ts
 * export const User = Val.companion<User>()
 *   .implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f }))
 *   .implSeal((u: SeedOf<User>) => check(u));
 * ```
 *
 * Use `Val.of` inside the seal to lift the checked payload. Since no constructor is ever
 * produced, and `create` hands its payload to the seal, there is nothing that reaches a
 * value without passing it.
 *
 * Constructors are registered by their own steps rather than sitting in `.impl`,
 * because `.impl` fixes every method's first parameter to the Val and a constructor's
 * does not fit that shape (design §6.5).
 */
function companion<V extends AnyVal>(): CompanionBuilder<V> {
  return build<V>({}) as CompanionBuilder<V>;
}

/** One builder state: the constructors registered so far, plus the steps still open. */
function build<V extends AnyVal>(ctors: Ctors): object {
  const target = {};
  attach(target, {}, ctors);

  define(target, "impl", (methods: Record<string, unknown> = {}) => {
    const built = {};
    attach(built, methods, ctors);
    return built;
  });

  define(target, "implCreate", (create: AnyFn) => build<V>({ ...ctors, create }));

  define(target, "implSeal", (seal: NonNullable<Ctors["seal"]>) => build<V>({ ...ctors, seal }));

  define(target, "unpatchable", () => build<V>({ ...ctors, unpatchable: true }));

  return target;
}

/**
 * The namespace sharing its name with the `Val` type.
 *
 * - `Val.of` — lifts a raw value into a Val, copying it (design §2.2, §4.1)
 * - `Val.unwrap` — the reverse of `of`: a mutable copy of the payload
 * - `Val.sealer` — a constructor, and `.impl()` to attach behaviour to it
 * - `Val.companion` — the same, minus the constructor
 *
 * There are deliberately no free-function `Val.equals` / `Val.with`. The brand is
 * phantom, so the type cannot be recovered from a value at runtime and there is
 * nothing to dispatch per-type behaviour on (design §5, §6.2).
 */
export const Val = { of, unwrap, sealer, companion } as const;
