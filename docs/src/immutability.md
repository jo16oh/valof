# Immutability

`Readonly<T>` only protects the top-level properties. It also cannot prevent a value from changing
through the original reference:

```ts
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

## With Valof

Vals are immutable. Their types are deeply readonly, and their constructors deep-copy their inputs:

```ts
import { Val } from "valof";

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
type Post = Val<"Post", { tags: string[] }>;

declare const post: Post;
post.tags.push("typescript"); // type error: tags is readonly
```

`readonly` exists only in the type system. In development, Valof also freezes values, so a write
that uses a cast to bypass the type throws where it happens. Production builds skip the freeze.

Only primitives, arrays and plain objects can live inside a Val. See
[Allowed types](allowed-types.md).
