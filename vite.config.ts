import { defineConfig } from "vite-plus";

import lint from "./oxlint.config.ts";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
    ".github/workflows/*.yml": ["actionlint", "zizmor --offline"],
  },
  pack: {
    // Named, so the import path is the name a user writes rather than where the file sits.
    // The runtime entries come from `tsc` (`tsconfig.build.json`), file per module. A bundled
    // entry turns `Val`'s namespace into an object, and the user's bundler keeps every member.
    entry: {
      "eslint-plugin/index": "src/lint/eslint-plugin/index.ts",
      "lint-cli": "src/lint/main.ts",
      "eslint-plugin/worker": "src/lint/eslint-plugin/worker.ts",
    },
    dts: {
      // A config file in TypeScript reads the plugin's type. The linter's API is the CLI and the
      // plugin alone, so its other entries ship no declarations.
      entry: "src/lint/eslint-plugin/index.ts",
    },
    // The linter's own dependencies, inlined so that installing valof installs nothing more.
    deps: { onlyBundle: ["@praha/byethrow", "@praha/error-factory"] },
    // The linter's Vals are its own, built from the parser's output, so valof's development checks
    // guard no user code here. A command runs without `NODE_ENV`, which would leave them on.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    exports: {
      // The CLI ships as a command, not as an import, so it stays out of the public exports.
      // Naming it here as well: left to auto-detect, the command takes the package's own name.
      exclude: ["lint-cli", "eslint-plugin/worker"],
      // The plugin is the one entry left, which comes in as the package root.
      customExports: ({ ".": _plugin, ...exports }) => ({
        ".": "./dist/index.js",
        // For a consumer with `declaration: true`.
        "./internal/*": "./dist/*.js",
        "./eslint-plugin": "./dist/eslint-plugin/index.mjs",
        ...exports,
      }),
      bin: {
        "valof-lint": "./src/lint/main.ts",
      },
    },
  },
  lint,
  // Keeps no scans on disk, so no test reads the scans another test left in node_modules/.cache.
  // The store's own tests turn the store back on.
  test: { env: { VALOF_LINT_CACHE: "0" } },
  fmt: {
    ignorePatterns: ["src/lint/**/fixtures/**", "**/*.hbs"],
    proseWrap: "always",
    overrides: [
      {
        // Japanese has no spaces between words, so the only break opportunities are the
        // ones around inline code, and wrapping there strands particles at line starts.
        files: ["notes/**/*.md"],
        options: { proseWrap: "preserve" },
      },
    ],
  },
});
