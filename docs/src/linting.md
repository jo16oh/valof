# Linting

valof-lint reports the mistakes the type checker cannot catch. It runs as a
[plugin for ESLint and Oxlint](linting.md#plugin-for-eslint-and-oxlint), and as a
[standalone command](linting.md#cli).

```bash
pnpm add -D oxc-parser   # valof does not install it for you
```

## Rules

| rule                             | reports                                                                            | default |
| -------------------------------- | ---------------------------------------------------------------------------------- | ------- |
| `no-unused-member`               | a member registered with `.impl`, `.implTrait` or `.implAssoc` that nothing reads  | warning |
| `no-duplicate-brand`             | a brand string claimed by more than one top-level alias                            | error   |
| `no-brand-mismatch`              | a brand whose last segment is not the name of the type it brands                   | error   |
| `no-unnecessary-alias`           | a type alias that is a second name for a Val, a Trait or an Enum                   | error   |
| `no-unimplemented-trait`         | a Trait a Val, an Enum or a variant declares that its companion does not implement | error   |
| `no-companion-mismatch`          | a companion, or a variant, bound to a name other than its own                      | error   |
| `no-split-companion`             | a companion for a type that another file declares                                  | error   |
| `no-bypassed-companion`          | a `Val.of` for a type whose companion is how it is built                           | warning |
| `no-inferred-val-of`             | a `Val.of` that names no type, taking one from its target                          | warning |
| `no-hidden-shared-state-in-impl` | state declared in a function passed to `.impl`, `.implTrait` or `.implAssoc`       | warning |
| `no-detached-variant`            | a variant bound to a local name without the name of its enum                       | warning |
| `no-hidden-optional`             | a default or rest parameter that a member's type annotation hides                  | error   |
| `no-data-type-outside-valof`     | a data type declared outside Valof                                                 | off     |
| `no-vague-disable`               | a disable comment leaving out the rules it silences, or its scope                  | error   |
| `no-unused-disable`              | a disable comment naming a rule that reports nothing there                         | warning |

A rule warns where the code around the finding still works, and errors where a Val is broken: two
types the checker stops distinguishing, a name that has to agree with another and does not, or a
member that the types promise but that runs differently or is missing. `no-vague-disable` errors for
a reason of its own. A comment naming no rule silences every one, a rule added next year included.

The severity is what the [plugin](linting.md#plugin-for-eslint-and-oxlint) sets, and a project can
give any rule its own. The [command](linting.md#cli) prints every finding the same way and exits 1
on any of them.

`no-unused-member` reports what other tools miss. A member registered with `.impl(() => ({…}))` is
not tree-shaken, and knip does not report it when it becomes unused.

## Enforcing Valof for data types

`no-data-type-outside-valof` reports a named data type declared outside Valof: an object type, an
array, a tuple, a primitive, a utility type such as `Pick`, or an `interface`. A union of Vals and a
function type pass. It is off until a project turns it on.

Name a type meant for a payload with `Payload`. It may appear inside a Valof type, and in the
function passed to `implSeal` or `implCreate`.

```ts
import { Val, type Payload, type PayloadOf } from "valof";

type User = Val<"User", { id: string; name: string }>;
type Fields = Payload<Omit<PayloadOf<User>, "id">>;

const User = Val.companion<User>()
  .implCreate((fields: Fields) => ({ id: crypto.randomUUID(), ...fields }))
  .build();
```

Three settings, each off by default, make the rule report more:

| setting       | reports                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `classes`     | a class, declared or as an expression                                       |
| `constraints` | a data shape in a type parameter's constraint, `<T extends { id: string }>` |
| `extraction`  | a type taken out of a value: `typeof`, `ReturnType`, `Awaited` and the like |

## Disable comments

Silence one line with a comment above it,

```ts,ignore
// valof-lint-disable-next-line no-unused-member -- public API
shout: (u) => u.toUpperCase(),
```

or a whole file with one anywhere in it:

```ts
// valof-lint-disable-whole-file no-unused-member -- every export here is public API
// valof-lint-disable-all-whole-file -- generated, do not lint
```

Name the rules it silences, separated by a space or a comma. The comments follow two rules of their
own, `no-vague-disable` and `no-unused-disable`, which can be left out of a run or given a severity
like any other.

## Plugin for ESLint and Oxlint

The plugin has the rules in the table above, under the same names. Each rule can be given its own
severity, or turned off, by its name. `recommended` leaves `no-data-type-outside-valof` out. The
rule's settings go under `settings.valof["no-data-type-outside-valof"]`. `settings.valof.project`
sets the project to read, for every rule at once. It takes a path or a list of paths, and defaults
to `src/**/*.ts`. A path starting with `!` is excluded from it.

ESLint needs a parser that reads your TypeScript.

```js
// eslint.config.js
import valof from "valof/eslint-plugin";

export default [
  {
    plugins: { valof },
    rules: { ...valof.configs.recommended.rules, "valof/no-unused-member": "off" },
    settings: { valof: { project: ["src/**/*.ts", "!src/generated/**"] } },
  },
];
```

Oxlint takes the same plugin, through its JS plugins.

```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";
import valof from "valof/eslint-plugin";

export default defineConfig({
  jsPlugins: ["valof/eslint-plugin"],
  extends: [valof.configs.recommended],
  rules: { "valof/no-unused-member": "off" },
  settings: { valof: { project: "src" } },
});
```

## CLI

```bash
pnpm exec valof-lint src                                # the whole project
pnpm exec valof-lint src src/billing/id.ts              # report on the changed file
pnpm exec valof-lint 'src/**/*.ts' '!src/generated/**'  # leave a generated tree out
```

| argument           | what it is                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| the first path     | the project to read, a directory or a glob                                                                    |
| the paths after it | the files to report on, the whole project when there are none                                                 |
| `--project`        | the project, given as a flag, before or after the files. Can be repeated, and takes `!path`                   |
| `--skip <rule>`    | a rule to leave out of the run, by the rule name in the finding. Can be repeated                              |
| `--enable <rule>`  | a rule off by default, turned on. Any of its settings can follow the rule name after `=`, separated by commas |

A single file given as the project is refused, because a duplicate brand needs the other alias to be
seen.

A `!path` is excluded wherever it is written, and is removed from the run rather than only from the
report, so what a generated tree declares no longer applies to the rest.

The plugin and the command keep what they learn from each file in `node_modules/.cache/valof-lint`,
so a later run parses again only the files that changed. With `VALOF_LINT_CACHE=0`, they keep
nothing there.

## Spreading a Val under `no-misused-spread`

`no-misused-spread`, a type-aware rule in typescript-eslint and in Oxlint, reports
`{ ...user, extra: 1 }` as spreading a class instance. A Val is a plain object at run time, so the
spread loses nothing. Allow Valof's brand class, `Phantom`:

```js
// eslint.config.js
export default [
  {
    rules: {
      "@typescript-eslint/no-misused-spread": [
        "error",
        { allow: [{ from: "package", package: "valof", name: "Phantom" }] },
      ],
    },
  },
];
```

Oxlint accepts the same option under `typescript/no-misused-spread`.

Oxlint still reports a value typed as a whole enum, such as `Shape`, and both linters report a value
typed as a trait. The fields of such a value are not all known, so avoid spreading it. Spread the
variant that [`Shape.match`](enums.md#match-on-the-tag) passes to a handler, and read the fields a
trait declares by name.
