# valof

> **Values are plain data; behaviour lives outside them.**

Value-object helpers for TypeScript: branded types, plus a companion that holds the
behaviour attached to a type. Values stay **plain objects, arrays and primitives** —
no classes, no prototypes.

```bash
pnpm install valof
```

## What you get

Because values are plain, the following all hold:

- they can sit directly in React / Svelte / Vue state
- they round-trip symmetrically through `JSON.stringify` / `JSON.parse`
- they survive `structuredClone`
- immutable updates never drop a prototype
- the brand is a phantom type, so it costs nothing and shows up nowhere at runtime

```ts
const user = User({ id: "a", name: "bob" });
Object.keys(user); // ["id", "name"] — the brand does not exist at runtime
```

A class gives you none of these.

## Basics

```ts
import { Val } from "valof";

export type User = Val<
  "app/User",
  {
    id: string;
    name: string;
    nickname?: string;
  }
>;

export const User = Val.sealer<User>().impl({
  greet(u) {
    console.log(`Hi, I'm ${u.name}.`);
  },
});

const user = User({ id: "a", name: "bob" });
User.greet(user);
```

`Val.sealer<User>()` is the constructor. `.impl({…})` attaches behaviour to it, so what
comes back is still a constructor. A Val with no methods of its own needs nothing
beyond the sealer, which already carries the defaults:

```ts
export const Tags = Val.sealer<Tags>();
Tags({ typescript: true });
Tags.equals(a, b);
```

Every method in `.impl` takes its Val as the first parameter, so that parameter needs no
annotation — `greet(u)`, not `greet(u: User)`. Anything after it is yours to type:

```ts
Val.sealer<User>().impl({
  greet(u, sep: string) {
    return u.id + sep + u.name; // u is User
  },
  anonymous: () => "anonymous", // taking no value is fine
  LABEL: "user", // so are plain constants
});
```

A function whose first parameter is something else is rejected. Factories that parse
other input are not methods on a value: constructors go to
[`.implSeal` / `.implCreate`](#smart-constructors), and anything beyond them is an
ordinary exported function.

The Val type is pinned by a type argument rather than inferred because TypeScript cannot
infer type arguments partially; the methods are inferred by the following call (the same
shape as zustand's `create<T>()(...)`).

The discriminant is a string literal, which means you don't have to declare a
`unique symbol` per type. Two Vals only collide when they share the same string, so
namespacing the key as `"app/User"` is the recommended convention.

The brand itself lives under the phantom keys `__valof_internal_phantom_brand` and
`__valof_internal_phantom_payload`. Nothing ever writes them, so they do not exist at runtime.
They are string keys rather than `unique symbol`s so that a package built on valof can
emit its own declarations: a symbol would have to be in scope in every emitting file,
which fails with `TS4023` for anyone re-exporting a companion. The names are verbose to keep them
from colliding with a real property, and say `phantom` so that meeting one in a hover
or an error message tells you not to look for it at runtime. They are still ordinary
keys, though, so they do appear in `keyof YourVal`. Reach for `PayloadOf<V>` or `SeedOf<V>` when you want the
payload's keys alone.

### `Val.of`

**The default seal, with the type named explicitly.** Brand the payload and copy it —
the same operation a `Val.sealer` performs when you call it, and the same one handed to a
custom seal as its second parameter. The three differ only in where the type comes from.

```ts
Val.of<User>({ id: "a", name: "alice" });
```

Reach for it where a value has to be built and no seal is in scope: at a trusted boundary
(a decoder, a database row), or in a companion method that returns a fresh value of its
own type. Where the type has a seal of its own, use that instead — `Val.of` would close
the payload with the default seal rather than the type's, which is to say: skip its
checks. That makes it the visible escape hatch, spelled with the type argument in plain
sight.

### `Val.unwrap`

The other direction: a plain, mutable copy of the payload, for handing to code that
does not know about `readonly`.

```ts
const post = Post({ title: "t", tags: ["a"] });

