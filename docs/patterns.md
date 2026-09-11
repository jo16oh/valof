# Patterns

## Reusing a Val

`PayloadOf<V>` is the payload without the brand, so one type can build on another:

```ts
type SuperUser = Val<"SuperUser", PayloadOf<User> & { privileges: readonly string[] }>;
```

**In a field, write the Val itself:** `PayloadOf<Money>` there drops the brand, and with it
`Money`'s seal and its `equals`.

## Map / Set

Use an object's properties.

```ts
type Tags = Val<"Tags", Readonly<Record<string, true>>>; // a Set
type PriceTable = Val<"PriceTable", Readonly<Record<string, Money>>>; // a Map
```

Use `true` rather than `null` for a set, so `if (tags[key])` is the membership test. `equals`
ignores key order, so comparing two of them is set equality.

`patch` reaches one entry at a time and `undefined` drops it; `update` rebuilds the whole table.

```ts
PriceTable.patch(table, { apple: Money({ amount: 120, currency: "JPY" }), fig: undefined });

PriceTable.update(table, (t) =>
  // the value type is named because a Val carries its phantom keys in the type as well
  Object.fromEntries(Object.entries<Money>(t).filter(([, m]) => m.amount < 500)),
);
```

## Dates

```ts
export type UnixEpochMs = Val<"UnixEpochMs", number>;

export const UnixEpochMs = Val.sealer<UnixEpochMs>().impl({
  showLocal(d) {
    return Temporal.Instant.fromEpochMilliseconds(d).toLocaleString();
  },
});
```

## Framework state

A value is a plain object, so a state container holds it as it stands. Replace it whole: the
untouched subtrees keep their identity, so a dependency array sees no change.

```ts
const [shop, setShop] = useState(Shop({ owner, city }));
setShop(Shop.patch(shop, { owner: { email: "e@example.com" } }));

useEffect(() => showMap(shop.city), [shop.city]); // the patch did not touch `city`: no re-run
```

Solid reads the same with `createSignal`, and takes the companion's comparison:
`createSignal(user, { equals: User.equals })`.

**Svelte and Vue are deeply reactive by default, so ask for a shallow container.** A deep one hands
your code a proxy in place of the value, and `patch` no longer recognizes the nodes it owns, so it
copies them again.

**Development hides this.** Values are frozen there, so Vue skips them and `ref` behaves like
`shallowRef` until you build for production. A write through Vue's `ref` or Solid's `createStore`
then mutates the value instead of throwing.

| framework |                                   |
| --------- | --------------------------------- |
| React     | `useState`                        |
| Solid     | `createSignal`, not `createStore` |
| Svelte 5  | `$state.raw`, not `$state`        |
| Vue       | `shallowRef`, not `ref`           |

## Crossing a serialization boundary

**Return the payload, not the value.** A generated client derives its response type from the
handler, so a Val there arrives on the other side already typed as one, without having passed
through the seal.

```ts
app.get("/user/:id", (c) => {
  const body: PayloadOf<User> = user; // the brand drops, the object is the same one
  return c.json(body);
});
```

Now the other side cannot use what arrives until it seals it:

```ts
const plain = await res.json(); // the generated client types this as PayloadOf<User>
const bad: User = plain; // type error: the brand is missing
const user = User(plain); // sealed, and now it is one
```

`PayloadOf<V>` removes the brand from the type, not from the value, so it costs nothing at run time.
`Val.unwrap` copies and drops `readonly` too, which a request body does not need.

Seal on the way in, because the two sides deploy separately: the value was sealed by whichever build
the server is running, and that seal may be older than yours.
