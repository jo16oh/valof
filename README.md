<div align="center">
  <img src="./assets/valof-brand.svg" alt="Valof" width="250">
  <h1>Valof</h1>
  <p><em>Write robust domain logic in TypeScript<br>just by following the conventions.</em></p>
  <p>
    <a href="https://www.npmjs.com/package/valof"><img src="https://img.shields.io/npm/v/valof.svg" alt="npm" align="absmiddle"></a>&nbsp;&nbsp;
    <a href="https://jo16oh.github.io/valof/latest/">📘 The Valof Book</a>
  </p>
</div>

<!-- prettier-ignore -->
> [!IMPORTANT]
> Valof is pre-1.0. A minor release can change the API.

## Installation

```sh
npm install valof
```

## Why Valof?

Valof is a TypeScript library for branded, immutable domain types, such as value objects and enums.
It enforces the conventions through types and linting.

- **Nominal-ish typing with a phantom brand**: TypeScript distinguishes one Val type from another,
  with nothing to pay at runtime.

- **Values as plain data**: Vals stay objects, arrays and primitives. They serialize without
  adapters and fit directly into React and other framework state. No classes, no prototypes.

- **Immutability**: Vals are immutable. Their types are deeply readonly, and their constructors copy
  their inputs, so an original reference cannot mutate them.

- **No `as` casts in your code**: Valof owns the cast required to construct a branded value.

- **Companion object**: Keep a type's constructor and functions together without a class. The first
  Val parameter is inferred.

- **"Parse, don't validate"**: Every creation and derivation goes through one `seal`. Use any
  validation library and any Result type.

- **Copy only what changes**: `patch` copies only the paths it changes. Untouched branches keep
  their reference identity.

- **Rust-like abstractions (experimental)**: `Enum` is a closed set of variants with exhaustive
  `match`. `Trait` shares behavior across Vals. `dyn` adds dynamic dispatch without classes, holding
  different types together.

- **Built-in linter**: Catch convention violations through ESLint, Oxlint or the standalone command.

- **Lightweight**: Starts from <!-- valof-minimal-bundle-size -->852 B
  gzipped<!-- /valof-minimal-bundle-size -->, with no runtime dependencies.

Read the [documentation](docs/src/introduction.md) for more details.

## Examples

### Branded plain data

```ts
import { equals, Val } from "valof";

type UserId = Val<"UserId", string>;
const UserId = Val.sealer<UserId>();

type PostId = Val<"PostId", string>;
const PostId = Val.sealer<PostId>();

const userId = UserId("xxx-xxx-xxx");
const postId = PostId("xxx-xxx-xxx");

// @ts-expect-error brands distinguish UserId from PostId
let _: UserId = postId;
// The phantom brand has no effect at runtime.
// @ts-expect-error brands are disjoint at type level
userId === postId; // true
typeof userId === "string"; // true

type Post = Val<"Post", { id: PostId; content: string }>;
const Post = Val.sealer<Post>();
type User = Val<"User", { id: UserId; name: string; posts: Post[] }>;
const User = Val.sealer<User>();

const user = User({
  id: UserId("xxx-xxx-xxx"),
  name: "joe",
  posts: [Post({ id: PostId("1"), content: "Hello, World!" })],
});

// @ts-expect-error Vals are deeply readonly
user.posts.push(Post({ id: PostId("2"), content: "Immutability matters." }));

// `equals` compares Vals structurally
const p1 = Post({ id: PostId("a"), content: "a" });
const p2 = Post({ id: PostId("a"), content: "a" });
p1 === p2; // false
equals(p1, p2); // true
```

### Custom constructors and companion objects

```ts
import { Val } from "valof";

type Result<T> = { ok: T } | { err: string };
type Note = Val<"Note", { id: string; text: string }>;

const normalize = (s: string) => s.trim().replace(/\s+/g, " ");
const hasText = (s: string) => s.length > 0;

const Note = Val.companion<Note>()
  // create mints the id once. Derivations do not run it again.
  .implCreate((text: string) => ({ id: crypto.randomUUID(), text }))
  // seal validates and normalizes every payload.
  .implSeal((note, seal): Result<Note> => {
    const text = normalize(note.text);
    return hasText(text) ? { ok: seal({ ...note, text }) } : { err: "empty note" };
  })
  // fixed excludes the minted id from patch.
  .fixed<"id">()
  // impl collects behavior. It infers each member's first parameter as Note.
  .impl({
    append(note, text: string): Result<Note> {
      return Note.seal({ ...note, text: `${note.text} ${text}` });
    },
  });

// A companion exposes its smart constructor as seal.
Note.seal({ id: "note-1", text: " Hello " }); // { ok: { id: "note-1", text: "Hello" } }
// @ts-expect-error a companion is not callable
Note({ id: "note-1", text: "Hello" });

const result = Note.create(" Hello ");
if ("ok" in result) Note.append(result.ok, "World"); // { ok: { id: "...", text: "Hello World" } }
```

### Deriving new values

```ts
import { Val } from "valof";

type Point = Val<"Point", { x: number; y: number }>;

// A sealer remains callable after impl adds behavior.
const Point = Val.sealer<Point>().impl({
  move(point, dx: number, dy: number): Point {
    return Point.patch(point, {
      x: point.x + dx,
      y: point.y + dy,
    });
  },
});

type Rectangle = Val<"Rectangle", { position: Point; size: Point; label?: string }>;
const Rectangle = Val.sealer<Rectangle>();

const rectangle = Rectangle({
  position: Point({ x: 1, y: 2 }),
  size: Point({ x: 10, y: 20 }),
  label: "draft",
});

// patch is available only on object-shaped Vals.
const moved = Rectangle.patch(rectangle, {
  position: Point.move(rectangle.position, 3, 4),
});
moved.size === rectangle.size; // true: untouched branches keep their reference identity

const unlabeled = Rectangle.patch(moved, { label: undefined });
"label" in unlabeled; // false: undefined deletes an optional property
```

## Development

```bash
vp install              # install dependencies
vp test                 # run the tests
vp check                # format, lint, type check
vp pack                 # build
vp run bundle-size      # measure what a user ships against its budget
vp run type-perf        # measure the type cost: instantiations and the declaration size
vp run ts-compatibility # type check the published .d.mts against every TypeScript line
```

## License

MIT
