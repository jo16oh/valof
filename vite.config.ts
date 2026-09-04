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
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
