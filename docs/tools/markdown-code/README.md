# Fenced code blocks

The fences of a chapter, read once for the two tools that act on them: `mdbook-shiki` highlights
them, `twoslash` typechecks them.

The language and the attributes after it are separate, so a `ts,ignore` fence highlights as
TypeScript and still tells the check to leave the block out. The spelling follows mdBook's own
`rust,ignore`. A colon would not work: mdast reads the whole info word as the language, so
`ts:ignore` is a language of that name, and highlighting falls back to plain text.
