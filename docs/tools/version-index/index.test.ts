import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

  test("orders prereleases by semver precedence, a number by its value", () => {
    expect(
      versions(["v1.0.0-beta.2", "v1.0.0-beta.10", "v1.0.0-alpha.1", "v1.0.0-rc.1", "v1.0.0-beta"]),
    ).toEqual(["v1.0.0-rc.1", "v1.0.0-beta.10", "v1.0.0-beta.2", "v1.0.0-beta", "v1.0.0-alpha.1"]);
    // The shorter list first, and a number beside a word.
    expect(versions(["v1.0.0-beta", "v1.0.0-beta.2"])).toEqual(["v1.0.0-beta.2", "v1.0.0-beta"]);
    expect(versions(["v1.0.0-1", "v1.0.0-alpha"])).toEqual(["v1.0.0-alpha", "v1.0.0-1"]);
  });

  test("names the release `latest/` holds", () => {
    expect(render(["v0.8.0", "v0.9.0-rc.1"])).toContain(`<a href="latest/">latest (v0.8.0)</a>`);
  });

  test("leaves `latest` unnamed when every version is a prerelease", () => {
    expect(render(["v0.9.0-rc.1"])).toContain(`<a href="latest/">latest</a>`);
  });

  // The release workflow runs it after the tag, so this is the only check before then.
  test("asks for the site root when none is given", () => {
    const script = fileURLToPath(new URL("index.ts", import.meta.url));
    const run = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("usage: node index.ts <site-root>");
  });

  test("writes the index of the site's version directories", () => {
    const site = mkdtempSync(join(tmpdir(), "version-index-"));
    try {
      mkdirSync(join(site, "v0.1.0"));
      writeFileSync(join(site, "v0.2.0"), "");
      const script = fileURLToPath(new URL("index.ts", import.meta.url));
      expect(spawnSync(process.execPath, [script, site]).status).toBe(0);

      const index = readFileSync(join(site, "index.html"), "utf8");
      expect(index).toContain("v0.1.0");
      expect(index).not.toContain("v0.2.0");
    } finally {
      rmSync(site, { recursive: true });
    }
  });
});
