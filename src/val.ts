/** Primitives allowed as values. `undefined` is deliberately excluded. */
type Primitive = string | number | boolean | bigint | null;

/**
 * Any Val.
 *
 * The brand keys are phantom: nothing ever writes them. They are string keys rather than
 * `unique symbol`s so that a declaration emitted by a downstream package can name them — a
 * symbol would have to be in scope in the emitting file, which fails with TS4023 for anyone
 * re-exporting a companion.
 */
export type AnyVal = { readonly __valof_internal_phantom_brand: string };

/** Marker surfaced in the type when a payload violates the allowed-type rules. */
type Invalid<Msg extends string> = { readonly __valError: Msg };

// ---------------------------------------------------------------------------
// Allowed-type validation
// ---------------------------------------------------------------------------

/** Extracts only the optional keys. `-?` keeps `undefined` out of the mapped value type. */
type OptionalKeys<T> = {
  [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? K : never;
}[keyof T];

/**
 * Allowed-type check. Applied once from `Val<K, T>`, not per call site. Offending positions are
 * replaced by `Invalid<Msg>`, so the message shows up directly in the resulting type.
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
// DeepReadonly
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
// Val
// ---------------------------------------------------------------------------

/** The payload, or the annotated version of it when it breaks the allowed-type rules. */
type Checked<T> = [T] extends [Validate<T>] ? T : Validate<T>;

/**
 * The phantom half of a Val. An invalid payload gets a brand that is not a string, so the
 * result no longer satisfies `AnyVal` and `Val.of` / `Val.companion` reject it.
 *
 * The annotated payload is put there rather than simply withholding the brand, because a
 * missing property only reports the property: hanging `Validate<T>` off the brand makes the
 * checker print it while explaining the mismatch, which is what carries the `Invalid<...>`
 * message into the diagnostic.
 *
 * (The natural spelling is the self-referential constraint `T extends Validate<T>`, but on a
 * type alias that is TS2313 "circular constraint", so this checks with a conditional type
 * instead.)
 */
type Phantom<K extends string, T> = [T] extends [Validate<T>]
  ? {
      readonly __valof_internal_phantom_brand: K;
      /** Phantom. Exists only so the original payload type can be recovered. */
      readonly __valof_internal_phantom_payload: T;
    }
  : { readonly __valof_internal_phantom_brand: Validate<T> };

/**
 * A branded value type.
 *
 * The conditional lives in {@link Phantom} rather than here on purpose: an alias whose
 * top level is a conditional loses its own name once it resolves, so `User` would print as
 * the whole expanded intersection — phantom keys included — in every hover and diagnostic.
 * An alias over an intersection keeps it.
 */
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
 * What a value can be grown from: the payload as constructors, `Val.of` and a custom seal
 * accept it.
 *
 * Deep-readonly to *accept* more, not to enforce anything — ownership is handled by the deep
 * copy every constructor makes. A Val is itself deep-readonly, so without it, deriving a value
 * from an existing one would not type-check.
 */
export type SeedOf<V extends AnyVal> = DeepReadonly<PayloadOf<V>>;

// ---------------------------------------------------------------------------
// patch
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
// sealer and companion
// ---------------------------------------------------------------------------

type AnyFn = (...args: never[]) => unknown;

/** What a companion may hold besides methods: constants, lookup tables, and so on. */
type NonMethod = Primitive | undefined | readonly unknown[] | Record<string, unknown>;

/**
 * The methods a companion accepts. Every one of them takes its Val first, which is what lets
 * the parameter go unannotated.
 *
 * The index signature is a *single* function type, the only shape TypeScript will use as a
 * contextual type; a union or an F-bounded mapped constraint both type-check but leave the
 * parameter implicitly `any`.
 */
type CompanionMethods<V extends AnyVal, F = undefined> = {
  /**
   * Overrides the default deep equals, for top-level comparisons only. That default is handed
   * over as a third argument so an override can fall back to it; callers never pass it —
   * `YourVal.equals` stays `(a, b) => boolean`.
   */
  equals?: (a: V, b: V, deepEquals: (a: V, b: V) => boolean) => boolean;
  /**
   * Rejected here so they cannot be mistaken for registrations. A `seal` whose first parameter
   * happens to accept the Val — common for primitive payloads — would otherwise satisfy the
   * index signature and be attached as an ordinary method, leaving `with` / `update` unrouted.
   * Use `.implSeal` / `.implCreate` instead.
   */
  seal?: never;
  create?: never;
  /**
   * Overrides the default `with` / `update`, in the type as well as at runtime.
   *
   * The seal comes in as the last parameter, the way `equals` receives the deep comparison: the
   * companion is still being initialised, so `YourVal.seal` cannot be referenced from inside
   * `.impl`. Callers never pass it, and taking it is optional — the two-parameter form is
   * published as it stands.
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
 * What the seal produces, propagated verbatim. The library stays ignorant of `Result` and
 * friends: it only ever infers this type and passes it along.
 */
type Constructed<V extends AnyVal, F> = F extends (...args: never[]) => infer R ? R : V;

/**
 * What a custom seal must be: a whole payload in, a value out. Enforced at registration, so a
 * constructor that cannot seal a payload fails where it is written rather than at the `with`
 * that later needs it.
 *
 * The default seal comes in as a second parameter, optional to take.
 */
type SealImpl<V extends AnyVal> = (value: SeedOf<V>, seal: (value: SeedOf<V>) => V) => unknown;

/**
 * What `create` must be: any arguments at all, a payload out. What it returns is not a value
 * yet — the type's seal closes it, which is what keeps `create` from being a way past the seal.
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
       * go through it, so nothing reaches a value without passing it.
       */
      seal: WithoutDefaultSeal<F>;
    };

/**
 * How `with` and `update` rebuild a value: by sealing the new payload, since the seal is the
 * only way a payload becomes a value. With a custom one they propagate whatever it returns;
 * without one the default seal is the copy, so they hand back the Val itself.
 */
type Rebuild<V extends AnyVal, F, Arg> = (value: V, arg: Arg) => Constructed<V, F>;

/**
 * Drops the trailing seal parameter from an override, so callers see the two-parameter method
 * they actually call. An override written without it is published unchanged — a two-element
 * parameter list does not match the three-element pattern.
 */
type WithoutSeal<T> = T extends (...args: infer A) => infer R
  ? A extends [infer Value, infer Arg, unknown]
    ? (value: Value, arg: Arg) => R
    : T
  : T;

/**
 * Drops the trailing default-seal parameter from a registered seal, for the same reason
 * {@link WithoutSeal} does on an override: callers pass the payload and nothing else. A seal
 * written with one parameter is published unchanged.
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
 * Narrowing `update`'s callback to a return type is not enough: excess-property checking only
 * fires when an object literal meets its target directly, and an un-annotated arrow body is
 * inferred first, so `(v) => ({ ...v, id: "forged" })` slips through. An uninhabitable key
 * catches it instead.
 */
type NoExtra<T, S> = T & Record<Exclude<keyof T, keyof S>, never>;

/**
 * `with` exists only when there is something to patch: `Patch` is `never` for primitives and
 * arrays, so for those the method is left out of the type entirely. A `with` supplied in
 * `.impl` wins, the way `equals` does.
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
         * Rebuilds the value with the patch applied: an omitted key is left unchanged,
         * `undefined` deletes an optional one, anything else is set.
         *
         * It rebuilds by sealing, so it returns whatever the seal returns — there is no hole
         * through which `with` bypasses a smart constructor.
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
       * Deliberately value → value: a fallible transform would give `Result<Result<...>>` when
       * chained, and belongs in `with` plus a combinator of your own.
       */
      update: [P] extends [never]
        ? Rebuild<V, F, (value: V) => SeedOf<V>>
        : <T extends Patchable<V, P>>(
            value: V,
            fn: (value: V) => NoExtra<T, Patchable<V, P>>,
          ) => Constructed<V, F>;
    };

