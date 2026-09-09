import { defineConfig } from "vite-plus";

import lint from "./oxlint.config.ts";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    // Named, so the import path is the name a user writes rather than where the file sits.
    entry: {
      index: "src/index.ts",
      lint: "src/lint/index.ts",
      "eslint-plugin": "src/lint/eslint-plugin.ts",
      "lint-cli": "src/lint/cli.ts",
    },
    dts: {
      tsgo: true,
    },
    exports: {
      // The CLI ships as a command, not as an import, so it stays out of the public exports.
      // Naming it here as well: left to auto-detect, the command takes the package's own name.
      exclude: ["lint-cli"],
      bin: {
        "valof-lint": "./src/lint/cli.ts",
      },
    },
  },
  lint,
  fmt: {
    ignorePatterns: ["tests/lint/**/fixtures/**"],
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