post.tags.sort(); // ✗ readonly string[] has no sort
Val.unwrap(post).tags.sort(); // ✓
```

It copies, for the same reason constructors do — a Val _is_ its payload at runtime, so
returning it under a mutable type would let the caller write straight through into the
value.

Reach for it when something outside wants mutable data. It is **not** how you derive one
value from another: `SeedOf<V>` already accepts a Val, so `Val.of` and `with` take one
directly and copy once, where going through `unwrap` copies twice.

```ts
Post.with(post, { tags: [...post.tags, "b"] }); // ✓ one copy
Post.with(post, { tags: [...Val.unwrap(post).tags, "b"] }); // ✗ two
```

### Constructors take ownership

Constructors deep-copy their argument, so keeping a reference to what you passed in
buys you nothing:

```ts
const raw = { id: "a", name: "alice" };
const user = User(raw);
raw.name = "mallory";
user.name; // "alice"
```

`readonly` is erased at runtime, so nothing else would stop that write. The copy is
the only thing standing between an aliased argument and a value that changes behind
your back — a value object that can is not one.

Values are not frozen, though. Reaching past `readonly` to write to a value is a
deliberate act, and freezing costs on every construction and slows array reads.

## Allowed types — read this part first

Only four things can live inside a Val:

|            |                                                     |
| ---------- | --------------------------------------------------- |
| Primitives | `string` / `number` / `boolean` / `bigint` / `null` |
| Other Vals | nesting always goes through a Val                   |
| Arrays     | `ReadonlyArray<allowed>`                            |
| Records    | `Readonly<Record<string, allowed>>`                 |

**Avoid nested plain objects — make the nesting a Val.** `Date`, `Temporal`, `Map`,
`Set`, functions and class instances cannot go in.

### Why

1. **Type inference stays cheap** — `DeepReadonly` recursion stops after one level
   (children are already readonly Vals)
2. **Structural equality is well-defined** — no prototypes, no cycles to reason about
3. **The serialization boundary is always crossable** — `structuredClone` and JSON are
   always safe
4. **It pushes the design the right way** — composing Vals is forced, which tends to
   produce sane aggregates

`Date` is out because its mutators touch internal slots (so `Object.freeze` cannot stop
them) and because it stringifies on `JSON.stringify` without coming back on
`JSON.parse`. Use an ISO 8601 string or epoch ms instead (see [Dates](#dates)). `Map` /
`Set` are out because they don't survive JSON, and `structuredClone` breaks reference
identity of keys (see [Map / Set](#map--set)).

A type that violates the rules does not get a usable brand, so it fails with the reason
the moment you hand it to `Val.of` / `Val.companion`:

```ts
type Bad = Val<"Bad", { nickname: string | undefined }>;
Val.companion<Bad>();
//            ~~~
// Type 'Bad' does not satisfy the constraint 'AnyVal'.
//   Types of property '__valof_internal_phantom_brand' are incompatible.
//     Type '{ nickname: Invalid<"required property cannot be undefined; use null or make it optional"> }'
//     is not assignable to type 'string'.
```

### The migration friction

Plain nested objects from API responses or existing code cannot be passed straight
through: you have to assemble the child Vals inside the seal. That is intentional — it
gives normalization a place to live at the boundary.

## Recommended tsconfig, and `null` / `undefined`

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true, // strongly recommended
  },
}
```

|                            |                                          |
| -------------------------- | ---------------------------------------- |
| `null` as a value          | allowed                                  |
| `?` (absent key)           | allowed                                  |
| `undefined` as a value     | **forbidden**                            |
| `undefined` inside a patch | reserved to mean **delete the property** |

The reason is that the two serialization paths disagree:

```ts
JSON.parse(JSON.stringify({ a: undefined })); // {} — the key disappears
structuredClone({ a: undefined }); // { a: undefined } — the key survives
```

