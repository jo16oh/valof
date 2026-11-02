import { registerHooks } from "node:module";

// The linter reads types through TypeScript 7.1, and the package builds with 7.0, so the tests
// load 7.1 under the name it is installed as.
registerHooks({
  resolve: (specifier, context, next) =>
    next(specifier === "typescript/sync" ? "typescript-7.1/sync" : specifier, context),
});
