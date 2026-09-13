<br>
<br>

<div align="center" style="margin-top: 8rem; margin-bottom: 4rem;">
  <img src="./assets/valof-brand.svg" alt="Valof" width="364">
  <p><strong><em>Write robust domain logic in TypeScript just by following the conventions.</em></strong></p>
  <p>
    <a href="https://www.npmjs.com/package/valof"><img src="https://img.shields.io/npm/v/valof.svg" alt="npm"></a>
  </p>
</div>

<br>
<br>

Valof is an opinionated value-object helper for TypeScript that enforces the conventions through
types and linting.

## What you get

- **Nominal-ish typing with a phantom brand**: TypeScript distinguishes one Val type from another,
  with nothing to pay at runtime.

- **Values as plain data**: Vals stay objects, arrays and primitives. They serialize without
  adapters and fit directly into React and other framework state. No classes, no prototypes.

- **Deeply readonly**: Values are deeply readonly. Constructors copy their inputs, so an original
  reference cannot mutate them.

- **No `as` casts in your code**: Valof owns the cast required to construct a branded value.

- **Companion object**: Keep a type's constructor and functions together without a class. The first
  Val parameter is inferred.

- **"Parse, don't validate"**: Every creation and update goes through one `seal`. Use any validation
  library and any Result type.

- **Copy only what changes**: `patch` copies only the paths it changes. Untouched branches keep
  their reference identity.

- **Type-aware linting**: Catch convention violations through ESLint, Oxlint or the standalone
  command.

- **Lightweight**: About 1.1 kB gzipped, with no runtime dependencies.

Read the [documentation](docs/src/introduction.md) for more details.

## Installation

```sh
pnpm install valof
```

## Showcase

```ts
import { Val, type SeedOf } from "valof";

// The brand matches the type name. It exists only in the type system.
export type Email = Val<"Email", string>;

// Any Result library works. Valof propagates the seal's return type without inspecting it.
export const Email = Val.companion<Email>().implSeal((input, seal) => {
  const email = input.trim().toLowerCase();
  // This seal parses every input. The provided seal brands and copies valid data.
  return email.includes("@") ? { ok: seal(email) } : { err: "invalid email" };
});

export type Line = Val<"Line", { sku: string; unitPrice: number; quantity: number }>;

// The default seal is a callable constructor.
export const Line = Val.sealer<Line>();

export type Cart = Val<
  "Cart",
  {
    id: string;
    customer: Email;
    lines: readonly Line[];
    delivery: { city: string; note?: string };
  }
>;

type CartFields = Omit<SeedOf<Cart>, "id" | "lines">;

export const Cart = Val.companion<Cart>()
  // create generates data. The default seal then turns it into a Cart.
  .implCreate((fields: CartFields): SeedOf<Cart> => ({
    id: crypto.randomUUID(),
    lines: [],
    ...fields,
  }))
  // Generated fields stay outside the patch and update paths.
  .fixed<"id">()
  .impl({
    // Behaviour stays beside the type, not inside its values. cart is inferred as Cart.
    total(cart) {
      return cart.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    },
  });

const parsed = Email.seal(" Alice@Example.com ");
if ("err" in parsed) throw new Error(parsed.err);
const email = parsed.ok;

const cart = Cart.create({
  customer: email,
  delivery: { city: "Tokyo" },
});

const input = { sku: "BOOK", unitPrice: 3200, quantity: 1 };
const line = Line(input);
input.quantity = 2;
line.quantity; // 1: constructors own a deep copy of their input

const withLine = Cart.patch(cart, { lines: [line] });
const rerouted = Cart.patch(withLine, { delivery: { city: "Kyoto" } });
rerouted.lines === withLine.lines; // true: an untouched branch keeps its identity
Cart.total(rerouted); // 3200

// Cart.patch(cart, { id: "forged" }); // type error: id is fixed

const same = Cart.patch(rerouted, {});
same === rerouted; // true: a no-op patch returns the original value
Cart.equals(rerouted, same); // true: equality is structural
```

## Development

```bash
vp install              # install dependencies
vp test                 # run the tests
vp check                # format, lint, type check
vp pack                 # build
vp run size             # measure the bundle against its budget
vp run type-perf        # measure the typecheck performance
vp run ts-compatibility # type check the published .d.mts against every TypeScript line
```

## License

MIT
