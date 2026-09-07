import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    entry: ["src/index.ts", "src/lint-cli.ts"],
    dts: {
      tsgo: true,
    },
    exports: {
      // The CLI ships as a command, not as an import, so it stays out of the public exports.
      // Naming it here as well: left to auto-detect, the command takes the package's own name.
      exclude: ["lint-cli"],
      bin: {
        "valof-lint": "./src/lint-cli.ts",
      },
    },
  },
  // Deliberately unresolvable and deliberately dead: the fixtures are input to `valof-lint`,
  // not code this package compiles.
  lint: {
    // `public-api.ts` resolves its `valof` import through `scripts/ts-compatibility/tsconfig.json`,
    // which aims the name at the built declarations. That config owns the file; this one cannot
    // see it.
    ignorePatterns: ["tests/fixtures/**", "scripts/ts-compatibility/public-api.ts"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ["tests/fixtures/**"],
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
