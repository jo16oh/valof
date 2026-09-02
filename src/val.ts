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

declare const __brand: unique symbol;
declare const __payload: unique symbol;

/** Primitives allowed as values. `undefined` is deliberately excluded (design §3.5). */
export type Primitive = string | number | boolean | bigint | null;

/** Any Val. The brand key is a symbol, so it can never collide with a user property. */
export type AnyVal = { readonly [__brand]: string };

/** Marker surfaced in the type when a payload violates the allowed-type rules. */
export type Invalid<Msg extends string> = { readonly __valError: Msg };

// ---------------------------------------------------------------------------
// Allowed-type validation (design §3)
// ---------------------------------------------------------------------------

/** Extracts only the optional keys. `-?` keeps `undefined` out of the mapped value type. */
export type OptionalKeys<T> = {
  [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? K : never;
}[keyof T];

/**
 * Allowed-type check. Applied once from `Val<K, T>`, not per call site.
 * Offending positions are replaced by `Invalid<Msg>`, so the message shows up
 * directly in the resulting type.
 */
export type Validate<T> = [T] extends [AnyVal]
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
export type DeepReadonly<T> = [T] extends [AnyVal]
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
 * The brand key is a symbol; the discriminant is a string literal. Two Vals only
 * collide when they share the same string, so namespacing the key as `"app/User"`
 * is the recommended convention.
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
      readonly [__brand]: K;
      /** Phantom. Exists only so the original payload type can be recovered. */
      readonly [__payload]: T;
    }
  : Validate<T>;

/** The Val's brand string. */
export type BrandOf<V extends AnyVal> = V[typeof __brand];

/** The Val's raw payload type. */
export type PayloadOf<V extends AnyVal> = V extends { readonly [__payload]: infer T } ? T : never;

/** Input type accepted by constructors and `Val.of`. Mutable values pass through as-is. */
export type Input<V extends AnyVal> = DeepReadonly<PayloadOf<V>>;

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
 * The smart constructor is the one thing that cannot live here, since its first
 * parameter is whatever it parses rather than the Val. It goes to `.implFrom`.
 */
export type CompanionMethods<V extends AnyVal> = {
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
   * Rejected here so it cannot be mistaken for a registration. A `from` whose first
   * parameter happens to accept the Val — common for primitive payloads — would
   * otherwise satisfy the index signature and be attached as an ordinary method,
   * silently leaving `with` / `update` unrouted. Use `.implFrom` instead.
   */
  from?: never;
  // oxlint-disable-next-line no-explicit-any -- `never[]` would type unannotated extra parameters as `never`
  [key: string]: ((value: V, ...rest: any[]) => unknown) | NonMethod;
};
/**
 * What `from` produces, propagated verbatim. The library stays ignorant of
 * `Result` and friends: it only ever infers this type and passes it along.
 */
type Constructed<V extends AnyVal, F> = F extends (...args: never[]) => infer R ? R : V;

/**
 * What `from` must be: a function that takes a whole payload and hands back a value.
 * Enforced at registration, so a constructor that cannot revalidate a payload fails
 * where it is written rather than at the `with` that later needs it (design §6.7).
 */
export type Revalidator<V extends AnyVal> = (value: Input<V>, ...rest: never[]) => unknown;

/** `{ [K]: T }`, or nothing at all when there is no `T`. */
type Slot<K extends string, T> = [T] extends [undefined] ? Record<never, never> : { [P in K]: T };

/**
 * How `with` and `update` rebuild a value.
 *
 * - `from` present → route through it, propagating whatever it returns
 * - neither registered → the value is its own payload, so a copy is the constructor
 * - `create` only → no payload revalidator exists, so there is no default to offer
 *   and the method is left out of the type (design §6.7)
 */
type Rebuild<V extends AnyVal, N, F, Arg> = [F] extends [undefined]
  ? [N] extends [undefined]
    ? (value: V, arg: Arg) => V
    : undefined
  : (value: V, arg: Arg) => Constructed<V, F>;

/**
 * `with` exists only when there is something to patch. `Patch` is `never` for
 * primitives and arrays, so for those the method is left out of the type entirely
 * rather than being offered with an uninhabitable argument (design §6.2).
 *
 * A `with` supplied in `.impl` wins, the way `equals` does. That is the escape hatch
 * for everything the default cannot express (design §6.6).
 */
type WithMethod<V extends AnyVal, M, N, F> = "with" extends keyof M
  ? { with: M["with"] }
  : Slot<"with", [Patch<Input<V>>] extends [never] ? undefined : Rebuild<V, N, F, Patch<Input<V>>>>;

/** Same as {@link WithMethod}: yours if you wrote one, the rebuilt default otherwise. */
type UpdateMethod<V extends AnyVal, M, N, F> = "update" extends keyof M
  ? { update: M["update"] }
  : Slot<"update", Rebuild<V, N, F, (value: V) => Input<V>>>;

/**
 * A type's behaviour, and nothing else. Notably not callable: a constructor comes
 * from `Val.sealer`, so a companion built without one cannot be used to build values.
 */
export type Companion<
  V extends AnyVal,
  M extends CompanionMethods<V>,
  N = undefined,
  F = undefined,
> = Omit<M, "equals" | "with" | "update"> &
  Slot<"create", N> &
  Slot<"from", F> &
  WithMethod<V, M, N, F> &
  UpdateMethod<V, M, N, F> & {
    /** Structural equality: key-order independent, ignoring `undefined`-valued keys (design §5). */
    equals: (a: V, b: V) => boolean;
  };

