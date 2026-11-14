import { registerHooks } from "node:module";

// Makes the project look like it has no TypeScript, so the command can prove it does not need one
// on a machine that has it installed for the package's own type checks.
registerHooks({
  resolve: (specifier, context, next) => {
    if (!specifier.startsWith("typescript")) return next(specifier, context);
    throw Object.assign(new Error(`Cannot find package '${specifier}'`), {
      code: "ERR_MODULE_NOT_FOUND",
    });
  },
});
