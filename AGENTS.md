# valof

## Design Memo

`notes/design/` holds every design decision and the alternatives rejected along the way. Each
section has a file of its own. `notes/design/README.md` is the index. Read the files it lists before
proposing anything about equality, copying, wrapper types, the linter, or new API. Before changing a
file, read the sections the index's "Code to memo" table lists for its path. Before proposing an
alternative, search for it with the command the index gives. §9 lists the open questions. New
deliberation goes in §9. A new section gets a file of its own and a line in the index.

## Writing Code with Valof

Model the domain as you would in Rust. A named data type is a Val (a struct or a newtype) or an
Enum. A Trait is a Rust trait. Behaviour goes in the companion. `.impl` holds the methods, which
take the Val first as `self`, and `.implAssoc` holds the associated functions. `.implTrait` is
`impl Trait for Type`. A Val is plain data with no methods, so call a member through the companion:
`User.displayName(user)`, not `user.displayName()`.

## Code Style

`pipe` (`src/shared/pipe`) passes a value through steps, and `flow` awaits each one. They replace
nested calls, so the steps read from top to bottom. Use them where a call nests in another call's
first argument: `pipe(text, parse, User.seal)`, not `User.seal(parse(text))`. Fold a variable used
once into the chain. Keep it as a local, next to its use, where the chain would be a later argument,
as `content` is in `writeFile(file, content)`, or where a step needs a value from outside the chain.

Fold a step that only calls a method taking no callback, such as `.join`, into the step before it:
`(lines) => [head, ...lines].join("\n")`, not `(lines) => [head, ...lines]` followed by
`(lines) => lines.join("\n")`. A step that calls a method taking a callback, such as `.map`, stays
apart from the step before it.

Lay out a function body in paragraphs. Keep the lines of one step together, and put a blank line
where the next step starts. Declare a variable in the paragraph that uses it, right before its first
use. Put a call that returns a Result and its failure check on adjacent lines. A line that only
unwraps the Result's `.value` stays with them, and the blank line goes after it.

Gather the guard clauses at the top of the function, and put a blank line before the main work. Put
a blank line before the final `return`, unless the whole body is one paragraph.

Outside the library's `src` and the tests, brace the body of every `if`, `else` and loop. A guard
clause is the exception: an `if` with no `else` whose body is one `return`, `throw`, `continue` or
`break`. The `local/braces` rule enforces this.

Put a Val's type and its companion on adjacent lines, with a blank line before and after the pair.

Place a helper used only inside its module at the end of the file. Declare it with `function`, so
hoisting makes the order safe.

A class is a container that encapsulates state, not data. Data is a Val. Use a class for a cache or
a connection, so `new` at the call site shows where state lives. Do not use `extends`. Keep state in
`#private` fields, and write plain methods rather than arrow-function fields. A class is not
hoisted, so it cannot come after top-level code that uses it. Give it a file of its own instead.

A function with side effects may be a member of a companion, `.implAssoc` included. Name it by what
it does (`read`, `build`, `write`), never `from*` or `parse*`, which read as a pure conversion. A
companion is bundled whole, so a Val shared with the browser has no member that imports `node:*`.

New code uses `@praha/byethrow` for Results and `@praha/error-factory` for errors:
`class X extends ErrorFactory({ name: "X", message, fields }) {}`. Give `name` the class name.
Without the `name` option, the error's `name` property is typed `string`, and a union of errors
cannot narrow on it.

## Bundle Size and Type Cost

Run `vp run check-dist` after changing runtime code or a type. `--size`, `--types` and `--compat`
select the checks. With none, all three run. Update the bundle-size claim in
`docs/src/introduction.md` with `vp run check-dist --size --write`. Leave the claims in `README.md`
and `package.json` to `vp run bump-version`.

Neither `vp check` nor `vp test` runs `check-dist`.

## Testing

Audit the tests every time you write or change one (`/test-audit` in Claude Code, where a Stop hook
enforces it). Elsewhere, follow `skills/test-audit/SKILL.md`.

A separate agent runs it, on the same model, and reports back. Apply the clear findings yourself,
and ask me about the ones you doubt.

Never commit an implementation before writing the tests that cover it.

## Committing

Commit without waiting for a go-ahead. Keep tests, implementation and docs in separate commits. When
the pre-commit `vp check` rejects tests that do not type-check yet, commit them with `--no-verify`.
Do not skip the hook for the implementation commit.

## Releasing

1. The release workflow generates the release notes from the titles of the PRs in the release. Where
   they need a note or emphasis, write it for users in a file outside the repo. Step 3 makes it the
   PR body.
