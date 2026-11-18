# Patterns

## Framework state

A value is a plain object, so a state container holds it as is. Replace it whole. The untouched
subtrees keep their identity, so a dependency array detects no change.

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
setShop(
  Shop.patch(shop, (s) => {
    s.owner.email = "e@example.com";
  }),
);

useEffect(() => showMap(shop.city), [shop.city]); // the patch did not touch `city`: no re-run
```

Solid works the same way with `createSignal`, and takes the comparison directly:
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
const user = User.seal(plain); // sealed, and now it is a User
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

Persistence helpers can also return a value typed as a Val that never passed through the seal.
[Jotai's `atomWithStorage`](https://github.com/pmndrs/jotai/blob/main/docs/utilities/storage.mdx),
for example, parses stored JSON and returns it as the type inferred from its initial value. Store a
`PayloadOf<User>`, then seal it after reading.

Seal at the boundary, because the two sides deploy separately. The value was sealed by whichever
build the server is running, and that seal may be older than yours.

## Map / Set

Declare a `Val.Record` with a companion of its own. A record keyed by any string is a type error in
a payload, because a variable whose type lists fewer entries can hold unchecked values under the
keys it leaves out. For a set, hold `true` under each key.

```ts
import { Val } from "valof";

type Money = Val<"Money", { amount: number; currency: string }>;
const Money = Val.companion<Money>().build();
// ---cut---
type PriceTable = Val.Record<"PriceTable", string, Money>;
const PriceTable = Val.Record.companion<PriceTable>().build();

const table = PriceTable.fromEntries([["apple", Money.seal({ amount: 120, currency: "JPY" })]]);
table["apple"]; // Money | undefined
const priced = PriceTable.set(table, "fig", Money.seal({ amount: 300, currency: "JPY" }));
const figs = PriceTable.delete(priced, "apple");
PriceTable.keys(figs); // readonly string[]

type Tags = Val.Record<"Tags", string, true>;
const Tags = Val.Record.companion<Tags>().build();

const tags = Tags.fromEntries(["new", "sale"].map((tag) => [tag, true] as const));
Tags.has(tags, "new"); // true
const more = Tags.set(tags, "rare", true);
```

`fromEntries` takes an iterable of entries, such as an array or a JS `Map`, not a plain object. An
entry's value cannot be `undefined`. Leave the key out instead. A later entry replaces an earlier
one with the same key. A record's companion has no `seal`. A seal registered with `.implSeal`
receives the object the entries fold into. `set` and `delete` pass a new value to the seal and
return what it returns, or return the value itself where nothing changes. The value is a plain
object keyed by its keys, so `equals` and JSON treat it as a plain object. Read it with `keys`,
`values` and `entries`, which keep the key and value types that `Object.keys`, `Object.values` and
`Object.entries` lose.

<!-- prettier-ignore -->
> [!WARNING]
> `Object.entries` and `Object.values` return every property an object holds, including those its
> static type leaves out, and give every value the type of the listed values, or `any` for an
> interface. A record built from either can hold values its type does not describe, whatever calls
> come between, `new Map(…)` included. Build the entries from sealed values, such as another record's
> `entries`, and check each entry of data from outside, such as parsed JSON.

To take data from outside, register a seal that takes a `Record<string, unknown>` or an `object`, as
on a Val ([Validate in the seal](custom-constructors.md#validate-in-the-seal)). `fromEntries` then
takes entries with any string key and any value, and the seal has to check each value. Where the
record's key type is narrower than `string`, the seal has to check each key too.

A record cannot reference itself with `Rec`. Put the record in a Val's field, and reference that
Val:

```ts
import { Val, type Rec } from "valof";

// ---cut---
type Node = Val<"Node", { kids: Kids }>;
type Kids = Val.Record<"Kids", string, Rec<Node>>;
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

## Large integers

Keep an integer outside the safe range of `number` as a decimal string, since `JSON.stringify`
throws on a `bigint`. Compare and compute through `BigInt()` in members, because `"10" < "9"`.

```ts
import { Val } from "valof";

// ---cut---
type BigInteger = Val<"BigInteger", string>;

const BigInteger = Val.companion<BigInteger>()
  .implSeal((n: string | bigint, seal) => {
    const s = String(n);
    // One string per integer, for `equals`.
    // `BigInt("010")` is 10n, so only the pattern rejects "010".
    if (!/^(0|-?[1-9]\d*)$/.test(s)) throw new RangeError(`not an integer: ${s}`);
    return seal(s);
  })
  .impl(() => ({
    add(a, b: BigInteger): BigInteger {
      return BigInteger.seal(BigInt(a) + BigInt(b));
    },
    compare(a, b: BigInteger): -1 | 0 | 1 {
      const x = BigInt(a);
      const y = BigInt(b);
      return x < y ? -1 : x > y ? 1 : 0;
    },
  }))
  .build();

BigInteger.add(BigInteger.seal(1n), BigInteger.seal("9007199254740993"));
```