/** A companion that kept the constructor it was built from. */
export type Sealed<V extends AnyVal, M extends CompanionMethods<V>> = ((value: Input<V>) => V) &
  Companion<V, M>;

/**
 * A constructor for `V`, which can grow methods without ceasing to be one.
 *
 * Callability is provenance, not a rule: a sealer is a constructor, so anything
 * built from one stays callable, and a companion built without one never was.
 *
 * A sealer already carries the default behaviour, so a Val with no methods of its
 * own needs nothing further. There is no `.implFrom` here on purpose: a smart
 * constructor next to a plain one would be a hole straight past it (design §6.1).
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
 * - `implFrom` takes a whole payload and revalidates it. `with` / `update` route
 *   through it, so it is the one the library can build on.
 * - `implCreate` is free-form — generated ids, wire formats, several arguments. It
 *   is not a payload function, so it leaves `with` / `update` with nothing to route
 *   through and they are left out of the type.
 *
 * They compose: `create` mints a value, `from` reconstitutes a stored one, and `with`
 * goes through `from` without ever re-running `create`.
 */
export type CompanionBuilder<V extends AnyVal, N = undefined, F = undefined> = Companion<
  V,
  Record<never, never>,
  N,
  F
> & {
  impl: {
    (): Companion<V, Record<never, never>, N, F>;
    <M extends CompanionMethods<V>>(methods: M): Companion<V, M, N, F>;
  };
  /** Registers the free-form constructor as `create`. Any signature at all. */
  implCreate: <G extends AnyFn>(create: G) => CompanionBuilder<V, G, F>;
  /** Registers the payload revalidator as `from`. `with` / `update` route through it. */
  implFrom: <G extends Revalidator<V>>(from: G) => CompanionBuilder<V, N, G>;
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
function of<V extends AnyVal>(value: Input<V>): V {
  return copy(value) as unknown as V;
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

/** The constructors a companion was given, if any. */
type Ctors = { create?: AnyFn; from?: (value: unknown) => unknown };

/** Attaches the default behaviour plus the user's methods to `target`. */
function attach(target: object, methods: Record<string, unknown>, ctors: Ctors = {}): void {
  const { create, from } = ctors;
  // Without `from`, `with` / `update` are the constructor, so they copy like one.
  // With it, ownership is `from`'s business — `Val.of` is how it gets a copy.
  const construct: (value: unknown) => unknown = from ?? copy;
  // `create` alone is not a payload function, so there is nothing to rebuild through.
  const rebuildable = from !== undefined || create === undefined;

  define(target, "equals", deepEquals);
  if (create) define(target, "create", create);
  if (from) define(target, "from", from);

  define(target, "with", (value: unknown, patch: Record<string, unknown>) => {
    if (!rebuildable) {
      throw new TypeError("`with` needs a `from`; `create` alone cannot rebuild a payload.");
    }
    if (!isPlainRecord(value)) {
      throw new TypeError("`with` is only available for object-shaped Vals.");
    }
    const merged: Record<string, unknown> = { ...value, ...patch };
    for (const key of Object.keys(merged)) {
      if (merged[key] === undefined) delete merged[key];
    }
    return construct(merged);
  });

  define(target, "update", (value: unknown, fn: (value: unknown) => unknown) => {
    if (!rebuildable) {
      throw new TypeError("`update` needs a `from`; `create` alone cannot rebuild a payload.");
    }
    return construct(fn(value));
  });

  for (const key of Object.keys(methods)) {
    // A custom `equals` is handed the structural default as a third argument, so an
    // override can fall back to it without that function being exported. Callers still
    // pass two, which is why the companion type keeps `equals` at `(a, b) => boolean`.
    if (key === "equals" && typeof methods[key] === "function") {
      const custom = methods[key] as (a: unknown, b: unknown, deep: typeof deepEquals) => boolean;
      define(target, key, (a: unknown, b: unknown) => custom(a, b, deepEquals));
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
  const seal = (value: Input<V>): V => copy(value) as unknown as V;
  attach(seal, {});

  define(
    seal,
    "impl",
    <M extends CompanionMethods<V> = Record<never, never>>(methods: M = {} as M): Sealed<V, M> => {
      const sealed = (value: Input<V>): V => copy(value) as unknown as V;
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
 *   .implFrom((n: number): Result<Age> => …)
 *   .impl({
 *     next(a) { … }, // `a` is contextually an Age
 *   });
 * ```
 *
 * `implFrom` is for the payload; anything else — a generated id, a wire format,
 * several arguments — is `implCreate` (design §6.7):
 *
 * ```ts
 * export const User = Val.companion<User>()
 *   .implCreate((f: Fields) => Val.of<User>({ id: crypto.randomUUID(), ...f }))
 *   .implFrom((u: Input<User>) => validate(u));
 * ```
 *
 * Use `Val.of` inside `from` to lift the validated value. Since no constructor is
 * ever produced, there is nothing for a caller to reach past `from`.
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

  define(target, "implFrom", (from: (value: unknown) => unknown) => build<V>({ ...ctors, from }));

  return target;
}

/**
 * The namespace sharing its name with the `Val` type.
 *
 * - `Val.of` — lifts a raw value into a Val, copying it (design §2.2, §4.1)
 * - `Val.sealer` — a constructor, and `.impl()` to attach behaviour to it
 * - `Val.companion` — the same, minus the constructor
 *
 * There are deliberately no free-function `Val.equals` / `Val.with`. The brand is
 * phantom, so the type cannot be recovered from a value at runtime and there is
 * nothing to dispatch per-type behaviour on (design §5, §6.2).
 */
export const Val = { of, sealer, companion } as const;