2. In a PR of its own, run `vp run pin-valof origin/main`, which points the scripts' `#valof` at
   that commit, and fix the scripts where `vp check` or `vp run check-dist` fails. Report what
   breaks, and where the new API is awkward to use in the scripts. If a problem is serious, stop the
   release and rework the design.
3. Run `vp run bump-version --release <type> --yes`, where `<type>` is the release type I give, such
   as `patch`. Add `--body-file notes.md` when step 1 wrote one. The script updates the bundle-size
   claims, pushes a release branch, and opens its PR. Options other than `--body-file` go to bumpp.
4. I merge the PR. The release workflow tags the merge commit, publishes to npm, creates the GitHub
   release, and publishes the book.

Step 3 pushes and opens a PR. Run it only on my explicit go-ahead.

## Writing Style

Run `/proofread` over the changed `.md` files before committing them. A separate agent runs it, on
the same model, and reports back. Apply the clear findings yourself, and ask me about the ones you
doubt.

Decide what to leave out before choosing words. Say one thing per sentence. Where a fact does not
change what the reader does, drop it rather than compressing it into a clause.

The repo is English: README, source comments, commit messages, PRs.

`skills/proofread/SKILL.md` holds the sentence-level rules: what to write, and what to flag on the
pass. They apply to every English the repo carries, source comments, commit messages and PR bodies
included, so read it before writing any of those.

### Code and Comments

Self-documenting code first: a comment earns its place only where the declaration cannot carry the
fact. Keep the finding that shaped the code, drop the reasoning that reached it. State a fact once,
at the canonical site, and `{@link}` it from elsewhere.

`/**` on an exported symbol is the reader's hover, so type-level mechanics belong in a `//` comment.
Do not convert a non-exported symbol's JSDoc to `//`: `{@link}` resolves only inside JSDoc, and
maintainers hover internals too. Phrase what stays in the user's terms: "a payload taken from an
existing value fits", not "would not type-check".

Prefer a test to a comment, but check that the test can fail: mutate the source and see whether
anything goes red. When nothing can, the comment is the only record.

Verify a type-system claim with a throwaway probe before writing it, and before defending one
already in the file: `node_modules/.bin/tsc --ignoreConfig --noEmit --strict probe.ts`. To read a
resolved type, assign it to an impossible target (`const x: 0 = value`) and read it out of TS2322.

### Docs

Cut machinery the reader never touches, the reasoning behind a choice defended against an
alternative nobody proposed, and prose restating the example above it. `notes/` is the exception: a
rejected alternative stays there, since that record is what stops the idea coming back.

The README carries what a reader needs before writing code. What they need only once they get it
wrong goes in the JSDoc of the thing it describes, where the hover arrives together with the type
error that raised the question.

Do not name an example type `Box`. Valof reserves it for a planned built-in type.

A GitHub callout needs `<!-- prettier-ignore -->` above it:

```md
<!-- prettier-ignore -->
> [!IMPORTANT]
> Valof is pre-1.0. A minor release can change the API.
```

### Commit Messages

Conventional Commits, lowercase subject. Stay imperative in the body and the PR too. The subject
alone is the default. Write a body only where the diff cannot carry the intent, the same test a
comment has to pass. Bullets, as brief as they go, fragments rather than full sentences.

Do not add a `Co-Authored-By: Claude ...` trailer. The `main` ruleset requires an extra approval for
unattributed changes, and an `noreply@anthropic.com` co-author trips that rule, blocking merges.

### Pull Requests

Bullets, one line each, saying what changed. Lead with the problem where the change does not explain
itself, and show it in a code block rather than a paragraph.

Use `## Why` and `## What changed` once the body is long enough to need navigation.

Include a label from `.github/release.yml`.

Leave `notes/` out of the body. Where a memo correction drove the code change, say what the code
does now.

No `Generated with Claude Code` footer, for the same reason as the commit trailer.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown,
Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend
tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through
`vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for
information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a
`vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do
different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the
project defines a script or task with that name.

## Running Scripts

Run TypeScript and JavaScript files with `vpx <file>`, for example
`vpx ./scripts/seed.ts --dry-run`. It handles enums, decorators, JSX, and tsconfig `paths`, so do
not add `tsx` or `ts-node` to run scripts. `vpx --watch <file>` reruns the file when a file it uses
changes, in place of `tsx watch`. `vp node <file>` runs plain Node.js.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+ release. Add a tool name
to select part of the graph. For example, run `vp toolchain vite`. Use `--global` to ignore the
local `vite-plus` package. Use `vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation,
      run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include
      its output when asking for help.

<!--VITE PLUS END-->
