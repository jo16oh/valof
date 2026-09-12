# Basics

```ts
import { Val } from "valof";

export type UserId = Val<"UserId", string>;
export type OrderId = Val<"OrderId", string>;

const UserId = Val.sealer<UserId>();
let orderId: OrderId;

orderId = UserId("u_1"); // type error: UserId is not an OrderId
orderId = "o_1"; // type error: a plain string is not an OrderId
```

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
Every function in `impl` must take its Val first. A sealer already carries `equals`, `patch` and
`update`. Only `equals` can be replaced, through `.implEquals`.

Only primitives, arrays and plain objects can live inside a Val. See
[Allowed types](derivation.md#allowed-types).

**Name the brand after the type it brands**: `type UserId = Val<"UserId", string>`. Two Vals with
the same brand and the same payload are silently assignable to each other. Where the same name lives
in two domains of a monorepo, put a namespace in front, `type Id = Val<"billing/Id", string>`: only
the last segment has to match. [Linting](linting.md) reports a brand that does not.

## Constructors copy their argument

Constructors deep-copy what you pass them:

```ts
const raw = { id: "a", name: "alice" };
const user = User(raw);
raw.name = "mallory";
user.name; // "alice"
```

`readonly` is a promise in the type, not at runtime. **In development, values are frozen**, so a
write that uses a cast to bypass the type throws where it happens. A production build pays nothing:
the freeze is behind `process.env.NODE_ENV`, and `Object.isFrozen` is `false` there.

The copy stops at any node the library already owns, so **what you pay is set by the part you built
fresh**, not by the size of the value:

```ts
type City = Val<"City", { name: string; zip: string }>;

City({ ...raw, name: "Osaka" }); // every node is new: copies the whole payload
City.patch(city, { name: "Osaka" }); // the rest of the value is unchanged
```

So deriving a value copies only the path down to what changed, not the whole tree. The untouched
subtrees keep their reference identity, so anything comparing by reference, such as a React
dependency array, sees no change and skips its work. A patch that changes nothing hands the same
value back, which makes `patch` cheaper than the spread you would have written by hand.
