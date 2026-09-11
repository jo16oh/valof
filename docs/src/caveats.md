# Caveats

**Do not use Valof to build a library.** A companion's functions are not tree-shakeable, and `Val`
is one object, so the import alone brings `sealer`, `companion`, `unwrap` and everything they reach.

**When running oxlint on Linux, limit its thread pool to one.** The rules read types through
`tsc --lsp`, a child process, and oxlint reserves around 6 GB of address space per thread. Linux
refuses to fork when there isn't enough memory, so every file fails with `spawn ENOMEM`.

```bash
RAYON_NUM_THREADS=1 oxlint
```

ESLint is unaffected, and so is TypeScript 5 / 6, which is read in-process. The limit will be lifted
once [oxc#20331](https://github.com/oxc-project/oxc/issues/20331) lands.

**A `__proto__` key survives.** It is a legal JSON key, and round trips come first, so sealing keeps
it as an own property rather than dropping data. That is inert inside a value, but not in code that
merges a payload with `Object.assign` or a recursive merge: there, assigning the key sets a
prototype instead of copying it. Sanitize untrusted input yourself.

**A deeply nested payload overflows the stack.** Copying and comparing are both recursive, so a
payload a few thousand levels deep, or a cyclic one, throws a `RangeError`. What you build yourself
never comes close; input parsed from a request can, so bound its depth before sealing it.
