import { Result as R } from "@praha/byethrow";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { runChecks } from "./run.ts";

let logged: string[];

beforeEach(() => {
  logged = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => logged.push(line));
  vi.spyOn(console, "error").mockImplementation((line: string) => logged.push(line));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runChecks", () => {
  test("runs every check after one fails or throws, and exits 1 with the summary", async () => {
    const ran: string[] = [];
    const check = (name: string, run: () => Promise<R.Result<void, Error>>) => ({
      name,
      run: () => (ran.push(name), run()),
    });
    const code = await runChecks([
      check("size", async () => R.fail(new Error("over budget"))),
      check("types", async () => {
        throw new Error("tsc crashed");
      }),
      check("compat", async () => R.succeed()),
    ]);
    expect(ran).toEqual(["size", "types", "compat"]);
    expect(code).toBe(1);
    expect(logged).toContain("\nover budget");
    expect(logged).toContain("\ntsc crashed");
    expect(logged.slice(-3)).toEqual(["  size    fail", "  types   fail", "  compat  pass"]);
  });

  test("exits 0 when every check passes", async () => {
    expect(await runChecks([{ name: "size", run: async () => R.succeed() }])).toBe(0);
  });
});
