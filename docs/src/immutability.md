# Immutability

`Readonly<T>` only protects the top-level properties. It also cannot prevent a value from changing
through the original reference:

```ts
// @errors: 2540
// ---cut---
type Profile = Readonly<{
  name: string;
  address: { city: string };
}>;

const raw = { name: "alice", address: { city: "Osaka" } };
const profile: Profile = raw;

profile.name = "mallory"; // type error: the top-level property is readonly
profile.address.city = "Tokyo"; // allowed: Readonly is shallow
raw.name = "mallory"; // allowed: raw is still writable
```

A recursive readonly type prevents the nested write, but the original reference remains writable.
Keeping a value unchanged requires both deep readonly types and a copy at construction.

## Vals are immutable

Vals are immutable. Their types are deeply readonly, and their constructors deep-copy their inputs:

```ts
// @errors: 2540
import { Val } from "valof";

// ---cut---
type Profile = Val<"Profile", { name: string; address: { city: string } }>;
const Profile = Val.sealer<Profile>();

const raw = { name: "alice", address: { city: "Osaka" } };
const profile = Profile(raw);

profile.address.city = "Tokyo"; // type error: Vals are deeply readonly
raw.address.city = "Tokyo";
profile.address.city; // "Osaka"
```

Write the payload without `readonly`. `Val` makes it deeply readonly:

```ts
// @errors: 2339
import { Val } from "valof";
// ---cut---
type Post = Val<"Post", { tags: string[] }>;

declare const post: Post;
post.tags.push("typescript"); // type error: tags is readonly
```

`readonly` exists only in the type system. In development, Valof also freezes values, so a write
that uses a cast to bypass the type throws where it happens. Production builds skip the freeze.

Only primitives, arrays and plain objects can live inside a Val. See
[Allowed types](allowed-types.md).

## Avoiding a copy

Construction copies by default. Do not start with `.nocopy`; reserve it for a copy bottleneck that
profiling has confirmed.

<!-- prettier-ignore -->
> [!WARNING]
> `.nocopy` is an explicit escape hatch. You must ensure the value and everything inside it is
> stable plain data with no mutable aliases. If that is wrong, another reference can change a Val
> in production.
> Prefer the default copy whenever there is doubt.

Only when you can make that guarantee, use `.nocopy` to make the payload the value without copying:

```ts
import { Val } from "valof";

type Profile = Val<"Profile", { name: string; address: { city: string } }>;
const Profile = Val.sealer<Profile>();

const seed = { name: "alice", address: { city: "Osaka" } } as const;
const profile = Profile.nocopy(seed);
```

The common trap is a mutable alias behind a readonly view:

```ts
import { Val, type SeedOf } from "valof";

type Profile = Val<"Profile", { name: string; address: { city: string } }>;
const Profile = Val.sealer<Profile>();
// ---cut---

const mutable = { name: "alice", address: { city: "Osaka" } };
const seed: SeedOf<Profile> = mutable; // TypeScript permits this readonly view.
const profile = Profile.nocopy(seed);

// In production, this also changes `profile.address.city`.
// Development freezing normally makes this assignment throw instead.
mutable.address.city = "Tokyo";
```

`readonly` is only a guardrail: mutable views, casts, accessors and proxies can still break this
contract. Default sealers require deeply readonly input; `Val.of.nocopy<V>` and custom seals leave
the responsibility to their callers and implementations. Development validates and freezes the
payload graph; production trusts the contract. `patch` still copies.
