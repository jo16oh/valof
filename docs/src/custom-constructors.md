# Custom constructors

## Validate in the seal

Without `.implSeal`, a companion's `seal` accepts every payload allowed by the type. When
construction has rules of its own, replace it with `.implSeal`.

Write the checks directly in the seal:

```ts
import { Val } from "valof";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
declare function ok<T>(value: T): Result<T>;
declare function err(message: string): Result<never>;
// ---cut---
type Age = Val<"Age", number>;

const Age = Val.companion<Age>().implSeal((value, seal): Result<Age> =>
  value >= 0 && Number.isInteger(value)
    ? ok(seal(value))
    : err("age must be a non-negative integer"),
);
```

`.implSeal` receives the input and the default seal, and replaces the companion's `seal`. Return
through the default seal to brand and copy the payload. Callers keep writing `Age.seal`. Only the
return type changes:

```ts
import { Val } from "valof";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
declare function ok<T>(value: T): Result<T>;
declare function err(message: string): Result<never>;

type Age = Val<"Age", number>;
const Age = Val.companion<Age>().implSeal((value, seal): Result<Age> => ok(seal(value)));
// ---cut---
Age.seal(30); // Result<Age>
```

`Age.seal.nocopy(value)` runs exactly the same validation and normalization, but does not copy the
payload passed to the default `seal` inside the custom seal. Likewise, `create.nocopy(...args)`
reuses the registered create function and seal. Both carry the caller contract described in
[Immutability](immutability.md#avoiding-a-copy).

Valof provides no `Result` type. [neverthrow](https://github.com/supermacro/neverthrow),
[better-result](https://better-result.dev) and your own type all work. Valof propagates the seal's
return type without inspecting it.

A schema library can parse a wider input before calling the default seal:

```ts
import { Val, type SeedOf } from "valof";

type User = Val<"User", { id: string; name: string; email: string }>;
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
declare function ok<T>(value: T): Result<T>;
declare function err(message: string): Result<never>;

declare const z: {
  object(shape: Record<string, unknown>): {
    safeParse(
      input: unknown,
    ): { success: true; data: SeedOf<User> } | { success: false; error: unknown };
  };
  uuid(): unknown;
  string(): { min(length: number): unknown };
  email(): { toLowerCase(): unknown };
  prettifyError(error: unknown): string;
};
// ---cut---
const schema = z.object({ id: z.uuid(), name: z.string().min(1), email: z.email().toLowerCase() });

const User = Val.companion<User>().implSeal((input: object, seal): Result<User> => {
  const result = schema.safeParse(input);
  return result.success ? ok(seal(result.data)) : err(z.prettifyError(result.error));
});
```

The parameter takes `object` or `Record<string, unknown>`, not `unknown`. A seal takes the payload,
not a wire format.

The schema runs on every derivation, not just the first parse. Reject unknown keys yourself. A patch
is merged as given, so an undeclared key survives unless the seal removes it.

## Normalize in the seal

Normalize in the seal so equivalent inputs have the same canonical form:

```ts
import { Val } from "valof";
// ---cut---
type Email = Val<"Email", string>;

const Email = Val.companion<Email>().implSeal((value, seal) => seal(value.trim().toLowerCase()));
```

Canonical payloads make structural [`equals`](utilities.md#equals) match what equality means in your
domain.

## Generate fields with `create`

`create` builds a payload, then passes it to the seal:

```ts
import { Val, type SeedOf } from "valof";

type User = Val<"User", { id: string; name: string; email: string }>;
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
declare function ok<T>(value: T): Result<T>;
declare function err(message: string): Result<never>;

type Fields = Omit<SeedOf<User>, "id">;
declare function check(user: SeedOf<User>): Result<User>;
declare const fields: Fields;
// ---cut---
const User = Val.companion<User>()
  .implSeal((user): Result<User> => check(user))
  .implCreate((fields: Fields) => ({ id: crypto.randomUUID(), ...fields }));

User.create(fields); // Result<User>
```

**A seal must be idempotent.** `patch` on an object-shaped Val and any registered `create` pass
their payloads through your seal. Sealing a value's own payload must return that value. **Generate
an id or timestamp in `create`, not in `seal`**.

## Bypass the seal in `create`

A `create` whose payload the seal always accepts never fails, but it still returns the seal's
`Result` or `| undefined`. `.implCreate.noseal` bypasses the seal and returns the Val:

```ts
import { Val } from "valof";

declare const UUID: RegExp;
declare const input: string;
// ---cut---
type SessionId = Val<"SessionId", string>;

const SessionId = Val.companion<SessionId>()
  .implSeal((text, seal): SessionId | undefined => (UUID.test(text) ? seal(text) : undefined))
  .implCreate.noseal(() => crypto.randomUUID());

SessionId.create(); // SessionId
SessionId.seal(input); // SessionId | undefined
```

`.implCreate.noseal` takes no arguments. A payload that depends on arguments should pass through the
seal to be normalized. The function passed to `.noseal` must always return a canonical payload. In
production, `create` skips the custom seal. In development, it runs the seal and throws if the seal
rejects or normalizes the payload.

## Keep generated fields fixed

`create` can generate an id, a `createdAt` or a version counter. `.fixed` excludes those fields from
`patch`:

```ts
// @errors: 2353
import { Val, type SeedOf } from "valof";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
declare function ok<T>(value: T): Result<T>;
declare function err(message: string): Result<never>;

declare function normalize(user: SeedOf<User>): SeedOf<User>;
declare const user: User;
// ---cut---
type User = Val<"User", { id: string; name: string; email: string }>;

const User = Val.companion<User>()
  .fixed<"id">()
  .implSeal((user, seal) => seal(normalize(user)))
  .implCreate((fields: Omit<SeedOf<User>, "id">) => ({
    id: crypto.randomUUID(),
    ...fields,
  }));

User.patch(user, { name: "sue" }); // OK
User.patch(user, { id: "forged" }); // type error
```

Write the steps in this order: `.fixed` and `.private`, then `.implSeal`, then `.implCreate`.

The keys are a type argument, so they do not exist at runtime. This constrains `patch`, not the
value. `Val.of<User>({ id: "forged", … })` still builds one, and so does a patch typed `any`. If an
id must be unforgeable, it belongs outside the value.

## Hide `seal` or `create`

`.private` removes `seal`, `create` or both from the companion. Hide `seal` where every value must
come from `create`, so no caller supplies an id of their own:

```ts
// @errors: 2339
import { Val, type SeedOf } from "valof";

declare function normalize(user: SeedOf<User>): SeedOf<User>;
declare const fields: Omit<SeedOf<User>, "id">;
// ---cut---
type User = Val<"User", { id: string; name: string }>;

const User = Val.companion<User>()
  .private<"seal">()
  .implSeal((user, seal) => seal(normalize(user)))
  .implCreate((fields: Omit<SeedOf<User>, "id">) => ({ id: crypto.randomUUID(), ...fields }));

User.create(fields); // User
User.seal({ id: "forged", name: "bob" }); // type error
```

`patch` still passes through the seal. Like `.fixed`, `.private` takes a type argument and does
nothing at runtime, so `Val.of` still builds a value.

## Parse, don't validate

A validator checks its input but returns no more precise value:

```ts
declare function isValidAge(value: number): boolean;
declare const input: number;
// ---cut---
const valid = isValidAge(input); // boolean; input is still a number
```

The type records nothing that the validator learned. Each consumer must trust that the check ran or
repeat it. This spreads validation through processing code, an anti-pattern called shotgun parsing.

A parser instead turns less precise input into more precise output, or returns a failure:

```ts
import { Val } from "valof";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
declare function ok<T>(value: T): Result<T>;
declare function err(message: string): Result<never>;

type Age = Val<"Age", number>;
const Age = Val.companion<Age>().implSeal((value, seal): Result<Age> => ok(seal(value)));
declare const input: number;
// ---cut---
const result = Age.seal(input); // Result<Age>
```

`Age.seal` is that parser. Once a value has been successfully sealed as an `Age`, its type
guarantees that it is validated and normalized wherever it is passed, so downstream code does not
need to repeat either step. The seals in this chapter put
[**“parse, don't validate”**](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
into practice. They return a validated, canonical Val instead of returning facts about the input.
Parsing includes validation, but preserves its result in a more precise type. In Takuto Wada's
words,
[parse, don't **(just)** validate](https://speakerdeck.com/twada/growing-reliable-code-php-conference-fukuoka-2025?slide=101):
the `Age` type can now represent only valid ages. `create` and `patch` reuse the same parser.
