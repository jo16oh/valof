# Utilities

## `Val.of`

Brands a payload with the type named explicitly.

```ts
Val.of<User>({ id: "a", name: "alice" });
```

If the type has a `seal` of its own, use that instead. `Val.of` skips the checks as an escape hatch.
[`valof-lint`](lint.md#valof-lint) reports latent misuse of it, such as calling `Val.of` on a type
that has a companion or specifying no type.

## `Val.unwrap`

A plain, mutable deep copy of the payload, for handing to code that does not know about `readonly`.
It strips the brand as well.

```ts
const post = Post({ title: "t", tags: ["a"] });

post.tags.sort(); // ✗ readonly string[] has no sort
Val.unwrap(post).tags.sort(); // ✓
```
