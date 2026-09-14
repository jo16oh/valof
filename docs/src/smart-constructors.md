# Smart constructors

**Sealing** turns a payload into a value. `Val.sealer` is the default seal: brand the payload and
copy it. `Val.companion` is the same shape minus the constructor, and `.implSeal` replaces that seal
with your own. The default one is passed as a second parameter, so you seal without naming the type
again:

```ts
export type Age = Val<"Age", number>;

export const Age = Val.companion<Age>().implSeal((n, seal): Result<Age> =>
  n >= 0 && Number.isInteger(n) ? ok(seal(n)) : err("age must be a non-negative integer"),
);

Age(30); // type error: this expression is not callable
Age.seal(30); // Result<Age>
```

**No `Result` type is provided.** [neverthrow](https://github.com/supermacro/neverthrow),
[better-result](https://better-result.dev) or your own all work: the seal's return type is
propagated, never inspected.

**Every path to a value goes through `seal`**, including `patch` and `create`.

A seal must be **idempotent**: sealing a value's own payload has to give that value back. Generating
something new, such as an id or a timestamp, belongs in [`create`](smart-constructors.md#create)
instead; otherwise `patch` would produce a new id every time it re-seals.

Nothing copies on input, so normalize without mutating the caller's object: derive a new one with
`toSorted` or a spread. Return through the `seal` passed as the second parameter: that is what
brands the value and deep-copies it.

Unknown keys are yours to reject. A patch is merged as given, so a key the payload does not declare
survives into the value unless the seal drops it.

## `create`

A `create` builds a payload; the seal makes it a value:

```ts
export const User = Val.companion<User>()
  .implCreate((f: Fields) => ({ id: crypto.randomUUID(), ...f }))
  .implSeal((u): Result<User> => check(u));

User.create(fields); // Result<User> — create's payload, sealed
```

Put the checks in the seal.
