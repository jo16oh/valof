import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    dts: {
      tsgo: true,
    },
    exports: true,
  },
  lint: {
    // Its `valof` import resolves through `scripts/ts-compatibility/tsconfig.json`, which aims the
    // name at the built declarations. That config owns the file; this one cannot see it.
    ignorePatterns: ["scripts/ts-compatibility/public-api.ts"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
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