Optional properties themselves are harmless (the key simply isn't there), so they are
allowed. Only "key present, value `undefined`" breaks, and only that is forbidden.

With `exactOptionalPropertyTypes` off, the language has no way to distinguish
`{ a?: string }` from `{ a?: string | undefined }`, so `undefined` leaks in without a
cast. **That is why EOPT: true is strongly recommended** — though not required. Even
when it does leak, the default `equals` ignores keys whose value is `undefined`, which
makes the divergence between the two paths unobservable.

`undefined` seeps in from everywhere in TypeScript (`Array.prototype.find`, `Map.get`,
`noUncheckedIndexedAccess`, code generators, form libraries). **Normalize at the
boundary with `?? null`.**

## Construct in normal form

> Construct your Vals in normal form. Equality is defined structurally.

```ts
export type Email = Val<"Email", string>;

export const Email = Val.companion<Email>().implSeal(
  (s, seal) => seal(s.trim().toLowerCase()), // ← normalize here
);
```

`equals` can be overridden, but the override **only applies to top-level comparisons,
never when a parent compares its children.** The brand is phantom, so a parent's default
deep equals looks at the child value and cannot tell that it is an `Email`.

```ts
Order.equals(o1, o2); // the Money inside is compared generically, not via Money.equals
```

No implementation trick avoids this: it is the structural trade-off between "zero
runtime cost" and "runtime polymorphism". **Normalize in the seal and structural equality
becomes correct on its own**, so the constraint pushes you toward the right design.

The default `equals`:

- compares structurally and deeply
- is **independent of key order**
- **ignores keys whose value is `undefined`** (`{ a: undefined }` equals `{}`)
- treats `NaN` as equal to `NaN`, and `-0` as equal to `0`

An override receives it as a third argument, so it can fall back to it:

```ts
// Published docs are identified by id; drafts have no stable one.
const Doc = Val.sealer<Doc>().impl({
  equals: (a, b, deepEquals) => (a.id.startsWith("draft:") ? deepEquals(a, b) : a.id === b.id),
});

Doc.equals(a, b); // callers still pass two — the third is bound
```

That argument is the structural comparison, not "the `equals` you are overriding", so it
does not reach a nested Val's own `equals` either. It is handed over here rather than
exported, which keeps the fallback where it is meaningful: as a free function it would
be a silent way past any type's `equals`.

## Smart constructors

A payload becomes a value by being **sealed**. `Val.sealer` is the default seal — brand
the payload and copy it. `Val.companion` is the same shape minus the constructor, and
`.implSeal` replaces that seal with your own. The default one comes in as a second
parameter, so you seal without naming the type again:

```ts
export type Age = Val<"Age", number>;

export const Age = Val.companion<Age>().implSeal((n, seal): Result<Age> =>
  n >= 0 && Number.isInteger(n) ? ok(seal(n)) : err("age must be a non-negative integer"),
);

Age(30); // type error: this expression is not callable
Age.seal(30); // Result<Age>
```

Checking is one thing a seal may do; normalizing and wrapping in a `Result` are others.
What makes it the seal is that **every path to a value goes through it** — `with`,
`update` and `create` included — so nothing reaches a value without passing it.

Taking that second parameter is optional — a one-parameter seal is registered unchanged,
and `Val.of<Age>(n)` does the same job with the type argument spelled out. Callers pass
the payload either way.

The first parameter is deep-readonly, which is about what it _accepts_: a caller's plain
mutable object goes straight in, with no repacking. Normalize by deriving — `toSorted`,
a spread — and let the default seal you return through take ownership; that deep copy is the only
one on the path. (`seal` is about closing a payload into a value, not about `Object.seal`
— nothing is frozen at runtime.)

A seal must be **idempotent**: sealing a value's own payload has to give that value back.
Minting — a generated id, a timestamp — belongs in [`create`](#create) instead, or `with`
would mint a new id every time it re-seals.

The seal gets its own step rather than sitting in `.impl` because `.impl` fixes every
method's first parameter to the Val, and a seal's first parameter is the payload. `.impl`
declares `seal?: never` and `create?: never`, so writing one there is a type error rather
than a method that quietly never gets wired up.

There is no `.implSeal` on a sealer: a sealer **is** the default seal, and a second,
checked one beside it would be a hole straight past the first.

`.implSeal` is optional. A companion without one has no constructor at all, which is the
right shape when the values arrive from a boundary — a decoder, a database row, an
external API — and `Val.of` is where you seal them:

```ts
export type UserId = Val<"UserId", string>;

export const UserId = Val.companion<UserId>().impl({
  short(id) {
    return id.slice(0, 8);
  },
});

const id = Val.of<UserId>(row.user_id); // trusted at the boundary
```

Requiring `.implSeal` would close nothing — `Val.of` is public either way — and would
only invite a rubber-stamp `(v) => Val.of<V>(v)`, which reads like validation and is not.

Nothing is gated, and nothing inspects your methods for a magic `seal` key. Callability
is provenance: **a sealer is a constructor, so anything built from one stays callable,
and a companion built without one never was.** The plain constructor is not disabled —
it was never created.

**No `Result` type is provided.** neverthrow, Effect, fp-ts, or your own — all work. The
library simply propagates the seal's return type and never inspects its contents.

### `create`

Constructors that are not payload functions — several arguments, a generated id, a wire
format — are registered separately. A `create` builds a **payload**; the seal closes it:

```ts
export const User = Val.companion<User>()
  .implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f }))
  .implSeal((u): Result<User> => check(u));

User.create(fields); // Result<User> — create's payload, sealed
```

`create` therefore returns whatever the seal returns, and it is not a way past the seal.
The flip side is that a `create` cannot fail on its own: it has no `Result` to hand back,
because the library never inspects one. Put the checks in the seal (`seal(v: unknown)`
type-checks, so schema-style parsing fits), and keep anything that can fail while
_building_ the payload in an ordinary exported function.

There is no `.implCreate` on a sealer. A sealer is callable, so a `create` beside it would
narrow nothing — `Task.create({ title })` mints an id while `Task({ id: "forged", … })`
sits right next to it — and the name would promise a guarantee it cannot give. If you want
a multi-argument shorthand for a type with no invariants, export a function; if the minted
field must be safe, that type wants a companion.

## `with` / `update`

```ts
User.with(user, { name: "sue" });
// internally seal({ ...user, ...patch }) — deriving a value means sealing again
```

With a custom seal, `with` returns `ReturnType<typeof seal>` (e.g. `Result<User>`);
with the default one it returns the Val itself. **There is no hole through which `with`
bypasses the smart constructor.**

This is why a seal takes the whole payload — `with` has to be able to feed it one. A
constructor that does anything else is rejected where it is written, not at the `with`
that later needs it:

```ts
Val.companion<Point>().implSeal((x: number, y: number) => Val.of<Point>({ x, y }));
//                              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// not assignable to 'SealImpl<Point>' — a seal takes the whole payload
```

That one is a [`create`](#create).

| patch              | meaning         |
| ------------------ | --------------- |
| key omitted        | leave unchanged |
| `{ k: undefined }` | **delete**      |
| `{ k: value }`     | set             |

`undefined` sits outside the value space, which makes it the one available sentinel, and
that scarce slot goes to "delete" — the operation with no other way to express it. (Same
idea as JSON Merge Patch using `null` for deletion; valof allows `null` as a real value,
so it uses `undefined` instead.)

Accidental deletion is guarded in layers:

1. **`undefined` on a required key is a type error** (with EOPT: true)
2. deleting an optional key is a legitimate operation
3. with EOPT off, a result that breaks the invariant is still caught by the seal — it
   fails loudly rather than corrupting quietly

`with` and `update` are defaults, not fixtures: define either one in `.impl` and yours
wins, in the type as well as at runtime. It is also how a primitive Val — which has no
`with` by default — can get one.

Your override is handed the seal as a last parameter, the way an `equals` override is
handed the deep comparison. Use it rather than `Val.of`: a hand-written rebuild is the
one place that can step around the type's own seal, and the companion is still being
initialized, so `Point.seal(...)` is not in scope inside its own `.impl`.

```ts
const Point = Val.companion<Point>()
  .implSeal((p, seal) => seal({ x: Math.trunc(p.x), y: Math.trunc(p.y) }))
  .impl({
    with(p, patch: { x?: number; y?: number }, seal) {
      return seal({ ...p, ...patch });
    },
  });

Point.with(p, { x: 3.7 }); // callers pass two arguments; the seal truncates
```

Taking the seal is optional — a two-parameter override is published as it stands.

`with` only exists on object-shaped Vals. A `Val<"IsoDate", string>` has nothing to
patch, so its companion does not carry the method at all rather than offering one whose
argument is uninhabitable. `update` is still there — a primitive can perfectly well be
transformed into another one.

`update` is the function-based variant, deliberately **restricted to value → value**.
Allowing fallible transforms here would produce `Result<Result<...>>` when chained;
those belong in `with` plus your own `andThen`.

```ts
Age.update(age, (n) => n + 1); // Result<Age>
```

## Idiomatic patterns

### Map / Set

```ts
// Set
type Tags = Val<"Tags", Readonly<Record<string, true>>>;

// Map
type PriceTable = Val<"PriceTable", Readonly<Record<string, Money>>>;
```

Prefer `Record<K, true>` over `Record<K, null>`: with `true`, `if (s[key])` is already
the membership test. The record representation also means **structural equality is
exactly set equality** (an array representation would make `[1,2]` and `[2,1]` differ).
The default `equals` is key-order independent, so this works.

Caveats:

- **Numeric keys become strings through a JSON round trip.** For sets of numeric IDs,
  prefer `ReadonlyArray<number>`
- **Prototype-pollution keys** (`"__proto__"` / `"constructor"`). When keys come from
  user input, test membership with `Object.hasOwn`

### Schema validation

Validate in the seal, and every path to a value is validated with it — `with`, `update`
and `create` all route through it:

```ts
const schema = z.object({ id: z.string().uuid(), name: z.string().min(1) });

export type User = Val<"app/User", { id: string; name: string }>;

export const User = Val.companion<User>()
  .implSeal((input: unknown, seal): Result<User> => {
    const r = schema.safeParse(input);
    return r.success ? ok(seal(r.data)) : err(r.error.message);
  })
  .impl({
    greet(u) {
      return `Hi, ${u.name}`;
    },
  });

User.seal({ id, name: "bob" }); // Result<User>
User.with(user, { name: "sue" }); // Result<User> — sealed again
```

`unknown` is a fine parameter type here: a seal only has to _accept_ the payload.

**Decoding a wire format does not belong in the seal.** A seal takes a payload; a
function that takes a JSON string takes something else, and it can fail before there is
a payload at all — which a `create` cannot express. Keep it separate:

```ts
export const User = Val.companion<User>().implSeal((input: unknown, seal): Result<User> => …);

export function parseUser(json: string): Result<User> {
  return User.seal(JSON.parse(json));
}
```

If the values are already validated when they reach you — a decoder, a database row —
register no seal of your own and seal at the boundary with `Val.of`:

```ts
const rowSchema = z.object({ user_id: z.string().uuid() });

export function decodeUserRow(row: unknown): UserId {
  return Val.of<UserId>(rowSchema.parse(row).user_id);
}
```

The trade is that `with` and `update` then rebuild through the default seal, which
copies and checks nothing.
Choose it when the boundary is the only place the invariant can be checked.

### Fields the update path must not touch

An id minted inside the constructor, a `createdAt`, a version counter: `create` mints
them, the seal preserves them, and `.unpatchable` keeps the update path off them.

```ts
export type User = Val<"app/User", { id: string; name: string; email: string }>;

export const User = Val.companion<User>()
  .implCreate((f: Omit<SeedOf<User>, "id">) => ({ id: crypto.randomUUID(), ...f }))
  .implSeal((u, seal) => seal(normalize(u)))
  .unpatchable<"id">();

User.with(user, { name: "sue" }); // OK
User.with(user, { id: "forged" }); // type error
User.update(user, (u) => ({ name: u.name, email: u.email })); // id survives
User.update(user, (u) => ({ ...u, id: "forged" })); // type error
```

Both paths need covering — `update` hands back a payload, so narrowing `with` alone
would still leave `id` reachable. With keys declared unpatchable, `update`'s callback
returns only what is left and the rest is merged back on, so deleting an optional key
goes through `with(v, { k: undefined })` instead.

The keys are a type argument, so they do not exist at runtime. That makes this a
guarantee about the update path, not about the value: `user.id` is readable, `readonly`
is erased at runtime, and `Val.of<User>({ id: "forged", … })` still builds one. What you
get is that no ordinary update can move `id` — usually the thing you actually wanted. If
it must be unforgeable, `id` belongs outside the value.

### Dates

```ts
export type IsoDate = Val<"IsoDate", string>;

export const IsoDate = Val.companion<IsoDate>()
  .implSeal((s) => {
    /* validate */
  })
  .impl({
    toTemporal(d) {
      return Temporal.Instant.from(d);
    },
  });
```

Do the date arithmetic with whatever library you like (Temporal, date-fns, Luxon). The
value itself is an ISO 8601 string or epoch ms.

## Deliberately not provided

All of it follows from the one line: values are plain data.

|                                          | why                                                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A constructor gate                       | unnecessary once the constructor comes from `Val.sealer`: don't create one and there is nothing to bypass                         |
| Runtime `freeze`                         | constructors copy, which closes the aliasing hole; what freeze adds on top needs a deliberate write past `readonly`               |
| `Map` / `Set`                            | they don't survive JSON, and `structuredClone` breaks reference identity of keys                                                  |
| `Date` / `Temporal`                      | incompatible with immutability and symmetric JSON round-tripping; wrapping them means writing a date library                      |
| TaggedEnum                               | the discriminant has to exist as real data, which breaks the phantom-brand premise; and ts-pattern already does the matching well |
| A `Result` type                          | plenty of good implementations exist, and `with` works without one                                                                |
| Dispatching to a child's custom `equals` | the type cannot be recovered from a value at runtime (see _Construct in normal form_)                                             |
| Free-function `Val.equals` / `Val.with`  | same reason; they live on the companion instead                                                                                   |

## API

|                                       |                                                          |
| ------------------------------------- | -------------------------------------------------------- |
| `Val<K, T>`                           | a branded value type                                     |
| `Val.of<V>(value)`                    | the default seal, with the type named explicitly         |
| `Val.unwrap(value)`                   | a mutable copy of the payload                            |
| `Val.sealer<V>()`                     | the default seal, carrying the default behaviour         |
| `Val.sealer<V>().impl(fns)`           | the constructor plus your functions                      |
| `Val.companion<V>().impl(fns)`        | behaviour only — no constructor                          |
| `Val.companion<V>().implSeal(f)`      | replaces the seal — payload in, value out                |
| `Val.companion<V>().implCreate(f)`    | registers `create`: any arguments, a payload out, sealed |
| `Val.companion<V>().unpatchable<K>()` | takes keys out of `with` / `update`                      |

Every companion carries `equals`, `with` and `update`. `equals` defaults to a structural
deep comparison, which is not exported on its own — an override receives it as a third
argument instead (see _Equality_).

Exported types, the ones you write yourself: `AnyVal` (a constraint over any Val),
`SeedOf` (what a value can be grown from — the payload as a constructor accepts it),
`Patch` (a `with` patch) and `PayloadOf` (the payload behind the brand).

`SeedOf<V>` is deep-readonly so that it accepts more, not to enforce anything —
constructors copy their argument regardless. Without it, deriving a value from an
existing Val, or from an `as const` literal, would not type-check.

The `-Of` marks a projection out of a Val, so `PayloadOf<V>` and `SeedOf<V>` take one.
`Patch<T>` takes a payload instead, which is what lets a custom `with` accept a patch
over a subset of the fields — how you keep a generated id out of one:

```ts
type Fields = Omit<SeedOf<Account>, "id">;

Val.companion<Account>()
  .implCreate((f: Fields) => ({ id: mint(), ...f }))
  .impl({
    with: (a, patch: Patch<Fields>, seal) => seal({ ...a, ...patch }), // id is not patchable
  });
```

Exported types you never write, but your own `.d.ts` will reference if you re-export a
companion: `Sealer`, `Sealed`, `Companion` and `CompanionBuilder`.

Everything else is internal. `Primitive`, `Validate`, `DeepReadonly`, `OptionalKeys` and
`Invalid` only ever appear inside a resolved `Val<K, T>` — `Invalid<"...">` still shows
up by name in the diagnostics above. `.impl`, `.implSeal` and `.implCreate` type their
arguments contextually, so there is no need to spell `CompanionMethods` or `SealImpl`
either.

## Development

```bash
vp install   # install dependencies
vp test      # run the tests
vp check     # format, lint, type check
vp pack      # build
```

## License

MIT
