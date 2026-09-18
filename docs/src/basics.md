# Branding

> For the problem that branding solves, see
> [TypeScript problems Valof addresses](typescript-problems.md#branding).

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

`Val.sealer` supplies the constructor:

```ts
// @errors: 2322
import { Val } from "valof";

type UserId = Val<"UserId", string>;
type OrderId = Val<"OrderId", string>;
// ---cut---
const UserId = Val.sealer<UserId>();
const OrderId = Val.sealer<OrderId>();

const userId = UserId("u_1");
let orderId: OrderId;

orderId = userId; // type error: UserId is not an OrderId
orderId = "o_1"; // type error: a plain string is not an OrderId

type User = Val<"User", { name: string }>;
const User = Val.sealer<User>();
const user = User({ name: "alice" });

// @ts-expect-error spread drops the brand
const changed: User = { ...user, name: "bob" };
const resealed = User({ ...user, name: "bob" });
```

Name the constructor after its type: `const UserId = Val.sealer<UserId>()`. TypeScript lets the type
and value share a name. The [`companion-mismatch`](linting.md#rules) lint rule reports when they do
not match.
