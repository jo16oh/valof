# Patterns

## Framework state

A value is a plain object, so a state container holds it as it stands. Replace it whole: the
untouched subtrees keep their identity, so a dependency array sees no change.

```ts
const [shop, setShop] = useState(Shop({ owner, city }));
setShop(Shop.patch(shop, { owner: { email: "e@example.com" } }));

useEffect(() => showMap(shop.city), [shop.city]); // the patch did not touch `city`: no re-run
```

Solid reads the same with `createSignal`, and takes the comparison directly:
`createSignal(user, { equals })`.

**Svelte and Vue are deeply reactive by default, so ask for a shallow container.** A deep one hands
your code a proxy in place of the value, and `patch` no longer recognizes the nodes it owns, so it
copies them again.

Values are frozen in development, so Vue skips them and `ref` behaves like `shallowRef` until you
build for production. A write through Vue's `ref` or Solid's `createStore` then mutates the value
instead of throwing.

| framework |                                       |
| --------- | ------------------------------------- |
| React     | `useState`                            |
| Solid     | `createSignal`, **not** `createStore` |
| Svelte 5  | `$state.raw`, **not** `$state`        |
| Vue       | `shallowRef`, **not** `ref`           |

## Map / Set

Use an object's properties.

```ts
type Tags = Val<"Tags", Record<string, true>>; // a Set
type PriceTable = Val<"PriceTable", Record<string, Money>>; // a Map
```

Use `true` rather than `null` for a set, so `if (tags[key])` is the membership test.
[`equals`](utilities.md#equals) ignores key order, so comparing two of them is set equality.

`patch` reaches one entry at a time and `undefined` drops it. Call the constructor to rebuild the
whole table.

```ts
PriceTable.patch(table, { apple: Money({ amount: 120, currency: "JPY" }), fig: undefined });

PriceTable(
  // the value type is named because a Val carries its phantom keys in the type as well
  Object.fromEntries(Object.entries<Money>(table).filter(([, m]) => m.amount < 500)),
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
