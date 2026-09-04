# Valof

> **Values are plain data; behaviour lives outside them.**

Value-object helpers for TypeScript: branded types, a constructor and a companion that
collects the functions for the type. Values stay **plain objects, arrays and primitives** —
no classes, no prototypes.

What you get:

- nominal typing with a phantom brand — nothing to pay at runtime
- no `as` cast anywhere in your code
- one place for a type's constructor and its functions
- symmetric JSON round trips
- interoperable with React / Svelte / Vue state

```bash
pnpm install valof
```

## Basics

```ts
import { Val } from "valof";

export type UserId = Val<"UserId", string>;
export type OrderId = Val<"OrderId", string>;

const UserId = Val.sealer<UserId>();
let orderId: OrderId;

orderId = UserId("u_1"); // type error: UserId is not an OrderId
orderId = "o_1"; // type error: a plain string is not an OrderId
```

Two Vals over the same payload are not interchangeable, and neither accepts a bare
string.

```ts
export type User = Val<"User", { id: string; name: string; nickname?: string }>;

export const User = Val.sealer<User>().impl({
  greet(u) {
    return `Hi, I'm ${u.name}.`; // u is User — the first parameter needs no annotation
  },
  label(u, sep: string) {
    return u.id + sep + u.name; // anything after the Val is yours to type
  },
});

const user = User({ id: "a", name: "bob" });
User.greet(user);
User.equals(user, User({ id: "a", name: "bob" })); // true
```

`Val.sealer<User>()` is the constructor, and `.impl({…})` collects the functions for that
type. Every function in `impl` must take its Val first. A sealer already carries
`equals`, `with` and `update`, which `.impl({…})` can override.

Only primitives, arrays and plain objects can live inside a Val. See
[Allowed types](#allowed-types).

**Name the brand after the type it brands.** Two Vals with the same brand string and the
same payload are silently assignable to each other. Where the same name lives in two
places, such as `Id` in two domains of a monorepo, prefix it with a namespace:
`"billing/Id"`.

### Constructors copy their argument

Constructors deep-copy what you pass them:

```ts
const raw = { id: "a", name: "alice" };
const user = User(raw);
raw.name = "mallory";
user.name; // "alice"
```

Values are not frozen. `readonly` is a promise in the type, not at runtime.

## Smart constructors

**Sealing** turns a payload into a value. `Val.sealer` is the default seal: brand the
payload and copy it. `Val.companion` is the same shape minus the constructor, and
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

**Every path to a value goes through `seal`**, including `with`, `update` and `create`.

Nothing copies on the way in, so normalize without mutating the caller's object: derive a
new one with `toSorted` or a spread. Return through the `seal` passed as the second
parameter: that is what brands the value and deep-copies it.

A seal must be **idempotent**: sealing a value's own payload has to give that value back.
Generating something new, such as an id or a timestamp, belongs in [`create`](#create)
instead; otherwise `with` would produce a new id every time it re-seals.

There is no `.implSeal` on a sealer. A sealer **is** the default seal. For a checked one,
use a companion.

**No `Result` type is provided.** [neverthrow](https://github.com/supermacro/neverthrow), [better-result](https://github.com/dmmulroy/better-result) or your own all work: the
seal's return type is propagated, never inspected.

### `create`

A `create` builds a payload; the seal makes it a value:

```ts
export const User = Val.companion<User>()
  .implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f }))
  .implSeal((u): Result<User> => check(u));

User.create(fields); // Result<User> — create's payload, sealed
```

Put the checks in the seal. Widen the parameter to `object` and a schema library can parse
straight into it.

**A seal cannot take a wire format.** `with` and `update` hand a payload back to it, so one
that expects a JSON string would break as soon as a value is derived from another. A
parameter that also accepts a string, `unknown` included, is a type error.

## Normalize in the seal

**Equality is structural, so normalize where values are made.**

```ts
export type Email = Val<"Email", string>;

