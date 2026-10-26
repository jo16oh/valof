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

const Age = Val.companion<Age>()
  .implSeal((value, seal): Result<Age> =>
    value >= 0 && Number.isInteger(value)
      ? ok(seal(value))
      : err("age must be a non-negative integer"),
  )
  .build();
```

`.implSeal` replaces the companion's `seal`. Return through the default seal, passed as its second
argument, to brand and copy the payload.

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

const User = Val.companion<User>()
  .implSeal((input: object, seal): Result<User> => {
    const result = schema.safeParse(input);
    return result.success ? ok(seal(result.data)) : err(z.prettifyError(result.error));
  })
  .build();
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

const Email = Val.companion<Email>()
  .implSeal((value, seal) => seal(value.trim().toLowerCase()))
  .build();
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
  .implCreate((fields: Fields) => ({ id: crypto.randomUUID(), ...fields }))
  .build();

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
  .implCreate.noseal(() => crypto.randomUUID())
  .build();

SessionId.create(); // SessionId
SessionId.seal(input); // SessionId | undefined
```

`.implCreate.noseal` takes no arguments. A payload that depends on arguments should pass through the
seal to be normalized. The function passed to `.noseal` must always return a canonical payload. In
production, `create` skips the custom seal. In development, it runs the seal and throws if the seal
rejects or normalizes the payload.

## Define other constructors with `implAssoc`

An `.impl` member takes the Val first. A function that builds the Val from something else, such as a
string or several other values, goes in `.implAssoc`:

```ts
import { Val } from "valof";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
declare function ok<T>(value: T): Result<T>;
declare function err(message: string): Result<never>;
declare const yens: readonly Yen[];
// ---cut---
type Yen = Val<"Yen", number>;

const Yen = Val.companion<Yen>()
  .implSeal((yen, seal): Result<Yen> =>
    Number.isSafeInteger(yen) && yen >= 0
      ? ok(seal(yen))
      : err("must be a non-negative safe integer"),
  )
  .implAssoc(({ seal }) => ({
    parse: (text: string): Result<Yen> =>
      /^¥\d+$/.test(text) ? seal(Number(text.slice(1))) : err("expected ¥ followed by digits"),
    sum: (yens: readonly Yen[]) => seal(yens.reduce((total, yen) => total + yen, 0)),
  }))
  .build();

Yen.parse("¥120"); // Result<Yen>
Yen.parse("¥99999999999999999"); // the seal's error: not a safe integer
Yen.sum(yens); // Result<Yen>
```

The function receives `seal`, `create` and `patch`, like the one passed to `.impl`. `seal` is the
companion's, so the custom seal checks what `parse` and `sum` build. Write `.implAssoc` after
`.implSeal` and `.implCreate`, any number of times.

Keep an invariant in the seal, and let a member only convert its input into a payload. `parse`
checks the string's format, and the seal checks the amount. A check written in a member does not run
when another path builds the value, such as `patch` on an object payload.

A member can be called with its first argument last, as an `.impl` member can with the value. One
taking no argument is called as it is. A member cannot have an optional, a default or a rest
parameter, and one referencing the companion annotates its return type.

## Restrict the companion with options

A list after the type in `Val.companion` restricts what the companion offers callers, in any
combination: `Val.companion<User, [PrivateSeal, Unpatchable<"id">]>()`.

The options are types, so they do not exist at runtime. They constrain the companion, not the value.
`Val.of<User>({ id: "forged", … })` still builds one, and so does a patch typed `any`. If an id must
be unforgeable, it belongs outside the value.

### Hide `seal` and `create`

`create` can generate an id. `PrivateSeal` removes `seal` from the companion, so a caller cannot
pass an id of their own:

```ts
// @errors: 2339
import { Val, type PrivateSeal } from "valof";
// ---cut---
type User = Val<"User", { id: string; name: string }>;

const User = Val.companion<User, [PrivateSeal]>()
  .implCreate((name: string) => ({ id: crypto.randomUUID(), name }))
  .build();

User.create("sue"); // User
User.seal({ id: "forged", name: "sue" }); // type error
```

`PrivateCreate` removes `create` from the companion. Use it when callers should build the type
through `seal` or other functions, not `create`. It protects no field, because the payload `create`
returns passes the seal.

The function passed to `impl`, `implTrait` and `implAssoc` still receives `seal` and `create`, so
the companion's own members can build the type.

### Exclude keys from `patch`

`Unpatchable` excludes keys from `patch`, so an id keeps the value `create` generated:

```ts
// @errors: 2353
import { Val, type Unpatchable } from "valof";

declare const user: User;
// ---cut---
type User = Val<"User", { id: string; name: string }>;

const User = Val.companion<User, [Unpatchable<"id">]>().build();

User.patch(user, { name: "sue" }); // OK
User.patch(user, { id: "forged" }); // type error
```

## Parse, don't validate

A validator checks its input but returns no more precise value:

```ts
declare function isValidInterval(text: string): boolean;
declare const input: string;
// ---cut---
const valid = isValidInterval(input); // boolean; input is still a string
```

The type records nothing that the validator learned. Each consumer must trust that the check ran or
repeat it. This spreads validation through processing code, an anti-pattern called shotgun parsing.

A parser instead turns less precise input into more precise output, or returns a failure. Parsing a
wire format into a Val takes two steps:

1. **Decode** the wire format into the payload's shape: `"1..10"` into `{ min: 1, max: 10 }`. An
   `.implAssoc` member does this.
2. **Seal** the payload into the Val: check the invariants, normalize, and brand. Only the seal does
   this, because `create`, `patch` and the `seal` passed to `.implAssoc` all call it.

`Interval.parse` takes both steps, and `create` and `patch` reach the same seal:

```ts
import { Val } from "valof";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
declare function ok<T>(value: T): Result<T>;
declare function err(message: string): Result<never>;
declare const interval: Interval;
// ---cut---
type Interval = Val<"Interval", { min: number; max: number }>;

const Interval = Val.companion<Interval>()
  .implSeal((interval, seal): Result<Interval> =>
    interval.min <= interval.max ? ok(seal(interval)) : err("min must not exceed max"),
  )
  .implCreate((size: number) => ({ min: 0, max: size }))
  .implAssoc(({ seal }) => ({
    parse: (text: string): Result<Interval> => {
      const match = /^(\d+)\.\.(\d+)$/.exec(text);
      return match
        ? seal({ min: Number(match[1]), max: Number(match[2]) })
        : err("expected min..max");
    },
  }))
  .build();

Interval.parse("1..10"); // Result<Interval>
Interval.parse("10..1"); // the seal's error
Interval.create(5); // Result<Interval>
Interval.patch(interval, { max: -1 }); // Result<Interval>
```

Once a value has been successfully sealed as an `Interval`, its type guarantees that it is validated
and normalized wherever it is passed, so downstream code does not need to repeat either step. The
seals in this chapter put
[**“parse, don't validate”**](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
into practice. They return a validated, canonical Val instead of returning facts about the input.
Parsing includes validation, but preserves its result in a more precise type. In Takuto Wada's
words,
[parse, don't **(just)** validate](https://speakerdeck.com/twada/growing-reliable-code-php-conference-fukuoka-2025?slide=101):
the `Interval` type can now represent only valid intervals. `create` and `patch` reuse the same
parser.
