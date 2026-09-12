# Shiki theme override

`docs/theme/index.hbs` is based on the mdBook 0.5.4 default template. It changes only the
Highlight.js integration.

## Difference from the default

```diff
--- mdbook-0.5.4/theme/index.hbs
+++ docs/theme/index.hbs
@@
 <html lang="{{ language }}" class="{{ default_theme }} sidebar-visible" dir="{{ text_direction }}">
+    <!-- Based on the mdBook 0.5.4 template. Highlight.js is omitted for Shiki. -->
@@
-        <!-- Highlight.js Stylesheets -->
-        <link rel="stylesheet" id="mdbook-highlight-css" href="{{ resource "highlight.css" }}">
-        <link rel="stylesheet" id="mdbook-tomorrow-night-css" href="{{ resource "tomorrow-night.css" }}">
-        <link rel="stylesheet" id="mdbook-ayu-highlight-css" href="{{ resource "ayu-highlight.css" }}">
+        <!-- mdBook 0.5.4's book.js expects these controls when it changes themes. -->
+        <link rel="stylesheet" id="mdbook-highlight-css">
+        <link rel="stylesheet" id="mdbook-tomorrow-night-css">
+        <link rel="stylesheet" id="mdbook-ayu-highlight-css">
@@
         <script src="{{ resource "clipboard.min.js" }}"></script>
-        <script src="{{ resource "highlight.js" }}"></script>
+        <script>
+            // mdBook 0.5.4's book.js calls this before it initializes the theme menu.
+            window.hljs = { configure() {}, highlightBlock() {} };
+        </script>
         <script src="{{ resource "book.js" }}"></script>
```

The empty stylesheet elements preserve the controls that mdBook's theme switcher uses. The `hljs`
shim lets `book.js` finish initialization without running Highlight.js. Removing either
compatibility layer breaks the theme menu.

## Update for a new mdBook version

1. Set the new mdBook version in `mise.toml` and install it.
2. Generate its default theme.

   ```bash
   directory=$(mktemp -d)
   mdbook init --theme "$directory"
   ```

3. Replace `docs/theme/index.hbs` with the generated `theme/index.hbs`.
4. Reapply the three changes shown above. Check the new `book.js` first. Remove a compatibility
   layer if the new script no longer needs it.
5. Inspect the resulting difference.

   ```bash
   diff -u "$directory/theme/index.hbs" docs/theme/index.hbs
   ```

6. Run the checks.

   ```bash
   vp check
   vp test
   vp run docs:build
   vp run docs:test
   ```

7. Open the built book in a browser. Confirm that the theme menu opens, each theme changes Shiki's
   colors, and the page does not request Highlight.js files.
