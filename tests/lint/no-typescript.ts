import { registerHooks } from "node:module";

// Makes the project look like it has no TypeScript, so the command's instruction can be tested
// on a machine that has one. The linter resolves it from the project it lints, not from valof.
registerHooks({
  resolve: (specifier, context, next) => {
    if (!specifier.startsWith("typescript")) return next(specifier, context);
    throw Object.assign(new Error(`Cannot find package '${specifier}'`), {
      code: "ERR_MODULE_NOT_FOUND",
    });
  },
});
