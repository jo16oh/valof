import { Result as R } from "@praha/byethrow";
import { describe, expect, test } from "vite-plus/test";

import { Selection } from "./selection.ts";

const parsed = (...argv: string[]) => {
  const result = Selection.fromArgv(argv);
  return R.isSuccess(result) ? { ...result.value } : result.error.message;
};

describe("Selection.fromArgv", () => {
  test("runs every check when none is named", () => {
    expect(parsed()).toEqual({
      size: true,
      types: true,
      compat: true,
      release: false,
      write: false,
    });
  });

  test("runs the checks named, and only those", () => {
    expect(parsed("--types", "--compat")).toEqual({
      size: false,
      types: true,
      compat: true,
      release: false,
      write: false,
    });
  });

  test("takes --release and --write beside size, named or implied", () => {
    expect(parsed("--release", "--write")).toMatchObject({
      size: true,
      release: true,
      write: true,
    });
    expect(parsed("--size", "--write")).toMatchObject({ size: true, write: true });
  });

  test("refuses --write without the size check, which is what it rewrites", () => {
    expect(parsed("--types", "--write")).toBe(
      "check-dist: --write rewrites the bundle-size claims, which only --size measures",
    );
  });

  test("refuses a flag it does not know, and a path", () => {
    expect(parsed("--ts")).toBe("check-dist: unknown option --ts");
    expect(parsed("README.md")).toBe("check-dist: unexpected argument README.md");
  });
});
