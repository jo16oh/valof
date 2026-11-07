import { expect, test } from "vite-plus/test";

import { Mode } from "./index.ts";
import { CompileError, NoChunkError } from "./toolchain.ts";

test("names the mode in a build error", () => {
  expect(new NoChunkError({ mode: Mode.production.create({}) }).message).toBe(
    "no chunk emitted for production",
  );
  expect(
    new CompileError({ mode: Mode.development.create({}), step: "the build", detail: "boom" })
      .message,
  ).toBe("the build failed for development: boom");
});
