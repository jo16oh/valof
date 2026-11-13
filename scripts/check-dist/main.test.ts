import { describe, expect, test } from "vite-plus/test";

import { output, run } from "../shared/repository.ts";

describe("check-dist", () => {
  // An option it does not know stops it before `build`, so the test builds nothing.
  test("runs as a command", async () => {
    const ran = await run(process.execPath, [
      new URL("main.ts", import.meta.url).pathname,
      "--bogus",
    ]).catch((error: unknown) => error as { code: number; stderr: string });

    expect(ran).toMatchObject({ code: 2 });
    expect(output(ran)).toContain("check-dist: unknown option --bogus");
  });
});
