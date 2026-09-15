# Typechecking the book

Every ```ts block in `docs/src` is typechecked against `src`, one block per test, by `vp test`.
`mdbook test` does not do this: it runs Rust blocks only, so it passes on this book without reading
a line of it.

`vp run ts-compatibility` reuses these blocks: it writes them out and typechecks them against the
published `dist/index.d.mts` on every supported TypeScript line, so the same examples cover the
emitted declarations as well (notes §10.1). Blocks that declare `// @errors` stay out of that run.

The check here runs on TypeScript 5.9, installed as `typescript-5`. The compiler API lives in that
package; the 7.0 one ships the native binary instead. The root `tsconfig.json` maps `typescript`
there for the same reason: Twoslash's declarations import it by name. `vp run ts-compatibility` is
what covers the newer lines, against the published declarations.

## Writing a block

| fence       |                             |
| ----------- | --------------------------- |
| `ts`        | typechecked                 |
| `ts,ignore` | left out. Still highlighted |
| `js`        | not typechecked             |

Blocks do not see each other. A block that needs something from an earlier one declares it again,
above a `// ---cut---` line:

````md
```ts
import { Val } from "valof";

type User = Val<"User", { name: string }>;
declare const user: User;
// ---cut---
Object.assign(user, { name: "mallory" });
```
````

Everything above the cut is typechecked and then dropped, so the book shows only the last line. Stub
what the example borrows from elsewhere, rather than adding a dependency for it: Immer, Zod and
React appear in the book as a `declare` of the one function being shown.

A block that shows a type error names the codes at the top:

````md
```ts
// @errors: 2322
declare const userId: UserId;
let orderId: OrderId;
// ---cut---
orderId = userId; // type error: UserId is not an OrderId
```
````

The block fails if one of those errors stops happening, and fails just as well on an error it did
not name. `// @ts-expect-error` on the line above works too, and reads better for a single one.

`// @noErrors` turns the reporting off for a block that cannot be made to typecheck. Prefer
`ts,ignore` for a fragment that is not TypeScript at all, such as one object property.

## The rendered book

`docs/tools/mdbook-shiki` removes these notations before highlighting, with Twoslash's own
`removeTwoslashNotations`, so what a reader sees is the code below the cut. Nothing hovers yet.
