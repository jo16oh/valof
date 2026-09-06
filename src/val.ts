/** Primitives allowed as values. `undefined` is deliberately excluded. */
type Primitive = string | number | boolean | bigint | null;

export type AnyVal = { readonly __valof_internal_phantom_brand: string };

/** Marker surfaced in the type when a payload violates the allowed-type rules. */
type Invalid<Msg extends string> = { readonly __valError: Msg };

type OptionalKeys<T> = {
  [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? K : never;
}[keyof T];

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
          ? [Exclude<keyof T, string>] extends [never]
            ? {
                [K in keyof T]: K extends OptionalKeys<T>
                  ? Validate<Exclude<T[K], undefined>> | undefined
                  : undefined extends T[K]
                    ? Invalid<"required property cannot be undefined; use null or make it optional">
                    : Validate<T[K]>;
              }
            : Invalid<"keys must be strings; a number or symbol key does not survive a JSON round trip">
          : Invalid<"not a plain value">;

/** Recursion stops at a nested Val: it is already deep-readonly. */
type DeepReadonly<T> = [T] extends [AnyVal]
  ? T
  : [T] extends [Primitive]
    ? T
    : [T] extends [ReadonlyArray<infer E>]
      ? ReadonlyArray<DeepReadonly<E>>
      : [T] extends [object]
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

/** The payload, or the annotated version of it when it breaks the allowed-type rules. */
type Checked<T> = [T] extends [Validate<T>] ? T : Validate<T>;

/**
 * The conditional lives here, not {@link Val}. An alias whose top level is a conditional loses
 * its name once it resolves, so `User` would print as the expanded intersection, phantom keys
 * included, in every hover. An alias over an intersection keeps the name.
 *
 * `T extends Validate<T>` is the natural spelling. On a type alias that is TS2313 "circular
 * constraint", hence the conditional.
 */
type Phantom<K extends string, T> = [T] extends [Validate<T>]
  ? {
      readonly __valof_internal_phantom_brand: K;
      /** Exists only so the original payload type can be recovered. */
      readonly __valof_internal_phantom_payload: T;
    }
  : { readonly __valof_internal_phantom_brand: Validate<T> };

/** A branded value type. A payload that breaks the allowed-type rules is a type error. */
export type Val<K extends string, T> = DeepReadonly<Checked<T>> & Phantom<K, T>;

/** The Val's brand string. */
export type BrandOf<V extends AnyVal> = V["__valof_internal_phantom_brand"];

/** The Val's raw payload type. */
export type PayloadOf<V extends AnyVal> = V extends {
  readonly __valof_internal_phantom_payload: infer T;
}
  ? T
  : never;

/**
 * The payload as constructors, `Val.of` and a custom seal accept it.
 *
 * Deep-readonly to accept more, not to enforce: every constructor deep-copies its argument. A
 * Val is itself deep-readonly, so a payload taken from an existing value fits.
 */
export type SeedOf<V extends AnyVal> = DeepReadonly<PayloadOf<V>>;

/**
 * The patch accepted by `with`.
 *
 * Taken over a payload rather than a Val, so a custom `with` can patch a subset of the fields:
 * `Patch<Omit<SeedOf<V>, "id">>` keeps a generated id out.
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

type AnyFn = (...args: never[]) => unknown;

/** What a companion may hold besides functions: constants, lookup tables, and so on. */
type NonFn = Primitive | undefined | readonly unknown[] | Record<string, unknown>;

/** The functions a companion accepts, each taking its Val first. */
type CompanionFns<V extends AnyVal, F = undefined> = {
  /**
   * Overrides the default deep equals, for top-level comparisons only. The default arrives as a
   * third argument to fall back on. Callers never pass it: `YourVal.equals` stays
   * `(a, b) => boolean`.
   */
  equals?: (a: V, b: V, deepEquals: (a: V, b: V) => boolean) => boolean;
  /**
   * Rejected so they cannot be mistaken for registrations. A `seal` whose first parameter
   * accepts the Val, common for primitive payloads, would otherwise satisfy the index signature
   * and attach as an ordinary function, leaving `with` / `update` unrouted. Use `.implSeal` /
   * `.implCreate`.
   */
  seal?: never;
  create?: never;
  /**
   * Overrides the default `with` / `update`, in the type as well as at runtime.
   *
   * The seal arrives last, as `equals` receives the deep comparison: the companion is still
   * being initialised, so `YourVal.seal` is not in scope inside `.impl`. Callers never pass it.
   * Taking it is optional; a two-parameter override is published as it stands.
   */
  // oxlint-disable-next-line no-explicit-any -- the patch is yours to choose; `never` would not fit the index signature
  with?: (value: V, patch: any, seal: (value: SeedOf<V>) => Constructed<V, F>) => unknown;
  /** Same as `with`, for the function-shaped update. */
  // oxlint-disable-next-line no-explicit-any -- same as `with`
  update?: (value: V, fn: any, seal: (value: SeedOf<V>) => Constructed<V, F>) => unknown;
  /**
   * One callable member only. This is the contextual type for the Val parameter, and TypeScript
   * takes one from a union only while a single constituent has a call signature. `NonFn` has
   * none. A second function type would, and the parameter then falls back to implicit `any`
   * with no error.
   */
  // oxlint-disable-next-line no-explicit-any -- `never[]` would type unannotated extra parameters as `never`
  [key: string]: ((value: V, ...rest: any[]) => unknown) | NonFn;
};
/**
 * What the seal produces, propagated verbatim. The library never inspects it, so `Result` and
 * friends need no support here.
 */
type Constructed<V extends AnyVal, F> = F extends (...args: never[]) => infer R ? R : V;

type SealImpl<V extends AnyVal> = (value: SeedOf<V>, seal: (value: SeedOf<V>) => V) => unknown;

/**
 * The seal's parameter may be wider than the payload, so a schema library can parse into it,
 * but not so wide that it accepts a wire format. `with` and `update` hand a payload back to the
 * seal, so one written to decode a JSON string breaks as soon as a value is derived from another.
 *
 * {@link SealImpl} fixes the lower bound at `SeedOf<V>`. This is the upper one: the parameter
 * must not accept a string. That rules out `unknown` and `{}`, leaving `object` and
 * `Record<string, unknown>` alone. A string payload cannot be told apart from a wire format, so
 * it is exempt.
 */
type CheckedSeal<V extends AnyVal, G extends SealImpl<V>> = [string] extends [SeedOf<V>]
  ? G
  : [string] extends [Parameters<G>[0]]
    ? Invalid<"a seal takes the payload, not a wire format; decode before sealing">
    : G;

/**
 * What `create` must be: any arguments, a payload out. The result is not a value yet. The
 * type's seal closes it, so `create` is not a way past the seal.
 */
type Minter<V extends AnyVal> = (...args: never[]) => SeedOf<V>;

/** The public face of `create`: its own arguments, and whatever the seal returns. */
type Minting<V extends AnyVal, N, F> = N extends (...args: infer A) => unknown
  ? (...args: A) => Constructed<V, F>
  : undefined;

/** `create`, present only on a companion that registered one. */
type CreateMethod<V extends AnyVal, N, F> = [Minting<V, N, F>] extends [undefined]
  ? Record<never, never>
  : {
      /** Mints a payload and seals it, so it returns whatever the seal returns. */
      create: Minting<V, N, F>;
    };

/** `seal`, present only on a companion that replaced the default one. */
type SealMethod<F> = [WithoutDefaultSeal<F>] extends [undefined]
  ? Record<never, never>
  : {
      /**
       * The single gate a payload passes to become a value. `create`, `with` and `update` all
       * go through it.
       */
      seal: WithoutDefaultSeal<F>;
    };

/**
 * `with` and `update` rebuild by sealing the new payload. With a custom seal they propagate
 * whatever it returns. Without one the default seal is the copy, so they hand back the Val.
 */
type Rebuild<V extends AnyVal, F, Arg> = (value: V, arg: Arg) => Constructed<V, F>;

/**
 * Drops the trailing seal parameter from an override, so callers see the two-parameter function
 * they actually call. An override written without it is published unchanged.
 */
type WithoutSeal<T> = T extends (...args: infer A) => infer R
  ? A extends [infer Value, infer Arg, unknown]
    ? (value: Value, arg: Arg) => R
    : T
  : T;

/**
 * Drops the trailing default-seal parameter from a registered seal, for the same reason
 * {@link WithoutSeal} does on an override: callers pass the payload and nothing else.
 */
type WithoutDefaultSeal<F> = F extends (...args: infer A) => infer R
  ? A extends [infer Value, unknown]
    ? (value: Value) => R
    : F
  : F;

/** The payload minus the keys `.unpatchable` took out of the update path. */
type Patchable<V extends AnyVal, P> = [P] extends [never]
  ? SeedOf<V>
  : Omit<SeedOf<V>, P & keyof SeedOf<V>>;

/**
 * `T`, with every key it has beyond `S`'s mapped to `never`.
 *
 * Narrowing `update`'s callback by return type is not enough: excess-property checking fires
 * only when an object literal meets its target directly, and an un-annotated arrow body is
 * inferred first, so `(v) => ({ ...v, id: "forged" })` slips through. An uninhabitable key
 * catches it.
 */
type NoExtra<T, S> = T & Record<Exclude<keyof T, keyof S>, never>;

/**
 * `with` exists only when there is something to patch: `Patch` is `never` for primitives and
 * arrays, so for those the function is left out of the type. A `with` from `.impl` wins, as
 * `equals` does.
 */
type WithMethod<V extends AnyVal, M, F, P> = "with" extends keyof M
  ? {
      /** Rebuilds the value with the patch applied, through the type's own seal. */
      with: WithoutSeal<M["with"]>;
    }
  : [Patch<Patchable<V, P>>] extends [never]
    ? Record<never, never>
    : {
        /**
         * Rebuilds by sealing, so it returns whatever the seal returns: there is no hole through
         * which `with` bypasses a smart constructor.
         */
        with: Rebuild<V, F, Patch<Patchable<V, P>>>;
      };

/**
 * Same as {@link WithMethod}: yours if you wrote one, the rebuilt default otherwise. With keys
 * taken out of the patch path, the callback returns only what is left and the default merges it
 * onto the value.
 */
type UpdateMethod<V extends AnyVal, M, F, P> = "update" extends keyof M
  ? {
      /** Rebuilds the value from a transform of it, through the type's own seal. */
      update: WithoutSeal<M["update"]>;
    }
  : {
      /**
       * Rebuilds the value from a transform of it, by sealing the result.
       *
       * Value to value on purpose: a fallible transform chains into `Result<Result<...>>`.
       * Use `with` and a combinator of your own for that.
       */
      update: [P] extends [never]
        ? Rebuild<V, F, (value: V) => SeedOf<V>>
        : <T extends Patchable<V, P>>(
            value: V,
            fn: (value: V) => NoExtra<T, Patchable<V, P>>,
          ) => Constructed<V, F>;
    };

/**
 * A type's functions, and nothing else. Not callable: constructors come from `Val.sealer`, so a
 * companion built without one cannot build values.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 */
export type Companion<
  V extends AnyVal,
  M extends CompanionFns<V, F>,
  N = undefined,
  F = undefined,
  P = never,
> = Omit<M, "equals" | "with" | "update"> &
  CreateMethod<V, N, F> &
  SealMethod<F> &
  WithMethod<V, M, F, P> &
  UpdateMethod<V, M, F, P> & {
    /** Structural equality: key-order independent, ignoring `undefined`-valued keys. */
    equals: (a: V, b: V) => boolean;
  };

/**
 * A companion that kept the constructor it was built from.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 */
export type Sealed<V extends AnyVal, M extends CompanionFns<V>> = ((value: SeedOf<V>) => V) &
  Companion<V, M>;

/**
 * A constructor for `V`, which can grow functions without ceasing to be one.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 *
 * No `.implSeal` here: a sealer is the default seal, and a second one beside it would be a hole
 * past the first. No `.implCreate` either: beside a callable constructor, a `create` narrows
 * nothing.
 */
export type Sealer<V extends AnyVal> = Sealed<V, Record<never, never>> & {
  /** Collects the functions for the type. */
  impl: {
    // A separate step because TypeScript cannot infer type arguments partially, and two
    // overloads rather than a default `M`: a defaulted type parameter stops TypeScript using
    // the constraint as a contextual type, leaving every first parameter implicitly `any`.
    (): Sealed<V, Record<never, never>>;
    <M extends CompanionFns<V>>(fns: M): Sealed<V, M>;
  };
};

/**
 * What `Val.companion` returns: the mirror of {@link Sealer}, differing only in that nothing
 * was ever callable.
 *
 * Inferred, not written: it is exported so your own declarations can name it.
 *
 * `implSeal` and `implCreate` are separate steps because a seal must be idempotent. Minting
 * belongs in `create`, whose payload is then sealed like any other.
 */
export type CompanionBuilder<V extends AnyVal, N = undefined, F = undefined, P = never> = Companion<
  V,
  Record<never, never>,
  N,
  F,
  P
> & {
  /** Collects the functions for the type. Constructors go to `.implSeal` / `.implCreate`. */
  impl: {
    (): Companion<V, Record<never, never>, N, F, P>;
    <M extends CompanionFns<V, F>>(fns: M): Companion<V, M, N, F, P>;
  };
  /** Registers the payload-minting constructor as `create`. Any arguments, a payload out. */
  implCreate: <G extends Minter<V>>(create: G) => CompanionBuilder<V, G, F, P>;
  /** Replaces the seal. */
  implSeal: <G extends SealImpl<V>>(seal: CheckedSeal<V, G>) => CompanionBuilder<V, N, G, P>;
  /**
   * Takes keys out of the update path: `with` stops accepting them in its patch, and `update`'s
   * callback returns only what is left, with the rest merged back on.
   *
   * For what a `create` mints and nothing afterwards may change: an id, a `createdAt`, a
   * version counter.
   *
   * ```ts
   * Val.companion<User>()
   *   .implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f }))
   *   .implSeal(seal)
   *   .unpatchable<"id">();
   * ```
   *
   * The keys are a type argument and do not exist at runtime. This constrains the update path,
   * not the value: `Val.of` can still forge one.
   */
  unpatchable: <K extends keyof SeedOf<V> & string>() => CompanionBuilder<V, N, F, P | K>;
};

const isObjectShaped = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const assertPlainObject = (value: object): void => {
  const proto = Object.getPrototypeOf(value) as object | null;
  if (proto !== Object.prototype && proto !== null) {
    const name = (value.constructor as { name?: string } | undefined)?.name;
    throw new TypeError(
      `a Val holds plain objects only; received ${name ? `an instance of ${name}` : "an object with a prototype"}`,
    );
  }
};

/**
 * Structural deep comparison. Every companion carries it as the default `equals`.
 *
 * - independent of key order
 * - ignores keys whose value is `undefined` (`{ a: undefined }` equals `{}`)
 * - `NaN` equals `NaN`, and `-0` equals `0`
 *
 * Not exported from `./index.ts`: a free function cannot dispatch to a type's own `equals`, so
 * comparing two Vals with it would bypass a custom one. Overrides receive it as a third
 * argument instead (see {@link CompanionFns}).
 */
export const deepEquals = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  // `-0` and `0` are already equal via `===`, which matches JSON round-tripping
  // (`JSON.stringify(-0)` is `"0"`), so only NaN is left to handle.
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
};

