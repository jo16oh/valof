# Linting

Rules for the mistakes the type checker cannot catch. They run as a
[plugin for ESLint and Oxlint](linting.md#plugin-for-eslint-and-oxlint), and as a
[standalone command](linting.md#cli).

```bash
pnpm add -D oxc-parser   # valof does not install it for you
```

## Rules

| rule                  | reports                                                             | default |
| --------------------- | ------------------------------------------------------------------- | ------- |
| `unused-member`       | a member registered with `.impl` or `.implTrait` that nothing reads | warning |
| `duplicate-brand`     | a brand string claimed by more than one top-level alias             | error   |
| `brand-mismatch`      | a brand whose last segment is not the name of the type it brands    | error   |
| `unnecessary-alias`   | a type alias that is a second name for a Val or Trait               | error   |
| `unimplemented-trait` | a Trait declared by a Val that its companion does not implement     | error   |
| `companion-mismatch`  | a companion bound to a name other than the type it is for           | error   |
| `split-companion`     | a companion for a type that another file declares                   | error   |
| `bypassed-companion`  | a `Val.of` for a type whose companion is how it is built            | warning |
| `unnamed-of`          | a `Val.of` that names no type, taking one from its target           | warning |
| `incomplete-disable`  | a disable comment leaving out the rules it silences, or its scope   | error   |
| `unused-disable`      | a disable comment naming a rule that reports nothing there          | warning |

A rule warns where the code around the finding still works, and errors where a Val is broken: two
types the checker stops distinguishing, or a name that has to agree with another and does not.
`incomplete-disable` errors for a reason of its own: a comment naming no rule silences every one, a
rule added next year included.

The severity is what the [plugin](linting.md#plugin-for-eslint-and-oxlint) sets, and a project can
give any rule its own. The [command](linting.md#cli) draws every finding the same way and exits 1 on
any of them.

A member registered with `.impl({…})` is not tree-shaken, and knip does not report it when it goes
dead.

## Disable comments

Silence one line with a comment above it,

```ts,ignore
// valof-lint-disable-next-line unused-member -- public API
shout: (u) => u.toUpperCase(),
```

or a whole file with one anywhere in it:

```ts
// valof-lint-disable-whole-file unused-member -- every export here is public API
// valof-lint-disable-all-whole-file -- generated, do not lint
```

Name the rules it silences, separated by a space or a comma. The comments answer to two rules of
their own, `incomplete-disable` and `unused-disable`, which are left out of a run and given a
severity like any other.

## Plugin for ESLint and Oxlint

The same rules, one per kind: name one to give it its own severity, or turn it off. The project to
read is one setting for all of them, a path or a list of them, and defaults to `src/**/*.ts`. A path
opening with `!` is excluded from it.

ESLint needs a parser that reads your TypeScript.

```js
// eslint.config.js
import valof from "valof/eslint-plugin";

export default [
  {
    plugins: { valof },
    rules: { ...valof.configs.recommended.rules, "valof/unused-member": "off" },
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
  rules: { "valof/unused-member": "off" },
  settings: { valof: { project: "src" } },
});
```

## CLI

```bash
pnpm exec valof-lint src                                # the whole project
pnpm exec valof-lint src src/billing/id.ts              # report on the changed file
pnpm exec valof-lint 'src/**/*.ts' '!src/generated/**'  # leave a generated tree out
```

| argument                   | what it is                                                                       |
| -------------------------- | -------------------------------------------------------------------------------- |
| the first path             | the project to read, a directory or a glob                                       |
| the paths after it         | the files to report on, the whole project when there are none                    |
| `--project`, `--report-on` | the same two by name, in either order. Either can be repeated, and takes `!path` |
| `--no-<rule>`              | a rule to leave out of the run, by the name the finding carries                  |

A single file given as the project is refused: a duplicate brand needs the other alias to be seen.

A `!path` is excluded wherever it is written, and comes off the run rather than only the report, so
what a generated tree declares no longer applies to the rest.
