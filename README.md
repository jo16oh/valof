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

- **Immutability**: Vals are immutable. Their types are deeply readonly, and `seal` copies its
  input, so an original reference cannot mutate them.

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

- **Lightweight**: Starts from <!-- valof-minimal-bundle-size -->898 B
  gzipped<!-- /valof-minimal-bundle-size -->, with no runtime dependencies.

Read the [documentation](docs/src/introduction.md) for more details.

## Examples

### Branded plain data

```ts
import { equals, Val } from "valof";

type UserId = Val<"UserId", string>;
const UserId = Val.companion<UserId>().build();

type PostId = Val<"PostId", string>;
const PostId = Val.companion<PostId>().build();

const userId = UserId.seal("xxx-xxx-xxx");
const postId = PostId.seal("xxx-xxx-xxx");

// @ts-expect-error brands distinguish UserId from PostId
let _: UserId = postId;
// The phantom brand has no effect at runtime.
// @ts-expect-error brands are disjoint at type level
userId === postId; // true
typeof userId === "string"; // true

type Post = Val<"Post", { id: PostId; content: string }>;
const Post = Val.companion<Post>().build();
type User = Val<"User", { id: UserId; name: string; posts: Post[] }>;
const User = Val.companion<User>().build();

const user = User.seal({
  id: UserId.seal("xxx-xxx-xxx"),
  name: "joe",
  posts: [Post.seal({ id: PostId.seal("1"), content: "Hello, World!" })],
});

// @ts-expect-error Vals are deeply readonly
user.posts.push(Post.seal({ id: PostId.seal("2"), content: "Immutability matters." }));

// `equals` compares Vals structurally
const p1 = Post.seal({ id: PostId.seal("a"), content: "a" });
const p2 = Post.seal({ id: PostId.seal("a"), content: "a" });
p1 === p2; // false
equals(p1, p2); // true
```

### Custom constructors and companion objects

```ts
import { Val, type Unpatchable } from "valof";

type Result<T> = { ok: T } | { err: string };
type Note = Val<"Note", { id: string; text: string }>;

const normalize = (s: string) => s.trim().replace(/\s+/g, " ");
const hasText = (s: string) => s.length > 0;

// Unpatchable excludes the generated id from patch.
const Note = Val.companion<Note, [Unpatchable<"id">]>()
  // seal validates and normalizes every payload.
  .implSeal((note, seal): Result<Note> => {
    const text = normalize(note.text);
    return hasText(text) ? { ok: seal({ ...note, text }) } : { err: "empty note" };
  })
  // create generates the id once. Derivations do not run it again.
  .implCreate((text: string) => ({ id: crypto.randomUUID(), text }))
  // impl collects behavior. It infers each member's first parameter as Note.
  .impl({
    append(note, text: string): Result<Note> {
      return Note.seal({ ...note, text: `${note.text} ${text}` });
    },
  })
  .build();

// seal is the way in, with or without a custom seal.
Note.seal({ id: "note-1", text: " Hello " }); // { ok: { id: "note-1", text: "Hello" } }

const result = Note.create(" Hello ");
if ("ok" in result) Note.append(result.ok, "World"); // { ok: { id: "...", text: "Hello World" } }
```

### Deriving new values

```ts
import { Val } from "valof";
import { pipe } from "remeda";

type Point = Val<"Point", { x: number; y: number }>;

const Point = Val.companion<Point>()
  .impl({
    move(point, dx: number, dy: number): Point {
      return Point.patch(point, {
        x: point.x + dx,
        y: point.y + dy,
      });
    },
  })
  .build();

type Rectangle = Val<"Rectangle", { position: Point; size: Point; label?: string }>;
const Rectangle = Val.companion<Rectangle>().build();

const rectangle = Rectangle.seal({
  position: Point.seal({ x: 1, y: 2 }),
  size: Point.seal({ x: 10, y: 20 }),
  label: "draft",
});

// patch is available only on object-shaped Vals.
const moved = Rectangle.patch(rectangle, {
  position: Point.move(rectangle.position, 3, 4),
});
moved.size === rectangle.size; // true: untouched branches keep their reference identity

// Every member can also be called with the value last, so it can be passed to a pipe.
const shifted = pipe(rectangle.position, Point.move(3, 4), Point.move(-1, 0)); // { x: 3, y: 6 }

const unlabeled = Rectangle.patch(moved, { label: undefined });
"label" in unlabeled; // false: undefined deletes an optional property
```

## Development

```bash
vp install              # install dependencies
vp test                 # run the tests
vp check                # format, lint, type check
vp run build            # build
vp run bundle-size      # measure what a user ships against its budget
vp run type-perf        # measure the type cost: instantiations and the declaration size
vp run ts-compatibility # type check the published .d.ts against every TypeScript line
```

## License

MIT
