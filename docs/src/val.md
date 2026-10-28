# Val

A Val is a branded, immutable type over plain data.

> For the problem that branding solves, see
> [TypeScript Problems Valof Addresses](typescript-problems.md#branding).

## Define branded types

`Val` takes the brand and the payload type:

```ts
import { Val } from "valof";

type UserId = Val<"UserId", string>;
type OrderId = Val<"OrderId", string>;
```

The brand is phantom. A `UserId` is still a string at runtime.

Name the brand after the type it brands: `type UserId = Val<"UserId", string>`. The
[`brand-mismatch`](linting.md#rules) lint rule reports when the names do not match.

## Construct values

`Val.companion` creates the type's companion. Its `seal` brands a payload:

```ts
// @errors: 2322
import { Val } from "valof";

type UserId = Val<"UserId", string>;
type OrderId = Val<"OrderId", string>;
// ---cut---
const UserId = Val.companion<UserId>().build();
const OrderId = Val.companion<OrderId>().build();

const userId = UserId.seal("u_1");
let orderId: OrderId;

orderId = userId; // type error: UserId is not an OrderId
orderId = "o_1"; // type error: a plain string is not an OrderId

type User = Val<"User", { name: string }>;
const User = Val.companion<User>().build();
const user = User.seal({ name: "alice" });

// @ts-expect-error spread drops the brand
const changed: User = { ...user, name: "bob" };
const resealed = User.seal({ ...user, name: "bob" });
```

Name the companion after its type: `const UserId = Val.companion<UserId>().build()`. TypeScript lets
the type and value share a name. The [`companion-mismatch`](linting.md#rules) lint rule reports when
they do not match.