/**
 * A type's behaviour, and nothing else. Notably not callable: a constructor comes from
 * `Val.sealer`, so a companion built without one cannot be used to build values.
 */
export type Companion<
  V extends AnyVal,
  M extends CompanionMethods<V, F>,
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

/** A companion that kept the constructor it was built from. */
export type Sealed<V extends AnyVal, M extends CompanionMethods<V>> = ((value: SeedOf<V>) => V) &
  Companion<V, M>;

/**
 * A constructor for `V`, which can grow methods without ceasing to be one.
 *
 * There is no `.implSeal` here on purpose: a sealer *is* the default seal, and a second,
 * checked one beside it would be a hole straight past the first. Nor is there `.implCreate`:
 * beside a callable constructor a `create` narrows nothing.
 */
export type Sealer<V extends AnyVal> = Sealed<V, Record<never, never>> & {
  /**
   * Attaches behaviour to the constructor. What comes back is still a constructor, and every
   * method takes its Val as the first parameter, so that parameter needs no annotation.
   */
  impl: {
    (): Sealed<V, Record<never, never>>;
    <M extends CompanionMethods<V>>(methods: M): Sealed<V, M>;
  };
};

/**
 * What `Val.companion` returns: the mirror of {@link Sealer}, differing only in that nothing
 * was ever callable.
 *
 * The two registration steps are deliberately separate: `implSeal` replaces the single gate a
 * payload passes to become a value, while `implCreate` is free-form but only ever builds a
 * *payload*, which is then sealed like anything else. A seal must be idempotent — the type
 * system cannot check that, which is why minting belongs in `create`.
 */
export type CompanionBuilder<V extends AnyVal, N = undefined, F = undefined, P = never> = Companion<
  V,
  Record<never, never>,
  N,
  F,
  P
