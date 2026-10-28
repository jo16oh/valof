# Patterns

## Framework state

A value is a plain object, so a state container holds it as it stands. Replace it whole. The
untouched subtrees keep their identity, so a dependency array detects no change.

```ts
import { Val } from "valof";

declare function useState<T>(initial: T): [T, (next: T) => void];
declare function useEffect(effect: () => void, deps: readonly unknown[]): void;

type City = Val<"City", { name: string }>;
type Shop = Val<"Shop", { owner: { email: string }; city: City }>;
const Shop = Val.companion<Shop>().build();

declare const owner: { email: string };
declare const city: City;
declare const showMap: (city: City) => void;
// ---cut---
const [shop, setShop] = useState(Shop.seal({ owner, city }));
setShop(Shop.patch(shop, { owner: { email: "e@example.com" } }));

useEffect(() => showMap(shop.city), [shop.city]); // the patch did not touch `city`: no re-run
```

Solid reads the same with `createSignal`, and takes the comparison directly:
`createSignal(user, { equals })`.

**Svelte and Vue are deeply reactive by default, so ask for a shallow container.** A deep one gives
your code a proxy in place of the value. `patch` rebuilds a changed value and its parents, and keeps
the untouched branches by reference. Given a proxy, it copies those branches as well.

Values are frozen in development, so Vue skips them and `ref` behaves like `shallowRef` until you
build for production. A write through Vue's `ref` or Solid's `createStore` then mutates the value
instead of throwing.

| framework |                                       |
| --------- | ------------------------------------- |
| React     | `useState`                            |
| Solid     | `createSignal`, **not** `createStore` |
| Svelte 5  | `$state.raw`, **not** `$state`        |
| Vue       | `shallowRef`, **not** `ref`           |

## Return payloads across serialization boundaries

**Return the payload, not the value.** A generated client derives its response type from the
handler, so a Val there arrives on the other side already typed as one, without having passed
through the seal.

```ts
import { Val, type PayloadOf } from "valof";

type User = Val<"User", { name: string }>;

declare const user: User;
declare const app: {
  get(path: string, handler: (c: { json(body: unknown): Response }) => Response): void;
};
// ---cut---
app.get("/user/:id", (c) => {
  const body: PayloadOf<User> = user; // the brand drops, the object is the same one
  return c.json(body);
});
```

Now the other side cannot use what arrives until it seals it:

```ts
// @errors: 2322
import { Val, type PayloadOf } from "valof";

type User = Val<"User", { name: string }>;
const User = Val.companion<User>().build();

declare const res: { json(): Promise<PayloadOf<User>> };
// ---cut---
const plain = await res.json(); // the generated client types this as PayloadOf<User>
const bad: User = plain; // type error: the brand is missing
const user = User.seal(plain); // sealed, and now it is one
```

`PayloadOf<V>` removes the brand from the type, not from the value, so it costs nothing at run time.
A Val whose payload contains an array cannot be assigned to its `PayloadOf`. The value's array is
readonly, while `PayloadOf` keeps the mutable array the type declares. Return the copy that
`Val.unwrap` makes instead:

```ts
// @errors: 2322
import { Val, type PayloadOf } from "valof";

declare const post: Post;
// ---cut---
type Post = Val<"Post", { title: string; tags: string[] }>;

const body: PayloadOf<Post> = post; // type error: tags is readonly
const copy: PayloadOf<Post> = Val.unwrap(post);
```

`PayloadOf` and `Val.unwrap` both remove the brand of a nested Val.

Persistence helpers can create the same hole.
[Jotai's `atomWithStorage`](https://jotai.org/docs/utilities/storage), for example, parses stored
JSON and returns it as the type inferred from its initial value. Store a `PayloadOf<User>`, then
seal it after reading.

Seal at the boundary, because the two sides deploy separately. The value was sealed by whichever
build the server is running, and that seal may be older than yours.

## Map / Set

Use an object's properties.

```ts
import { Val } from "valof";

type Money = Val<"Money", { amount: number; currency: string }>;
// ---cut---
type Tags = Val<"Tags", Record<string, true>>; // a Set
type PriceTable = Val<"PriceTable", Record<string, Money>>; // a Map
```

Use `true` rather than `null` for a set, so `if (tags[key])` is the membership test.
[`equals`](utilities.md#equals) ignores key order, so comparing two of them is set equality.

`patch` sets the entries it lists, and removes an entry set to `undefined`. Call `seal` to rebuild
the whole table.

```ts
import { Val } from "valof";

type Money = Val<"Money", { amount: number; currency: string }>;
const Money = Val.companion<Money>().build();
type PriceTable = Val<"PriceTable", Record<string, Money>>;
const PriceTable = Val.companion<PriceTable>().build();

declare const table: PriceTable;
// ---cut---
PriceTable.patch(table, { apple: Money.seal({ amount: 120, currency: "JPY" }), fig: undefined });

PriceTable.seal(Object.fromEntries(Object.entries(table).filter(([, m]) => m.amount < 500)));
```

## Dates

```ts
import { Val } from "valof";

declare const Temporal: {
  Instant: { fromEpochMilliseconds(ms: number): { toLocaleString(): string } };
};
// ---cut---
export type UnixEpochMs = Val<"UnixEpochMs", number>;

export const UnixEpochMs = Val.companion<UnixEpochMs>()
  .impl(() => ({
    showLocal(d) {
      return Temporal.Instant.fromEpochMilliseconds(d).toLocaleString();
    },
  }))
  .build();
```
