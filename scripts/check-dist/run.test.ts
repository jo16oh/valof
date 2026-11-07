import { Result as R } from "@praha/byethrow";
import { Val } from "#valof";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { Check, runChecks } from "./run.ts";

let logged: string[];
let ran: string[];

beforeEach(() => {
  logged = [];
  ran = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => logged.push(line));
  vi.spyOn(console, "error").mockImplementation((line: string) => logged.push(line));
});

afterEach(() => {
  vi.restoreAllMocks();
});

type Stub = Val<"Stub", { name: string; outcome: "pass" | "fail" | "throw" }, Check>;
const Stub = Val.companion<Stub>()
  .implTrait(Check, () => ({
    run: async (stub) => {
      ran.push(stub.name);
      if (stub.outcome === "throw") throw new Error(`${stub.name} crashed`);
      return stub.outcome === "pass" ? R.succeed() : R.fail(new Error(`${stub.name} failed`));
    },
  }))
  .build();

const check = (name: string, outcome: "pass" | "fail" | "throw") =>
  Check.dyn(Stub, Stub.seal({ name, outcome }));

describe("runChecks", () => {
  test("runs every check after one fails or throws, and exits 1 with the summary", async () => {
    const code = await runChecks([
      check("size", "fail"),
      check("types", "throw"),
      check("compat", "pass"),
    ]);
    expect(ran).toEqual(["size", "types", "compat"]);
    expect(code).toBe(1);
    expect(logged).toContain("\nsize failed");
    expect(logged).toContain("\ntypes crashed");
    expect(logged.slice(-3)).toEqual(["  size    fail", "  types   fail", "  compat  pass"]);
  });

  test("exits 0 when every check passes", async () => {
    expect(await runChecks([check("size", "pass")])).toBe(0);
  });
});