> & {
  /**
   * Attaches behaviour. Every method takes its Val as the first parameter, so that parameter
   * needs no annotation; constructors go to `.implSeal` / `.implCreate` instead.
   */
  impl: {
    (): Companion<V, Record<never, never>, N, F, P>;
    <M extends CompanionMethods<V, F>>(methods: M): Companion<V, M, N, F, P>;
  };
  /** Registers the payload-minting constructor as `create`. Any arguments, a payload out. */
  implCreate: <G extends Minter<V>>(create: G) => CompanionBuilder<V, G, F, P>;
  /** Replaces the seal. `create`, `with` and `update` all go through it. */
  implSeal: <G extends SealImpl<V>>(seal: G) => CompanionBuilder<V, N, G, P>;
  /**
   * Takes keys out of the update path: `with` stops accepting them in its patch, and `update`'s
   * callback returns only what is left, with the rest merged back on.
   *
   * For what a `create` mints and nothing afterwards may change — an id, a `createdAt`, a
   * version counter:
   *
   * ```ts
   * Val.companion<User>()
   *   .implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f }))
   *   .implSeal(seal)
   *   .unpatchable<"id">();
   * ```
   *
   * The keys are a type argument: they never exist at runtime, so this is a guarantee about the
   * update path, not about the value. `Val.of` can still forge one, exactly as it can forge
   * anything else.
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
 * Deliberately absent from `./index.ts`: as a free function it cannot dispatch to a type's own
 * `equals`, so comparing two Vals with it would silently bypass a custom one. An override
 * receives it as a third argument instead (see {@link CompanionMethods}).
 */
export function deepEquals(a: unknown, b: unknown): boolean {
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
}

/**
 * Deep-copies a payload, which is how a constructor takes ownership of its argument:
 * `DeepReadonly` is erased at runtime.
 *
 * Payloads are primitives, arrays, plain objects and nested Vals — themselves plain data — so
 * the recursion needs no special cases. The result is deliberately not frozen.
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
 * The default seal, with the type named explicitly: brand the payload and copy it.
 *
 * The same operation a `Val.sealer` performs when called, and the same one a custom seal
 * receives as its second parameter — the three differ only in where the type comes from.
 */
function of<V extends AnyVal>(value: SeedOf<V>): V {
  return copy(value) as unknown as V;
}

/**
 * The other direction: a plain, mutable copy of the payload, for code that does not know about
 * `readonly`.
 *
 * It copies for the same reason constructors do: the brand is phantom, so a Val *is* its
 * payload at runtime, and returning it under a mutable type would let the caller write straight
 * through into the value.
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
 * Everything that produces a value goes through one function, `seal`: the registered one, or a
 * copy when the type did not replace it. Nothing copies on the way *in* — the deep copy that
 * takes ownership happens once, in the default seal the custom one returns through.
 */
function attach(target: object, methods: Record<string, unknown>, ctors: Ctors = {}): void {
  const { create } = ctors;
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

  // The merge is what lets the untouched keys survive without the library knowing their names.
  define(target, "update", (value: unknown, fn: (value: unknown) => unknown) =>
    seal(
      ctors.unpatchable && isPlainRecord(value)
        ? { ...value, ...(fn(value) as Record<string, unknown>) }
        : fn(value),
    ),
  );

  for (const key of Object.keys(methods)) {
    // Bound here rather than attached raw, which is what keeps callers at two arguments.
    if (key === "equals" && typeof methods[key] === "function") {
      const custom = methods[key] as (a: unknown, b: unknown, deep: typeof deepEquals) => boolean;
      define(target, key, (a: unknown, b: unknown) => custom(a, b, deepEquals));
      continue;
    }
    // Same idea for a hand-written rebuild, which cannot reach the companion it is being
    // defined on.
    if ((key === "with" || key === "update") && typeof methods[key] === "function") {
      const custom = methods[key] as (value: unknown, arg: unknown, seal: unknown) => unknown;
      define(target, key, (value: unknown, arg: unknown) => custom(value, arg, seal));
      continue;
    }
    define(target, key, methods[key]);
  }
}

/**
 * Creates the constructor for a Val. {@link companion} is the same shape for a type with a
 * smart constructor, minus the callability.
 *
 * TypeScript cannot infer type arguments partially, which is why `V` is pinned by a type
 * argument here and the methods are inferred by `.impl()`. `.impl` is overloaded rather than
 * giving `M` a default: a defaulted type parameter makes TypeScript stop using the constraint
 * as a contextual type, and every method's first parameter silently falls back to implicit
 * `any`.
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
 * Since no constructor is ever produced, and `create` hands its payload to the seal, nothing
 * reaches a value without passing it. Constructors are registered by their own steps rather
 * than sitting in `.impl`, because `.impl` fixes every method's first parameter to the Val and
 * a constructor's does not fit that shape.
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

export const Val = { of, unwrap, sealer, companion } as const;
