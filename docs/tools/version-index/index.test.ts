import { describe, expect, test } from "vite-plus/test";

import { render, versions } from "./index.ts";

describe("version index", () => {
  test("orders newest first, a release above its own prereleases", () => {
    expect(versions(["v0.9.0", "latest", "v0.10.0", "v0.9.0-beta.1", "v0.7.0", "assets"])).toEqual([
      "v0.10.0",
      "v0.9.0",
      "v0.9.0-beta.1",
      "v0.7.0",
    ]);
  });

  test("names the release `latest/` holds", () => {
    expect(render(["v0.8.0", "v0.9.0-rc.1"])).toContain(`<a href="latest/">latest (v0.8.0)</a>`);
  });

  test("leaves `latest` unnamed when every version is a prerelease", () => {
    expect(render(["v0.9.0-rc.1"])).toContain(`<a href="latest/">latest</a>`);
  });
});
