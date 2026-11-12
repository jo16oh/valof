import { expect, test } from "vite-plus/test";

import { CompileError, NoChunkError } from "./toolchain.ts";

test("names the mode in a build error", () => {
  expect(new NoChunkError({ mode: "production" }).message).toBe("no chunk emitted for production");
  expect(new CompileError({ mode: "development", step: "the build", detail: "boom" }).message).toBe(
    "the build failed for development: boom",
  );
});
