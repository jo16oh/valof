<div align="center">
  <img src="assets/valof-brand.svg" alt="Valof" width="250">
  <h1>The Valof Book</h1>
  <p>v{{valof-version}}</p>
  <p><em>Write robust domain logic in TypeScript<br>just by following the conventions.</em></p>
  <p>
    <a href="https://www.npmjs.com/package/valof"><img src="https://img.shields.io/npm/v/valof.svg" alt="npm"></a>
  </p>
</div>

The Valof Book is both a guide and a reference. Read it in order to learn the conventions, or use
the sidebar to find a specific topic.

<!-- prettier-ignore -->
> [!IMPORTANT]
> Valof is pre-1.0. A minor release can change the API. Read the release notes before upgrading.

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

- **"Parse, don't validate"**: Every creation and derivation goes through one `seal`.[^seal] Use any
  validation library and any Result type.

- **Copy only what changes**: `patch` copies only the paths it changes. Untouched branches keep
  their reference identity.

- **Rust-like abstractions**: `Enum` is a closed set of variants with exhaustive `match`. `Trait`
  shares behavior across Vals. `dyn` adds dynamic dispatch without classes, holding different types
  together.

- **Built-in linter**: Catch convention violations through ESLint, Oxlint or the standalone command.
  [Linting](linting.md) shows the setup.

- **Lightweight**: Starts from <!-- valof-minimal-bundle-size -->965 B
  gzipped<!-- /valof-minimal-bundle-size -->, with no runtime dependencies.

> For background on individual features, see
> [TypeScript Problems Valof Addresses](typescript-problems.md).

## Examples

```ts
import { Enum, Trait, Val, type Dyn, type Self } from "valof";

type Result<T> = { ok: T } | { err: string };

type TaskId = Val<"TaskId", string>;
const TaskId = Val.companion<TaskId>().build();

type Status = Enum<"Status", { Todo: { due: string }; Done: { at: string } }>;
const Status = Enum.companion<Status>().build();

type Summarizable = Trait<"Summarizable", { title: string }, { summarize: (self: Self) => string }>;
const Summarizable = Trait.companion<Summarizable>().build();

type Task = Val<"Task", { id: TaskId; status: Status; tags: string[] }, Summarizable>;
const Task = Val.companion<Task>()
  .implSeal((task, seal): Result<Task> =>
    task.title.trim() === "" ? { err: "empty title" } : { ok: seal(task) },
  )
  .impl(({ patch }) => ({
    complete: (task, at: string) => patch(task, { status: Status.Done.create({ at }) }),
  }))
  .implTrait(Summarizable, () => ({
    summarize: (t): string =>
      Status.match(t.status, {
        Todo: (s) => `${t.title} (due ${s.due})`,
        Done: () => `${t.title} (done)`,
      }),
  }))
  .build();

type Note = Val<"Note", { text: string }, Summarizable>;
const Note = Val.companion<Note>()
  .implTrait(Summarizable, () => ({ summarize: (n) => n.title }))
  .build();

function main() {
  const result = Task.seal({
    id: TaskId.seal("t1"),
    title: "Write the README",
    status: Status.Todo.create({ due: "10-31" }),
    tags: ["docs"],
  });

  if ("err" in result) throw result.err;
  const task = result.ok;

  task.status._tag; // "Todo"

  const done = Task.complete(task, "10-27");
  if ("err" in done) throw done.err;
  done.ok.status._tag; // "Done"
  done.ok.tags === task.tags; // true: structural sharing

  // Dynamic dispatch, as in Rust's `Box<dyn Trait>`. Each item calls its own type's `summarize`.
  const board: Dyn<Summarizable>[] = [
    Summarizable.dyn(Task, task),
    Summarizable.dyn(Note, Note.seal({ title: "Ideas", text: "..." })),
  ];
  board.map((item) => item.summarize()).forEach((s) => console.log(s)); // "Write the README (due 10-31)", "Ideas"
}

function errors(task: Task) {
  Task.seal({ ...task, title: " " }); // { err: "empty title" }
  // @ts-expect-error a plain string has no TaskId brand
  Task.seal({ ...task, id: "t2" });
  // @ts-expect-error Vals are deeply readonly
  task.tags.push("urgent");
}
```

[^seal]:
    Two paths skip a companion's seal: [`Val.of`](utilities.md#valof) and
    [`.implCreate.noseal`](custom-constructors.md#bypass-the-seal-in-create).