export const Email = Val.companion<Email>().implSeal(
  (s, seal) => seal(s.trim().toLowerCase()), // ← normalize here
);
```

`equals` can be overridden, but the override **only applies to top-level comparisons,
never when a parent compares its children.** The brand is phantom, so a parent's deep
equals sees the child value and cannot tell that it is an `Email`.

```ts
Order.equals(o1, o2); // the Money inside is compared generically, not via Money.equals
```

The default `equals`:

- compares structurally and deeply
- is **independent of key order**
- **ignores keys whose value is `undefined`** (`{ a: undefined }` equals `{}`)
- treats `NaN` as equal to `NaN`, and `-0` as equal to `0`

An override receives the structural comparison as a third argument and can fall back to
it:

```ts
// Published docs are identified by id; drafts have no stable one.
const Doc = Val.sealer<Doc>().impl({
  equals: (a, b, deepEquals) => (a.id.startsWith("draft:") ? deepEquals(a, b) : a.id === b.id),
});
```

That argument is the structural comparison, not "the `equals` you are overriding", so it
does not reach a nested Val's own `equals` either.

## `with` / `update`

```ts
User.with(user, { name: "sue" });
User.update(user, (u) => ({ ...u, name: u.name.toUpperCase() }));
```

**Both go through the seal**, so they return what it returns.

| patch              | meaning         |
| ------------------ | --------------- |
| key omitted        | leave unchanged |
| `{ k: undefined }` | **delete**      |
| `{ k: value }`     | set             |

`undefined` on a required key is a type error with `exactOptionalPropertyTypes` on. With
it off, a patch that breaks the invariant is caught by the seal instead.

`with` and `update` are defaults you can replace: define either one in `.impl` and yours
wins, in the type as well as at runtime. It is also how a primitive Val, which has no
`with` by default, can get one. The seal comes in as a last parameter, since
`Point.seal(...)` is not in scope inside its own `.impl`:

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

`with` only exists on object-shaped Vals. A `Val<"UnixEpochMs", number>` has nothing to
patch, so its companion does not carry it at all. `update` is still there, and is
**restricted to value → value**.

```ts
Age.update(age, (n) => n + 1); // Result<Age>
```

### Fields the update path must not touch

An id generated inside the constructor, a `createdAt`, a version counter: `create`
produces them, the seal preserves them, and `.unpatchable` keeps the update path off
them.

```ts
export type User = Val<"User", { id: string; name: string; email: string }>;

export const User = Val.companion<User>()
  .implCreate((f: Omit<SeedOf<User>, "id">) => ({ id: crypto.randomUUID(), ...f }))
  .implSeal((u, seal) => seal(normalize(u)))
  .unpatchable<"id">();

User.with(user, { name: "sue" }); // OK
User.with(user, { id: "forged" }); // type error
User.update(user, (u) => ({ name: u.name, email: u.email })); // id survives
User.update(user, (u) => ({ ...u, id: "forged" })); // type error
```

With keys declared unpatchable, `update`'s callback returns only what is left and the rest
is merged back on, so deleting an optional key goes through `with(v, { k: undefined })`
instead.

The keys are a type argument, so they do not exist at runtime. This guarantees the update
path, not the value. `Val.of<User>({ id: "forged", … })` still builds one. No ordinary
update can move `id`, which is usually what you wanted. If it must be unforgeable, `id`
belongs outside the value.

## Allowed types

Only three things can live inside a Val:

|            |                                                                   |
| ---------- | ----------------------------------------------------------------- |
| Primitives | `string` / `number` / `boolean` / `bigint` / `null`               |
| Arrays     | `ReadonlyArray<allowed>`                                          |
| Objects    | `{ readonly k: allowed }`, or `Readonly<Record<string, allowed>>` |

A Val is itself one of these, so Vals nest.

`Date`, `Temporal`, `Map`, `Set` and functions cannot go in; see [Dates](#dates) and
[Map / Set](#map--set) for what to reach for instead. Nor can a class instance: one with
methods is a type error, and one without them is indistinguishable from a plain object to
TypeScript, so sealing it throws in a development build.

## Patterns

### Reusing a Val

`PayloadOf<V>` is the payload without the brand, so one type can build on another:

```ts
type SuperUser = Val<"SuperUser", PayloadOf<User> & { privileges: readonly string[] }>;
```

### Map / Set

Use an object's properties.

```ts
type Tags = Val<"Tags", Readonly<Record<string, true>>>; // a Set
type PriceTable = Val<"PriceTable", Readonly<Record<string, Money>>>; // a Map
```

Use `true` rather than `null` for a set, so `if (tags[key])` is the membership test. `equals`
ignores key order, so comparing two of them is set equality.

### Dates

```ts
export type UnixEpochMs = Val<"UnixEpochMs", number>;

