import { Result as R } from "@praha/byethrow";
import { describe, expect, test } from "vite-plus/test";

import { Selection } from "./selection.ts";

const parsed = (...argv: string[]) => {
  const result = Selection.fromArgv(argv);
  return R.isSuccess(result) ? result.value : result.error.message;
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

  test.each([
    [["--size"], { size: true, types: false, compat: false }],
    [["--types"], { size: false, types: true, compat: false }],
    [["--compat"], { size: false, types: false, compat: true }],
    [["--types", "--compat"], { size: false, types: true, compat: true }],
  ])("runs the checks named, and only those: %j", (argv, checks) => {
    expect(parsed(...argv)).toEqual({ ...checks, release: false, write: false });
  });

  test("accepts --release and --write with the size check, named or implied", () => {
    expect(parsed("--release", "--write")).toMatchObject({
      size: true,
      release: true,
      write: true,
    });
    expect(parsed("--size", "--write")).toMatchObject({ size: true, write: true });
  });

  test("refuses --write without the size check", () => {
    expect(parsed("--types", "--write")).toBe(
      "check-dist: --write rewrites the bundle-size claims, which only --size checks",
    );
  });

  test("refuses an unknown flag, and a path", () => {
    expect(parsed("--ts")).toBe("check-dist: unknown option --ts");
    expect(parsed("README.md")).toBe("check-dist: unexpected argument README.md");
  });
});
