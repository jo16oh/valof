# Equality

The default `equals`:

- compares structurally and deeply
- is **independent of key order**
- **ignores keys whose value is `undefined`** (`{ a: undefined }` equals `{}`)
- treats `NaN` as equal to `NaN`, and `-0` as equal to `0`

It can be overridden, but the override **only applies to top-level comparisons, never when a parent
compares its children.** The brand is phantom, so a parent's deep equals sees the child value and
cannot tell that it is an `Email`.

```ts
Order.equals(o1, o2); // the Money inside is compared generically, not via Money.equals
```

An override receives the structural comparison as a third argument and can fall back to it:

```ts
// Published docs are identified by id; drafts have no stable one.
const Doc = Val.sealer<Doc>().implEquals((a, b, deepEquals) =>
  a.id.startsWith("draft:") ? deepEquals(a, b) : a.id === b.id,
);
```

That argument is the structural comparison, not "the `equals` you are overriding", so it does not
reach a nested Val's own `equals` either.

Where the parent only needs a few children compared differently, `.implEquals` takes a spec instead
of a function. Keys it does not name keep the structural default, so unrelated ones stay out of it.

```ts
const Order = Val.sealer<Order>().implEquals({
  total: Money, // hand over the companion: `Money.equals` is used
  email: Email, // works for a child with a primitive payload too
  lines: [OrderLine], // brackets compare element by element
  shipping: { zip: Zip }, // a plain nested object: name only what is inside
  span: [undefined, Money], // a tuple compares by position, all of them
  updatedAt: () => true, // out of the comparison
});
```

The spec stops at a nested Val: hand over its companion rather than walking its payload, which would
bypass the equality that type declared for itself.

[`valof-lint`](lint.md#valof-lint) reports a parent holding a Val whose own `equals` its spec says
nothing about.
