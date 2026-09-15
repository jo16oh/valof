# Equality

Every sealer and companion has an `equals(a, b)` method. You do not need to implement one before
comparing values:

```ts
type User = Val<"User", { id: string; profile: { name: string } }>;
const User = Val.sealer<User>();

const a = User({ id: "a", profile: { name: "alice" } });
const b = User({ id: "a", profile: { name: "alice" } });

a === b; // false
User.equals(a, b); // true
User.equals(a, User({ id: "a", profile: { name: "bob" } })); // false
```

`Val.companion<V>()` provides the same method. Adding a custom seal, a creator or companion
functions does not remove it.

## Default equality

The default comparison:

- compares objects and arrays structurally and deeply
- compares array elements in order
- is independent of object key order
- ignores keys whose value is `undefined` (`{ a: undefined }` equals `{}`)
- treats `NaN` as equal to `NaN`, and `-0` as equal to `0`

## Custom equality

When different inputs mean the same value, prefer normalizing them in the seal. The stored values
then have one representation, and the default equality gives the right answer everywhere.

Use `.implEquals` when equality intentionally differs from the stored structure. It works on both
`Val.sealer` and `Val.companion`. The function receives the default structural comparison as a third
argument, so it can use the default for some values:

```ts
type Doc = Val<"Doc", { id: string; body: string }>;

// Published docs are identified by id; drafts have no stable one.
const Doc = Val.sealer<Doc>().implEquals((a, b, deepEquals) =>
  a.id.startsWith("draft:") ? deepEquals(a, b) : a.id === b.id,
);

Doc.equals(Doc({ id: "1", body: "before" }), Doc({ id: "1", body: "after" })); // true
Doc.equals(Doc({ id: "draft:1", body: "before" }), Doc({ id: "draft:1", body: "after" })); // false
```

### Nested Vals

A custom equality belongs to its companion. A parent's default equality does not discover it when
comparing a nested Val: the brand is phantom, so the parent sees only the child's data.

```ts
type Folder = Val<"Folder", { name: string; featured: Doc }>;
const Folder = Val.sealer<Folder>();

// `featured` is compared structurally here; `Doc.equals` is not called.
Folder.equals(
  Folder({ name: "work", featured: Doc({ id: "1", body: "before" }) }),
  Folder({ name: "work", featured: Doc({ id: "1", body: "after" }) }),
); // false
```

Pass a spec to the parent's `.implEquals` to opt into the child's equality:

```ts
const Folder = Val.sealer<Folder>().implEquals({
  featured: Doc,
});
```

The keys left out of the spec keep the structural default. A spec can also descend through plain
objects, use `[Doc]` for an array, or provide one entry per position in a tuple. At a nested Val,
pass its companion rather than descending into its payload.

The third `deepEquals` argument given to a custom function is also only the structural comparison;
it does not dispatch to a nested Val's custom equality.

[Linting](linting.md) reports a parent holding a Val with custom equality when the parent's spec
does not name it.
