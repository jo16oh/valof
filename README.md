# Valof

[![npm](https://img.shields.io/npm/v/valof.svg)](https://www.npmjs.com/package/valof)

> **Values are plain data; behaviour lives outside them.**

Value-object helpers for TypeScript: branded types, a constructor and a companion that collects the
functions for the type. Values stay **plain objects, arrays and primitives** — no classes, no
prototypes. Under 1 kB gzipped.

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

Two Vals over the same payload are not interchangeable, and neither accepts a bare string.

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

`Val.sealer<User>()` is the constructor, and `.impl({…})` collects the functions for that type.
Every function in `impl` must take its Val first. A sealer already carries `equals`, `with` and
`update`, which `.impl({…})` can override.

Only primitives, arrays and plain objects can live inside a Val. See
[Allowed types](#allowed-types).

**Name the brand after the type it brands.** Two Vals with the same brand string and the same
payload are silently assignable to each other. Where the same name lives in two places, such as `Id`
in two domains of a monorepo, prefix it with a namespace: `"billing/Id"`.

### Constructors copy their argument

Constructors deep-copy what you pass them:

```ts
const raw = { id: "a", name: "alice" };
const user = User(raw);
raw.name = "mallory";
user.name; // "alice"
```

`readonly` is a promise in the type, not at runtime. **In development, values are frozen**, so a
write that casts past the type throws where it happens. A production build pays nothing: the freeze
is behind `process.env.NODE_ENV`, and `Object.isFrozen` is `false` there.

The copy stops at any node the library already owns, so **what you pay is set by the part you built
fresh**, not by the size of the value:

```ts
type City = Val<"City", { name: string; zip: string }>;

City({ ...raw, name: "Osaka" }); // every node is new: copies the whole payload
City.with(city, { name: "Osaka" }); // the rest of the value comes back as it stands
```

So deriving a value copies only the path down to what changed, not the whole tree. The untouched
subtrees keep their reference identity, so anything comparing by reference, such as a React
dependency array, sees no change and skips its work. A patch that changes nothing hands the same
value back, which makes `with` cheaper than the spread you would have written by hand.

## Smart constructors

**Sealing** turns a payload into a value. `Val.sealer` is the default seal: brand the payload and
copy it. `Val.companion` is the same shape minus the constructor, and `.implSeal` replaces that seal
with your own. The default one comes in as a second parameter, so you seal without naming the type
again:

```ts
export type Age = Val<"Age", number>;

export const Age = Val.companion<Age>().implSeal((n, seal): Result<Age> =>
  n >= 0 && Number.isInteger(n) ? ok(seal(n)) : err("age must be a non-negative integer"),
);

Age(30); // type error: this expression is not callable
Age.seal(30); // Result<Age>
```

**No `Result` type is provided.** [neverthrow](https://github.com/supermacro/neverthrow),
[better-result](https://better-result.dev) or your own all work: the seal's return type is
propagated, never inspected.

**Every path to a value goes through `seal`**, including `with`, `update` and `create`.

A seal must be **idempotent**: sealing a value's own payload has to give that value back. Generating
something new, such as an id or a timestamp, belongs in [`create`](#create) instead; otherwise
`with` would produce a new id every time it re-seals.

Nothing copies on the way in, so normalize without mutating the caller's object: derive a new one
with `toSorted` or a spread. Return through the `seal` passed as the second parameter: that is what
brands the value and deep-copies it.

Unknown keys are yours to reject. A patch is merged as given, so a key the payload does not declare
survives into the value unless the seal drops it.

### `create`

A `create` builds a payload; the seal makes it a value:

```ts
export const User = Val.companion<User>()
  .implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f }))
  .implSeal((u): Result<User> => check(u));

User.create(fields); // Result<User> — create's payload, sealed
```

Put the checks in the seal.

## Normalize in the seal

**Equality is structural, so normalize where values are made.**

```ts
export type Email = Val<"Email", string>;

export const Email = Val.companion<Email>().implSeal(
  (s, seal) => seal(s.trim().toLowerCase()), // ← normalize here
);
```

### With a schema library

Widen the parameter to `object` and a schema parses straight into the seal:

```ts
const schema = z.object({ id: z.uuid(), name: z.string().min(1), email: z.email().toLowerCase() });

export const User = Val.companion<User>().implSeal((input: object, seal): Result<User> => {
  const r = schema.safeParse(input);
  return r.success ? ok(seal(r.data)) : err(z.prettifyError(r.error));
});
```

The schema runs on every derivation, not just the first parse: `with` and `update` go back through
the seal.

## Equality

The default `equals`:

- compares structurally and deeply
- is **independent of key order**
- **ignores keys whose value is `undefined`** (`{ a: undefined }` equals `{}`)
- treats `NaN` as equal to `NaN`, and `-0` as equal to `0`

It can be overridden, but the override **only applies to top-level comparisons, never when a parent
compares its children.** The brand is phantom, so a parent's deep equals sees the child value and
cannot tell that it is an `Email`.

```ts
Order.equals(o1, o2); // the Money inside is compared generically, not via Money.equals
```

An override receives the structural comparison as a third argument and can fall back to it:

```ts
// Published docs are identified by id; drafts have no stable one.
const Doc = Val.sealer<Doc>().impl({
  equals: (a, b, deepEquals) => (a.id.startsWith("draft:") ? deepEquals(a, b) : a.id === b.id),
});
```

That argument is the structural comparison, not "the `equals` you are overriding", so it does not
reach a nested Val's own `equals` either.

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

`undefined` on a required key is a type error with `exactOptionalPropertyTypes` on. With it off, a
patch that breaks the invariant is caught by the seal instead.

A patch reaches any depth, and only the keys it names change:

```ts
type City = Val<"City", { name: string; zip: string }>;
type Shop = Val<"Shop", { owner: { name: string; email: string }; city: City }>;

Shop.with(shop, { owner: { email: "e@example.com" } }); // the owner's name stays
Shop.with(shop, { city: City.with(shop.city, { name: "Osaka" }) }); // a Val is replaced, not patched
Shop.update(shop, (s) => ({ ...s, owner: newOwner })); // `with` merges, so it cannot shrink `owner`
```

A nested Val, an array and a primitive are replaced whole: a patch reaching inside a Val would build
a payload its own seal never saw. Derive it with its own `with`, which goes through that seal and
keeps the parts it did not touch.

`with` and `update` are defaults you can replace: define either one in `.impl` and yours wins, in
the type as well as at runtime. It is also how a primitive Val gets a `with`: it has nothing to
patch, so it carries none by default. The seal comes in as a last parameter, since `Point.seal(...)`
is not in scope inside its own `.impl`:

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

`update` is always there. **Its callback cannot fail**: it takes the value and returns a payload,
never a `Result`, or a chain of them would nest. Run a fallible transform yourself and hand the
outcome to `with`.

```ts
Age.update(age, (n) => n + 1); // Result<Age> — the seal's, not the callback's
```

### Fields the update path must not touch

An id generated inside the constructor, a `createdAt`, a version counter: `create` produces them,
the seal preserves them, and `.unpatchable` keeps the update path off them.

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

With keys declared unpatchable, `update`'s callback returns only what is left and the rest is merged
back on, so deleting an optional key goes through `with(v, { k: undefined })` instead.

The keys are a type argument, so they do not exist at runtime. This guarantees the update path, not
the value. `Val.of<User>({ id: "forged", … })` still builds one, and so does a patch typed `any`. No
ordinary update can move `id`, which is usually what you wanted. If it must be unforgeable, `id`
belongs outside the value.

## Allowed types

Only three things can live inside a Val:

|            |                                                                   |
| ---------- | ----------------------------------------------------------------- |
| Primitives | `string` / `number` / `boolean` / `bigint` / `null`               |
| Arrays     | `ReadonlyArray<allowed>`                                          |
| Objects    | `{ readonly k: allowed }`, or `Readonly<Record<string, allowed>>` |

A Val is itself one of these, so Vals nest.

Neither a class instance nor a function can go in. `Date`, `Temporal`, `Map` and `Set` are all
classes; see [Dates](#dates) and [Map / Set](#map--set) instead. TypeScript rejects them, on the
first use of the Val rather than on the `type` line.

A class of plain fields is the one TypeScript cannot distinguish from an object. Sealing one throws
in development. A production build skips that check and copies the own enumerable keys, so a `Date`
comes out as `{}`, and an instance keeps its fields but loses its prototype.

## Patterns

### Reusing a Val

`PayloadOf<V>` is the payload without the brand, so one type can build on another:

```ts
type SuperUser = Val<"SuperUser", PayloadOf<User> & { privileges: readonly string[] }>;
```

**In a field, write the Val itself:** `PayloadOf<Money>` there drops the brand, and with it
`Money`'s seal and its `equals`.

### Map / Set

Use an object's properties.

```ts
type Tags = Val<"Tags", Readonly<Record<string, true>>>; // a Set
type PriceTable = Val<"PriceTable", Readonly<Record<string, Money>>>; // a Map
```

Use `true` rather than `null` for a set, so `if (tags[key])` is the membership test. `equals`
ignores key order, so comparing two of them is set equality.

`with` reaches one entry at a time and `undefined` drops it; `update` rebuilds the whole table.

```ts
PriceTable.with(table, { apple: Money({ amount: 120, currency: "JPY" }), fig: undefined });

PriceTable.update(table, (t) =>
  // the value type is named because a Val carries its phantom keys in the type as well
  Object.fromEntries(Object.entries<Money>(t).filter(([, m]) => m.amount < 500)),
);
```

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

Where the type has a `seal` of its own, use that instead. `Val.of` skips the checks: it is the
escape hatch.

### `Val.unwrap`

A plain, mutable deep copy of the payload, for handing to code that does not know about `readonly`.
It strips the brand as well.

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

The last four are exported only so that your own `.d.ts` can name them when you re-export a
companion — there is no reason to import one yourself.

## TypeScript

**TypeScript 5.9 or later.**

Recommended compiler options:

- `strict` (the default from TypeScript 6 on)
- `exactOptionalPropertyTypes`

Without `exactOptionalPropertyTypes`, `{ a?: string }` also accepts `undefined`, and that key is
dropped when the value is serialized into JSON.

## Caveats

**Do not use Valof to build a library.** A companion's functions are not tree-shakeable, and `Val`
is itself a companion, so the import alone brings `sealer`, `companion`, `unwrap` and everything
they reach.

That matters in an app too: [Knip](https://knip.dev/) cannot tell you when a companion function goes
dead.

**A `__proto__` key survives.** It is a legal JSON key, and round trips come first, so sealing keeps
it as an own property rather than dropping data. That is inert inside a value, but not in code that
merges a payload with `Object.assign` or a recursive merge: there, assigning the key sets a
prototype instead of copying it. Sanitize untrusted input yourself.

**A deeply nested payload overflows the stack.** Copying and comparing are both recursive, so a
payload a few thousand levels deep, or a cyclic one, throws a `RangeError`. What you build yourself
never comes close; input parsed from a request can, so bound its depth before sealing it.

## Development

```bash
vp install   # install dependencies
vp test      # run the tests
vp check     # format, lint, type check
vp pack      # build
vp run size  # measure the bundle against its budget
```

## License

MIT
