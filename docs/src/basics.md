# Branding

Two values can have the same representation but different meanings:

```ts
type UserId = string;
type OrderId = string;

declare const userId: UserId;
let orderId: OrderId;

orderId = userId; // allowed: both types are string
```

A brand lets TypeScript distinguish them without changing their runtime representation.

## Define the types

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

A branded type normally needs a constructor that contains a type assertion:

```ts
const createUserId = (value: string): UserId => value as UserId;
```

This keeps assertions out of its callers, but every branded type needs the same constructor
boilerplate. `Val.sealer` supplies the constructor:

```ts
const UserId = Val.sealer<UserId>();
const OrderId = Val.sealer<OrderId>();

const userId = UserId("u_1");
let orderId: OrderId;

orderId = userId; // type error: UserId is not an OrderId
orderId = "o_1"; // type error: a plain string is not an OrderId
```

Name the constructor after its type: `const UserId = Val.sealer<UserId>()`. TypeScript lets the type
and value share a name. The [`companion-mismatch`](linting.md#rules) lint rule reports when they do
not match.
