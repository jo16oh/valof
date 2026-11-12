import { Result as R } from "@praha/byethrow";
import { Val } from "#valof";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { IncompatibleError } from "./compat/index.ts";
import { Check, Report, runChecks } from "./run.ts";

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

type Note = Val<"Note", { text: string; fails: boolean }, Report>;
const Note = Val.companion<Note>()
  .implTrait(Report, () => ({
    render: (note) => note.text,
    verdict: (note) =>
      note.fails ? R.fail(new IncompatibleError({ failed: [note.text] })) : R.succeed(),
  }))
  .build();

// "fail" reports and then fails its verdict; "reject" fails before it has a report.
type Stub = Val<"Stub", { name: string; outcome: "pass" | "fail" | "reject" | "throw" }, Check>;
const Stub = Val.companion<Stub>()
  .implTrait(Check, () => ({
    run: async (stub) => {
      ran.push(stub.name);
      if (stub.outcome === "throw") throw new Error(`${stub.name} crashed`);
      if (stub.outcome === "reject") return R.fail(new IncompatibleError({ failed: [stub.name] }));
      return R.succeed(
        Report.dyn(
          Note,
          Note.seal({ text: `${stub.name} report`, fails: stub.outcome === "fail" }),
        ),
      );
    },
  }))
  .build();

const check = (name: string, outcome: Stub["outcome"]) =>
  Check.dyn(Stub, Stub.seal({ name, outcome }));

describe("runChecks", () => {
  test("runs every check after one fails, rejects or throws, and exits 1 with the summary", async () => {
    const code = await runChecks([
      check("size", "fail"),
      check("types", "reject"),
      check("compat", "throw"),
      check("pack", "pass"),
    ]);
    expect(ran).toEqual(["size", "types", "compat", "pack"]);
    expect(code).toBe(1);
    // A report prints before its verdict, and a check that fails before reporting prints none.
    expect(logged.slice(0, 4)).toEqual([
      "\n# size\n",
      "size report",
      `\n${new IncompatibleError({ failed: ["size report"] }).message}`,
      "\n# types\n",
    ]);
    expect(logged.slice(logged.indexOf("\n# types\n") + 1, logged.indexOf("\n# compat\n"))).toEqual(
      [`\n${new IncompatibleError({ failed: ["types"] }).message}`],
    );
    expect(logged).toContain("\ncompat crashed");
    expect(logged).toContain("pack report");
    expect(logged.slice(-4)).toEqual([
      "  size    fail",
      "  types   fail",
      "  compat  fail",
      "  pack    pass",
    ]);
  });

  test("exits 0 when every check passes", async () => {
    expect(await runChecks([check("size", "pass")])).toBe(0);
  });
});
