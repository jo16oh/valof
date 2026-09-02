# valof

> **Values are plain data; behaviour lives outside them.**

Value-object helpers for TypeScript: branded types, plus a companion that holds the
behaviour attached to a type. Values stay **plain objects, arrays and primitives** —
no classes, no prototypes.

```bash
npm install valof
```

## What you get

Because values are plain, the following all hold:

- they survive `structuredClone`
- they round-trip symmetrically through `JSON.stringify` / `JSON.parse`
- they can sit directly in React state or a Redux store
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
other input are not methods on a value: the smart constructor goes to
[`.implFrom`](#smart-constructors), and anything beyond it is an ordinary exported
function.

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
keys, though, so they do appear in `keyof YourVal`. Reach for `PayloadOf<V>` or `Seed<V>` when you want the
payload's keys alone.

### `Val.of`

Use it inside custom constructors to avoid `as` casts.

```ts
Val.of<User>({ id: "a", name: "alice" });
```

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
value from another: `Seed<V>` already accepts a Val, so `Val.of` and `with` take one
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

A type that violates the rules resolves to one containing `Invalid<"...">`, which fails
with the reason the moment you hand it to `Val.of` / `Val.companion`:

```ts
type Bad = Val<"Bad", { nickname: string | undefined }>;
Val.companion<Bad>();
//            ~~~
// Property '[__brand]' is missing in type
//   '{ nickname: Invalid<"required property cannot be undefined; use null or make it optional"> }'
// but required in type 'AnyVal'.
```

### The migration friction

Plain nested objects from API responses or existing code cannot be passed straight
through: you have to assemble the child Vals inside `from`. That is intentional — it
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

export const Email = Val.companion<Email>().implFrom(
  (s: string) => Val.of<Email>(s.trim().toLowerCase()), // ← normalize here
);
```

`equals` can be overridden, but the override **only applies to top-level comparisons,
never when a parent compares its children.** The brand is phantom, so a parent's default
deep equals looks at the child value and cannot tell that it is an `Email`.

```ts
Order.equals(o1, o2); // the Money inside is compared generically, not via Money.equals
```

No implementation trick avoids this: it is the structural trade-off between "zero
runtime cost" and "runtime polymorphism". **Normalize in `from` and structural equality
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

To make validation unskippable, build the value with `Val.companion`, which is the same
shape as `Val.sealer` minus the constructor. `.implFrom` registers the smart constructor;
use `Val.of` inside it to lift the validated value:

```ts
export type Age = Val<"Age", number>;

export const Age = Val.companion<Age>().implFrom((n: number): Result<Age> =>
  n >= 0 && Number.isInteger(n) ? ok(Val.of<Age>(n)) : err("age must be a non-negative integer"),
);

Age(30); // type error: this expression is not callable
Age.from(30); // Result<Age>
```

`from` gets its own step rather than sitting in `.impl` because `.impl` fixes every
method's first parameter to the Val, and a smart constructor's first parameter is
whatever it parses. `.impl` declares `from?: never`, so writing one there is a type
error rather than a method that quietly never gets wired up.

There is no `.implFrom` on a sealer: a smart constructor sitting next to a plain
constructor would be a hole straight past it.

`.implFrom` is optional. A companion without one has no constructor at all, which is the
right shape when the values arrive from a boundary — a decoder, a database row, an
external API — and `Val.of` is where you lift them:

```ts
export type UserId = Val<"UserId", string>;

export const UserId = Val.companion<UserId>().impl({
  short(id) {
    return id.slice(0, 8);
  },
});

const id = Val.of<UserId>(row.user_id); // trusted at the boundary
```

Requiring `.implFrom` would close nothing — `Val.of` is public either way — and would
only invite a rubber-stamp `from: (v) => Val.of<V>(v)`, which reads like validation and
is not.

Nothing is gated, and nothing inspects your methods for a magic `from` key. Callability
is provenance: **a sealer is a constructor, so anything built from one stays callable,
and a companion built without one never was.** The plain constructor is not disabled —
it was never created.

**No `Result` type is provided.** neverthrow, Effect, fp-ts, or your own — all work. The
library simply propagates `from`'s return type and never inspects its contents.

## `with` / `update`

```ts
User.with(user, { name: "sue" });
// internally from({ ...user, ...patch }) — from is always applied when present
```

When `from` is defined, `with` returns `ReturnType<typeof from>` (e.g. `Result<User>`);
otherwise it returns the Val itself. **There is no hole through which `with` bypasses
the smart constructor.**

This is the one place `from` keeps a special meaning, and it is why `from` is reserved
for one job: **taking a whole payload and revalidating it.** A constructor that does
anything else is rejected where it is written, not at the `with` that later needs it:

```ts
Val.companion<Point>().implFrom((x: number, y: number) => Val.of<Point>({ x, y }));
//                              ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// not assignable to 'Revalidator<Point>' — a `from` takes the whole payload
```

That one is a [`create`](#create-vs-from).

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
3. with EOPT off, a result that breaks the invariant is still caught by `from` — it
   fails loudly rather than corrupting quietly

`with` and `update` are defaults, not fixtures: define either one in `.impl` and yours
wins, in the type as well as at runtime. That is the escape hatch the message above points
at, and it is also how a primitive Val — which has no `with` by default — can get one:

```ts
const Point = Val.companion<Point>()
  .implFrom(make)
  .impl({
    with(p, patch: { x?: number; y?: number }): Point {
      return make(patch.x ?? p.x, patch.y ?? p.y);
    },
  });
```

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

Validate in `from`, and the whole update path is validated with it — `with` and `update`
both route through it:

```ts
const schema = z.object({ id: z.string().uuid(), name: z.string().min(1) });

export type User = Val<"app/User", { id: string; name: string }>;

export const User = Val.companion<User>()
  .implFrom((input: unknown): Result<User> => {
    const r = schema.safeParse(input);
    return r.success ? ok(Val.of<User>(r.data)) : err(r.error.message);
  })
  .impl({
    greet(u) {
      return `Hi, ${u.name}`;
    },
  });

User.from({ id, name: "bob" }); // Result<User>
User.with(user, { name: "sue" }); // Result<User> — revalidated
```

`unknown` is a fine parameter type here: a `from` only has to _accept_ the payload.

**Decoding a wire format does not belong in `from`.** `from` takes a payload; a function
that takes a JSON string is a `create`, and a companion whose only constructor is a
`create` has no `with`. Keep them separate:

```ts
export const User = Val.companion<User>().implFrom((input: unknown): Result<User> => …);

export function parseUser(json: string): Result<User> {
  return User.from(JSON.parse(json));
}
```

If the values are already validated when they reach you — a decoder, a database row —
register no constructor at all and lift at the boundary:

```ts
const rowSchema = z.object({ user_id: z.string().uuid() });

export function decodeUserRow(row: unknown): UserId {
  return Val.of<UserId>(rowSchema.parse(row).user_id);
}
```

The trade is that `with` and `update` then rebuild by copying and revalidate nothing.
Choose it when the boundary is the only place the invariant can be checked.

### Fields the update path must not touch

An id minted inside the constructor, a `createdAt`, a version counter: `create` produces
them, `from` preserves them, and narrowing the patch keeps `with` off them.

```ts
export type User = Val<"app/User", { id: string; name: string; email: string }>;
type Fields = Omit<Seed<User>, "id">;
type NoExtra<T, S> = T & Record<Exclude<keyof T, keyof S>, never>;

export const User = Val.companion<User>()
  .implCreate((f: Fields): User => Val.of<User>({ id: crypto.randomUUID(), ...f }))
  .implFrom((u: Seed<User>): User => Val.of<User>(u))
  .impl({
    with(u, patch: Patch<Fields>): User {
      return Val.of<User>({ ...u, ...patch });
    },
    update<T extends Fields>(u: User, fn: (value: User) => NoExtra<T, Fields>): User {
      return Val.of<User>({ ...u, ...fn(u) });
    },
  });

User.with(user, { name: "sue" }); // OK
User.with(user, { id: "forged" }); // type error
User.update(user, (u) => ({ ...u, id: "forged" })); // type error
```

Cover both paths — `update` hands back a whole payload, so narrowing `with` alone still
leaves `id` reachable.

`update` needs the `NoExtra` detour because the obvious version does not work:

```ts
update(u, fn: (value: User) => Fields): User { … }
User.update(user, (u) => ({ ...u, id: "forged" })); // no error!
```

Excess-property checking only fires when an object literal is matched against its target
directly. With no return annotation on the callback, TypeScript first infers its return
type from the body and then checks function assignability, by which point the literal is
no longer fresh and the extra key is simply ignored. `NoExtra` sidesteps that by making
the extra key a structural error — `T` is inferred as what the callback actually returns,
and every key outside `Fields` is mapped to `never`.

(Writing the constraint as `T extends NoExtra<T, Fields>` looks tidier but is TS2313, a
circular constraint. It has to sit in the parameter type.)

Even so, this is **not** privacy. `user.id` is readable, `readonly` is erased at runtime, and
`Val.of<User>({ id: "forged", … })` still builds one. What you get is that no ordinary
update can move `id` — which is usually the thing you actually wanted. If it must be
unforgeable, `id` belongs outside the value.

### Dates

```ts
export type IsoDate = Val<"IsoDate", string>;

export const IsoDate = Val.companion<IsoDate>()
  .implFrom((s: string) => {
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

|                                    |                                                 |
| ---------------------------------- | ----------------------------------------------- |
| `Val<K, T>`                        | a branded value type                            |
| `Val.of<V>(value)`                 | lifts a raw value into a Val, copying it        |
| `Val.unwrap(value)`                | a mutable copy of the payload                   |
| `Val.sealer<V>()`                  | the constructor, carrying the default behaviour |
| `Val.sealer<V>().impl(fns)`        | the constructor plus your functions             |
| `Val.companion<V>().impl(fns)`     | behaviour only — no constructor                 |
| `Val.companion<V>().implFrom(f)`   | registers the payload revalidator as `from`     |
| `Val.companion<V>().implCreate(f)` | registers a free-form constructor as `create`   |

Every companion carries `equals`, `with` and `update`. `equals` defaults to a structural
deep comparison, which is not exported on its own — an override receives it as a third
argument instead (see _Equality_).

Exported types, the ones you write yourself: `AnyVal` (a constraint over any Val),
`Seed` (what a value can be grown from — the payload as a constructor accepts it),
`Patch` (a `with` patch) and `PayloadOf` (the payload behind the brand).

`Seed<V>` is deep-readonly so that it accepts more, not to enforce anything —
constructors copy their argument regardless. Without it, deriving a value from an
existing Val, or from an `as const` literal, would not type-check.

Exported types you never write, but your own `.d.ts` will reference if you re-export a
companion: `Sealer`, `Sealed`, `Companion` and `CompanionBuilder`.

Everything else is internal. `Primitive`, `Validate`, `DeepReadonly`, `OptionalKeys` and
`Invalid` only ever appear inside a resolved `Val<K, T>` — `Invalid<"...">` still shows
up by name in the diagnostics above. `.impl` and `.implFrom` type their arguments
contextually, so there is no need to spell `CompanionMethods` or `Revalidator` either.

## Development

```bash
vp install   # install dependencies
vp test      # run the tests
vp check     # format, lint, type check
vp pack      # build
```

## License

MIT
