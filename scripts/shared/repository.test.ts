import { expect, test } from "vite-plus/test";

import { output } from "./repository.ts";

test("reports what a failed process printed, or the error where it printed nothing", () => {
  expect(output({ stdout: "a\n", stderr: "b\n" })).toBe("a\nb\n");
  expect(output(Object.assign(new Error("spawn ENOENT"), { stdout: "", stderr: "" }))).toBe(
    "Error: spawn ENOENT",
  );
});
