# Sidebar heading links

The preprocessor reads the level 2-6 headings in every chapter and writes them to
`.generated/mdbook-sidebar/headings.js`. `sidebar.js` turns each chapter with headings into a native
`details` accordion. The standard `mdbook build` and `mdbook serve` commands both run the
preprocessor.

Each chapter opens and closes independently. All chapters are open by default. Set `default-open` to
`false` to start with every chapter closed.

Links outside the bulleted chapter list in `SUMMARY.md` stay plain. They receive neither an
accordion nor the space reserved for its marker.

The preprocessor writes `headings.js` only when its content changes. This prevents `mdbook serve`
from treating its own output as a new source change.

## Setup

In `theme/index.hbs`, replace the default sidebar scrollbox:

```hbs
<mdbook-sidebar-scrollbox class="sidebar-scrollbox"></mdbook-sidebar-scrollbox>
```

with:

```hbs
<mdbook-sidebar-accordion>
  <mdbook-sidebar-scrollbox class="sidebar-scrollbox"></mdbook-sidebar-scrollbox>
</mdbook-sidebar-accordion>
```

Copy this directory to `tools/mdbook-sidebar`, then add the preprocessor and assets to `book.toml`:

```toml
[preprocessor.sidebar]
command = "node tools/mdbook-sidebar/index.ts"
renderers = ["html"]
default-open = true

[output.html]
additional-css = ["tools/mdbook-sidebar/sidebar.css"]
additional-js = [".generated/mdbook-sidebar/headings.js", "tools/mdbook-sidebar/sidebar.js"]
```

Ignore the generated heading data:

```gitignore
.generated
```