export const UnixEpochMs = Val.sealer<UnixEpochMs>().impl({
  showLocal(d) {
    return Temporal.Instant.fromEpochMilliseconds(d).toLocaleString();
  },
});
```

## Utilities

### `Val.of`

Brands a payload with the type named explicitly.

```ts
Val.of<User>({ id: "a", name: "alice" });
```

Where the type has a `seal` of its own, use that instead. `Val.of` skips the checks: it is
the escape hatch.

### `Val.unwrap`

A plain, mutable deep copy of the payload, for handing to code that does not know about
`readonly`. It strips the brand as well.

```ts
const post = Post({ title: "t", tags: ["a"] });

post.tags.sort(); // ✗ readonly string[] has no sort
Val.unwrap(post).tags.sort(); // ✓
```

## API

|                                       |                                                                   |
| ------------------------------------- | ----------------------------------------------------------------- |
| `Val<K, T>`                           | a branded value type                                              |
| `Val.of<V>(value)`                    | the default seal, with the type named explicitly                  |
| `Val.unwrap(value)`                   | a mutable copy of the payload                                     |
| `Val.sealer<V>()`                     | the default seal, carrying `equals` / `with` / `update`           |
| `Val.sealer<V>().impl(fns)`           | the constructor plus your functions                               |
| `Val.companion<V>().impl(fns)`        | functions only — no constructor                                   |
| `Val.companion<V>().implSeal(f)`      | replaces the `seal`: a constructor that can validate inputs       |
| `Val.companion<V>().implCreate(f)`    | registers `create`: a constructor that generates values inside it |
| `Val.companion<V>().unpatchable<K>()` | takes keys out of `with` / `update`                               |
| `AnyVal`                              | a constraint over any Val                                         |
| `SeedOf<V>`                           | what a value can be grown from                                    |
| `PayloadOf<V>`                        | the payload behind the brand                                      |
| `Patch<T>`                            | a `with` patch, taken over a payload                              |
| `Sealer<V>`                           | what `Val.sealer<V>()` returns, never written                     |
| `Sealed<V, M>`                        | what its `.impl(fns)` returns, never written                      |
| `CompanionBuilder<V>`                 | what `Val.companion<V>()` returns, never written                  |
| `Companion<V, M>`                     | what its `.impl(fns)` returns, never written                      |

The last four are exported only so that your own `.d.ts` can name them when you re-export
a companion — there is no reason to import one yourself.

Every companion carries `equals`, `with` and `update` (see _Normalize in the seal_).

## Recommended tsconfig

- `strict` (the default from TypeScript 6 on)
- `exactOptionalPropertyTypes`

Without `exactOptionalPropertyTypes`, `{ a?: string }` also accepts `undefined`, and that
key is dropped when the value is serialized into JSON.

## Caveats

**Do not use Valof to build a library.** A companion's functions are not tree-shakeable,
and `Val` is itself a companion, so the import alone brings `sealer`, `companion`, `unwrap`
and everything they reach.

That matters in an app too: [Knip](https://knip.dev/) cannot tell you when a companion
function goes dead.

## Development

```bash
vp install   # install dependencies
vp test      # run the tests
vp check     # format, lint, type check
vp pack      # build
```

## License

MIT
