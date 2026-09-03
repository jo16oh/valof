# valof

> **Values are plain data; behaviour lives outside them.**

Value-object helpers for TypeScript: branded types, a constructor, and a companion that
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

`Val.sealer<User>()` is the constructor, and `.impl({…})` collects the functions related to
that type. Every function in `impl` must take its Val first. A sealer already carries
`equals`, `with` and `update`, which `.impl({…})` can override.

Only primitives, other Vals, arrays and records can live inside a Val. See
[Allowed types](#allowed-types).

**Name the brand after the type it brands.** Two Vals with the same brand string and the
same payload are silently assignable to each other. So where the same name really does live
in two places, such as `Id` in two domains of a monorepo, prefix it with a namespace:
`"billing/Id"`.

### Constructors copy their argument

Constructors deep-copy what you pass them:

```ts
const raw = { id: "a", name: "alice" };
const user = User(raw);
raw.name = "mallory";
user.name; // "alice"
```

Values are not frozen, though: `readonly` is a promise in the type, not at runtime.

## Smart constructors

A payload becomes a value by being **sealed**. `Val.sealer` is the default seal: brand
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

**Every path to a value goes through `seal`**, including `with`, `update` and `create`.

A caller's plain mutable object goes straight in, so normalize without mutating it, with
`toSorted` or a spread. Return through the `seal` passed as the second parameter: that is
what brands the value and deep-copies it.

A seal must be **idempotent**: sealing a value's own payload has to give that value back.
Generating a value, such as an id or a timestamp, belongs in [`create`](#create) instead,
otherwise `with` would produce a new id every time it re-seals.

Constructors get their own steps. `.impl` declares `seal?: never` and `create?: never`, so
writing one there is a type error rather than a function that never gets wired up.

There is no `.implSeal` on a sealer. A sealer **is** the default seal. A type that needs a
checked one wants a companion.

**No `Result` type is provided.** neverthrow, better-result or your own all work: the
seal's return type is propagated, never inspected.

### `create`

Constructors that are not payload functions (several arguments, a generated id, a wire
format) are registered separately. A `create` builds a payload; the seal closes it:

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
narrow nothing — `Task.create({ title })` generates an id while `Task({ id: "forged", … })`
sits right next to it, and the name would promise a guarantee it cannot give. If you want
a multi-argument shorthand for a type with no invariants, export a function; if the
generated field must be safe, that type wants a companion.

## Construct in normal form

> Construct your Vals in normal form. Equality is defined structurally.

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

**Normalize in the seal and structural equality becomes correct on its own.**

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
does not reach a nested Val's own `equals` either.

## `with` / `update`

```ts
User.with(user, { name: "sue" });
// internally seal({ ...user, ...patch }) — deriving a value means sealing again
```

Both go through the seal, so they return what it returns: `Result<User>` with a custom
seal, the Val itself with the default one. Neither is a way around a smart constructor.

| patch              | meaning         |
| ------------------ | --------------- |
| key omitted        | leave unchanged |
| `{ k: undefined }` | **delete**      |
| `{ k: value }`     | set             |

`undefined` on a required key is a type error with `exactOptionalPropertyTypes` on. With
it off, a patch that breaks the invariant is caught by the seal instead.

`with` and `update` are defaults, not fixtures: define either one in `.impl` and yours
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

Taking the seal is optional: a two-parameter override is published as it stands.

`with` only exists on object-shaped Vals. A `Val<"IsoDate", string>` has nothing to
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

Both paths need covering: `update` hands back a payload, so narrowing `with` alone
would still leave `id` reachable. With keys declared unpatchable, `update`'s callback
returns only what is left and the rest is merged back on, so deleting an optional key
goes through `with(v, { k: undefined })` instead.

The keys are a type argument, so they do not exist at runtime. That makes this a
guarantee about the update path, not about the value: `user.id` is readable, `readonly`
is erased at runtime, and `Val.of<User>({ id: "forged", … })` still builds one. What you
get is that no ordinary update can move `id`, usually the thing you actually wanted. If
it must be unforgeable, `id` belongs outside the value.

## Allowed types

Only four things can live inside a Val:

|            |                                                     |
| ---------- | --------------------------------------------------- |
| Primitives | `string` / `number` / `boolean` / `bigint` / `null` |
| Other Vals | nesting always goes through a Val                   |
| Arrays     | `ReadonlyArray<allowed>`                            |
| Records    | `Readonly<Record<string, allowed>>`                 |

**Avoid nested plain objects — make the nesting a Val.** `Date`, `Temporal`, `Map`,
`Set`, functions and class instances cannot go in; see [Dates](#dates) and
[Map / Set](#map--set) for what to reach for instead.

Being made to compose Vals rather than nest object literals tends to produce better
aggregates than you would have reached for on your own.

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

`true` rather than `null` for a set, so `if (tags[key])` is the membership test. `equals`
ignores key order, which makes comparing two of these set equality.

### Validation

Validate in the seal, and every path to a value is validated with it — `with`, `update`
and `create` all route through it:

```ts
export type User = Val<"User", { id: string; name: string }>;

export const User = Val.companion<User>().implSeal((u, seal): Result<User> =>
  u.name.length > 0 ? ok(seal(u)) : err("name must not be empty"),
);

User.seal({ id, name: "bob" }); // Result<User>
User.with(user, { name: "sue" }); // Result<User> — sealed again
```

The parameter can be `unknown` instead, which is what lets a schema library parse
straight into the seal: a seal only has to _accept_ the payload.

**Decoding a wire format does not belong there.** A seal takes a payload, and a JSON
string is not one:

```ts
export function parseUser(json: string): Result<User> {
  return User.seal(JSON.parse(json));
}
```

### Dates

```ts
export type IsoDate = Val<"IsoDate", string>;

export const IsoDate = Val.companion<IsoDate>()
  .implSeal((s) => {
    /* validate */
  })
  .impl({
    showLocal(d) {
      return Temporal.Instant.from(d).toLocaleString();
    },
  });
```

Do the date arithmetic with whatever library you like (Temporal, date-fns, Luxon). The
value itself is an ISO 8601 string or epoch ms.

## Utilities

### `Val.of`

Brands a payload with the type named explicitly, for where a value has to be built and no
seal is in scope: a trusted boundary such as a decoder or a database row, or a companion
function returning a fresh value of its own type.

```ts
Val.of<User>({ id: "a", name: "alice" });
```

Where the type has a seal of its own, use that instead. `Val.of` closes the payload with
the default seal rather than the type's, which is to say it skips the checks: the escape
hatch, spelled with the type argument in plain sight.

### `Val.unwrap`

A plain, mutable copy of the payload, for handing to code that does not know about
`readonly`.

```ts
const post = Post({ title: "t", tags: ["a"] });

post.tags.sort(); // ✗ readonly string[] has no sort
Val.unwrap(post).tags.sort(); // ✓
```

It is **not** how you derive one value from another: `SeedOf<V>` already accepts a Val, so
`Val.of` and `with` take one directly and deep-copy once, where going through `unwrap`
deep-copies twice.

```ts
Post.with(post, { tags: [...post.tags, "b"] }); // ✓ one deep copy
Post.with(post, { tags: [...Val.unwrap(post).tags, "b"] }); // ✗ two
```

## API

|                                       |                                                          |
| ------------------------------------- | -------------------------------------------------------- |
| `Val<K, T>`                           | a branded value type                                     |
| `Val.of<V>(value)`                    | the default seal, with the type named explicitly         |
| `Val.unwrap(value)`                   | a mutable copy of the payload                            |
| `Val.sealer<V>()`                     | the default seal, carrying the defaults                  |
| `Val.sealer<V>().impl(fns)`           | the constructor plus your functions                      |
| `Val.companion<V>().impl(fns)`        | functions only — no constructor                          |
| `Val.companion<V>().implSeal(f)`      | replaces the seal — payload in, value out                |
| `Val.companion<V>().implCreate(f)`    | registers `create`: any arguments, a payload out, sealed |
| `Val.companion<V>().unpatchable<K>()` | takes keys out of `with` / `update`                      |
| `AnyVal`                              | a constraint over any Val                                |
| `SeedOf<V>`                           | what a value can be grown from                           |
| `PayloadOf<V>`                        | the payload behind the brand                             |
| `Patch<T>`                            | a `with` patch, taken over a payload                     |
| `Sealer<V>`                           | what `Val.sealer<V>()` returns, never written            |
| `Sealed<V, M>`                        | what its `.impl(fns)` returns, never written             |
| `CompanionBuilder<V>`                 | what `Val.companion<V>()` returns, never written         |
| `Companion<V, M>`                     | what its `.impl(fns)` returns, never written             |

The last four are exported only so that your own `.d.ts` can name them when you re-export
a companion — there is no reason to import one yourself.

Every companion carries `equals`, `with` and `update`. `equals` defaults to a structural
deep comparison, which is not exported on its own; an override receives it as a third
argument instead (see _Construct in normal form_).

## Recommended tsconfig

- `strict` (the default from TypeScript 6 on)
- `exactOptionalPropertyTypes`

Without `exactOptionalPropertyTypes`, `{ a?: string }` also accepts `undefined`, and that
key is dropped when the value is serialized into JSON.

## Caveats

**Do not build a library's public surface out of valof.** A companion's functions are
reached through the object rather than as exports, so a bundler keeps every one of them and
an unused-export check never reports one. `Val` is itself a companion, which means the
import alone brings `sealer`, `companion`, `unwrap` and everything they reach: a module
that calls only `Val.of` still carries the whole runtime.

In an app that is worth knowing, because nothing will tell you when a companion function
goes dead. In a published library your consumers carry it instead, so keep valof on the
inside and expose plain types and functions.

## Development

```bash
vp install   # install dependencies
vp test      # run the tests
vp check     # format, lint, type check
vp pack      # build
```

## License

MIT
