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