/**
 * The nodes this module built. Subtrees are immutable, so recognising one lets `with` rebuild
 * the spine and share everything below it.
 *
 * Leaves are recorded too. A record costs about 20x a lookup and never earns that back in
 * copying time, but frameworks compare identity: without it every small nested Val gets a new
 * identity on each `with`, and a memoised component re-renders for a change it never saw.
 *
 * Missing a node costs a copy, never correctness, so the set can be lost across a
 * `structuredClone` or a JSON round trip with nothing to repair.
 */
const owned = new WeakSet<object>();

const development =
  typeof process === "undefined" ? false : process.env["NODE_ENV"] !== "production";

/**
 * Builds the recursive deep copy, in an owning and a non-owning form.
 *
 * `owning` is closed over rather than passed, so it cannot change underneath a copy in progress:
 * copying runs a payload's getters, which is someone else's code and can seal or unwrap.
 *
 * Values are frozen in development only. Breaking `readonly` takes a cast, and with nodes shared
 * that write lands in every value holding the node. Freezing measured at 25-30% and buys nothing
 * at run time, so production skips it.
 */
const deepCopy = (owning: boolean) => {
  const copy = <T>(value: T): T => {
    if (value === null || typeof value !== "object") return value;
    if (owning && owned.has(value)) return value;

    let out: unknown;

    if (Array.isArray(value)) {
      out = (value as unknown[]).map((element) => copy(element));
    } else {
      const source = value as Record<string, unknown>;

      if (development) assertPlainObject(source);

      const target: Record<string, unknown> = {};
      for (const key of Object.keys(source)) {
        const copied = copy(source[key]);
        // Plain assignment would invoke the `__proto__` setter on that one key, moving it into
        // the prototype instead of copying it. Defining it keeps it an own property, and only
        // that key pays for the slower path.
        if (key === "__proto__") {
          Object.defineProperty(target, key, {
            value: copied,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        } else {
          target[key] = copied;
        }
      }
      out = target;
    }

    if (owning) {
      owned.add(out as object);
      if (development) Object.freeze(out);
    }
    return out as T;
  };
  return copy;
};

/**
 * Deep-copies a payload and takes ownership: reuses nodes this module owns, records the ones it
 * makes, freezes them in development.
 *
 * Recorded here rather than in `seal` because this is where the nodes are. A seal sees only the
 * root, so a list of 200 Vals would get a new array on every derive, at 10x the cost and with a
 * new identity for anything memoised on it.
 */
const own = deepCopy(true);

/** A plain deep copy. What `Val.unwrap` hands back is not the library's. */
const detach = deepCopy(false);

/** `Object.assign` onto a function throws on `name` / `length`, so define properties instead. */
const define = <T extends object>(target: T, key: string, value: unknown): T => {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return target;
};

/** The constructors a companion was given, plus whether `.unpatchable` was called. */
type Ctors = {
  create?: AnyFn;
  seal?: (value: unknown, seal: (value: unknown) => unknown) => unknown;
  unpatchable?: boolean;
};

/**
 * Attaches the defaults plus the user's functions to `target`.
 *
 * Everything that produces a value goes through `seal`: the registered one, or a copy when the
 * type did not replace it. Nothing copies on the way in. The one deep copy happens in the
 * default seal that a custom one returns through.
 */
const attach = <T extends object>(
  target: T,
  fns: Record<string, unknown>,
  ctors: Ctors = {},
): T => {
  const { create, seal: custom } = ctors;
  const seal: (value: unknown) => unknown = custom ? (value) => custom(value, own) : own;
  // A rebuild that changed nothing returns the value it started from, so a framework comparing
  // by identity sees no update. A custom seal owns the return shape, so the value goes back
  // through it: the copy inside recognises the node and hands the same one back.
  const keep: (value: unknown) => unknown = custom ? seal : (value) => value;

  define(target, "equals", deepEquals);
  if (create) define(target, "create", (...args: never[]) => seal(create(...args)));
  if (custom) define(target, "seal", seal);

  define(target, "with", (value: unknown, patch: Record<string, unknown>) => {
    // The type leaves `with` off a primitive or array Val, so reaching this takes a cast. Still
    // throws in production: without the guard the spread seals an object, turning a number into
    // `{}` and a string into a character map. Only the message is development-only.
    if (!isObjectShaped(value)) {
      throw new TypeError(
        development ? "`with` is only available for object-shaped Vals." : "with",
      );
    }
    const merged: Record<string, unknown> = { ...value, ...patch };
    // Nodes are shared and never mutated, so identical children mean equal subtrees. One level
    // answers whether the patch changed anything, and that walk is already happening. A patch
    // holding a freshly built child is a change: it went through a constructor.
    let same = true;
    let kept = 0;
    for (const key of Object.keys(merged)) {
      if (merged[key] === undefined) {
        delete merged[key];
        if (Object.hasOwn(value, key)) same = false;
        continue;
      }
      kept++;
      if (!Object.is(merged[key], value[key])) same = false;
    }
    return same && kept === Object.keys(value).length ? keep(value) : seal(merged);
  });

  // The merge is what lets the untouched keys survive without the library knowing their names.
  define(target, "update", (value: unknown, fn: (value: unknown) => unknown) => {
    const next =
      ctors.unpatchable && isObjectShaped(value)
        ? { ...value, ...(fn(value) as Record<string, unknown>) }
        : fn(value);
    // Only the transform that hands its argument straight back. Recognising a fresh object that
    // happens to be equal is `with`'s job, where the walk is already paid for.
    return Object.is(next, value) ? keep(value) : seal(next);
  });

  for (const key of Object.keys(fns)) {
    // Bound here rather than attached raw, which is what keeps callers at two arguments.
    if (key === "equals" && typeof fns[key] === "function") {
      const custom = fns[key] as (a: unknown, b: unknown, deep: typeof deepEquals) => boolean;
      define(target, key, (a: unknown, b: unknown) => custom(a, b, deepEquals));
      continue;
    }
    // Same idea for a hand-written rebuild, which cannot reach the companion it is being
    // defined on.
    if ((key === "with" || key === "update") && typeof fns[key] === "function") {
      const custom = fns[key] as (value: unknown, arg: unknown, seal: unknown) => unknown;
      define(target, key, (value: unknown, arg: unknown) => custom(value, arg, seal));
      continue;
    }
    define(target, key, fns[key]);
  }

  return target;
};

/** One builder state: the constructors registered so far, plus the steps still open. */
const build = <V extends AnyVal>(ctors: Ctors): object => {
  const target = attach({}, {}, ctors);

  define(target, "impl", (fns: Record<string, unknown> = {}) => attach({}, fns, ctors));
  define(target, "implCreate", (create: AnyFn) => build<V>({ ...ctors, create }));
  define(target, "implSeal", (seal: NonNullable<Ctors["seal"]>) => build<V>({ ...ctors, seal }));

  return define(target, "unpatchable", () => build<V>({ ...ctors, unpatchable: true }));
};

export const Val = {
  /**
   * The default seal, with the type named explicitly: brand the payload and copy it. A called
   * `Val.sealer` and the seal handed to a custom one do the same thing; only the type differs.
   */
  of: own as <V extends AnyVal>(value: SeedOf<V>) => V,
  /**
   * The other direction: a plain, mutable copy of the payload, for code that does not know
   * about `readonly`.
   *
   * It copies because the brand is phantom: a Val is its payload at run time, so handing that
   * object back under a mutable type would put the caller's writes into the value.
   */
  unwrap: detach as <V extends AnyVal>(value: V) => PayloadOf<V>,
  /**
   * Creates the constructor for a Val. `Val.companion` is the same shape for a type with a
   * smart constructor, minus the callability.
   *
   * `V` is given as a type argument; the functions are inferred by `.impl()`.
   */
  sealer: <V extends AnyVal>(): Sealer<V> =>
    define(
      attach((value: SeedOf<V>): V => own(value) as unknown as V, {}),
      "impl",
      <M extends CompanionFns<V> = Record<never, never>>(fns: M = {} as M): Sealed<V, M> =>
        attach((value: SeedOf<V>): V => own(value) as unknown as V, fns) as unknown as Sealed<V, M>,
    ) as unknown as Sealer<V>,
  /**
   * Bundles a type's functions without a constructor.
   *
   * Constructors get their own steps rather than sitting in `.impl`, which fixes every
   * function's first parameter to the Val. A constructor does not fit that shape.
   */
  companion: <V extends AnyVal>(): CompanionBuilder<V> => build<V>({}) as CompanionBuilder<V>,
} as const;
