# Normalize in the seal

**Equality is structural, so normalize where values are made.**

```ts
export type Email = Val<"Email", string>;

export const Email = Val.companion<Email>().implSeal(
  (s, seal) => seal(s.trim().toLowerCase()), // ← normalize here
);
```

## With a schema library

Widen the parameter to `object` and a schema parses straight into the seal:

```ts
const schema = z.object({ id: z.uuid(), name: z.string().min(1), email: z.email().toLowerCase() });

export const User = Val.companion<User>().implSeal((input: object, seal): Result<User> => {
  const r = schema.safeParse(input);
  return r.success ? ok(seal(r.data)) : err(z.prettifyError(r.error));
});
```

The schema runs on every derivation, not just the first parse.
