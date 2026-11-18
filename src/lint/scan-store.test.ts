import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Result as R } from "@praha/byethrow";
import { beforeAll, expect, test } from "vite-plus/test";

import { FilePath } from "./files.ts";
import { Parser } from "./parser.ts";
import { Modules } from "./scan/bindings.ts";
import { Scan } from "./scan/index.ts";
import { ScanCache } from "./scan-cache.ts";
import { ScanStore } from "./scan-store.ts";
import { keeping } from "./integration-tests/support.ts";

let parser: Parser;

beforeAll(async () => {
  parser = R.unwrap(await Parser.load());
});
const A = FilePath.seal("/project/a.ts");
const B = FilePath.seal("/project/b.ts");
const C = FilePath.seal("/project/c.ts");
const MODULES = Modules.create([A, B]);

function scanOf(file: FilePath, text: string, files = MODULES): Scan {
  return Scan.walk(file, Parser.exec(parser, file, text), files, text);
}

/** Runs `act` in a fresh directory, and deletes the directory afterwards. */
function inDirectory(act: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "valof-scan-store-"));
  try {
    act(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("returns a saved scan for the same file and text to a store opened later", () => {
  inDirectory((dir) => {
    const path = join(dir, "scans.json");
    const scan = scanOf(A, 'import { x } from "./b";\n');
    const first = new ScanStore(path, "linter");
    first.keep(A, 'import { x } from "./b";\n', scan);
    first.save();

    const later = new ScanStore(path, "linter");
    expect(later.find(A, 'import { x } from "./b";\n')).toEqual(scan);
    expect(later.find(A, 'import { y } from "./b";\n')).toBeUndefined();
    expect(later.find(B, 'import { x } from "./b";\n')).toBeUndefined();
  });
});

test("returns nothing once the linter's files change", () => {
  inDirectory((dir) => {
    const path = join(dir, "scans.json");
    const first = new ScanStore(path, "linter");
    first.keep(A, "export {};\n", scanOf(A, "export {};\n"));
    first.save();

    expect(new ScanStore(path, "changed linter").find(A, "export {};\n")).toBeUndefined();
  });
});

test("saves only the scans found or kept since it opened", () => {
  inDirectory((dir) => {
    const path = join(dir, "scans.json");
    const first = new ScanStore(path, "linter");
    first.keep(A, "export {};\n", scanOf(A, "export {};\n"));
    first.keep(B, "export {};\n", scanOf(B, "export {};\n"));
    first.save();

    const second = new ScanStore(path, "linter");
    second.find(A, "export {};\n");
    second.keep(C, "export {};\n", scanOf(C, "export {};\n"));
    second.save();

    const third = new ScanStore(path, "linter");
    expect(third.find(A, "export {};\n")).toBeDefined();
    expect(third.find(B, "export {};\n")).toBeUndefined();
    expect(third.find(C, "export {};\n")).toBeDefined();
  });
});

test("removes the temporary files of saves that stopped halfway, and not one a process is still writing", () => {
  inDirectory((dir) => {
    const path = join(dir, "scans.json");
    writeFileSync(`${path}.1.stale`, "");
    const past = new Date(Date.now() - 10 * 60_000);
    utimesSync(`${path}.1.stale`, past, past);
    writeFileSync(`${path}.2.writing`, "");
    writeFileSync(join(dir, "other.json.1.stale"), "");
    utimesSync(join(dir, "other.json.1.stale"), past, past);

    const store = new ScanStore(path, "linter");
    store.keep(A, "export {};\n", scanOf(A, "export {};\n"));
    store.save();
    expect(readdirSync(dir).sort()).toEqual([
      "other.json.1.stale",
      "scans.json",
      "scans.json.2.writing",
    ]);
  });
});

test("starts empty from a file it cannot read, and does not throw where it cannot write", () => {
  inDirectory((dir) => {
    const path = join(dir, "scans.json");
    writeFileSync(path, "{ not json");
    const store = new ScanStore(path, "linter");
    expect(store.find(A, "export {};\n")).toBeUndefined();

    // A file where the directory would go.
    writeFileSync(join(dir, "blocked"), "");
    const blocked = new ScanStore(join(dir, "blocked", "scans.json"), "linter");
    blocked.keep(A, "export {};\n", scanOf(A, "export {};\n"));
    expect(() => blocked.save()).not.toThrow();
  });
});

test("opens a store under node_modules/.cache, and none where there is no node_modules or VALOF_LINT_CACHE is 0", () => {
  inDirectory((dir) => {
    const bare = ScanStore.open(dir, keeping());
    bare.keep(A, "export {};\n", scanOf(A, "export {};\n"));
    bare.save();
    expect(existsSync(join(dir, "node_modules"))).toBe(false);

    mkdirSync(join(dir, "node_modules"));
    const off = ScanStore.open(dir, { ...keeping(), VALOF_LINT_CACHE: "0" });
    off.keep(A, "export {};\n", scanOf(A, "export {};\n"));
    off.save();
    expect(existsSync(join(dir, "node_modules", ".cache"))).toBe(false);

    const store = ScanStore.open(dir, keeping());
    store.keep(A, "export {};\n", scanOf(A, "export {};\n"));
    store.save();
    expect(existsSync(join(dir, "node_modules", ".cache", "valof-lint", "scans.json"))).toBe(true);
  });
});

test("lets a new cache take a stored scan while its imports resolve to the same files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "valof-scan-store-"));
  try {
    const path = join(dir, "scans.json");
    // Kept under the text that imports `x`, so a scan taken from the store imports `y`.
    const marked = scanOf(A, 'import { y } from "./c";\n');
    const first = new ScanStore(path, "linter");
    first.keep(A, 'import { x } from "./c";\n', marked);
    first.save();

    let loads = 0;
    const load = async () => {
      loads++;
      return R.succeed(parser);
    };
    const sources: [FilePath, string][] = [[A, 'import { x } from "./c";\n']];
    const stored = R.unwrap(
      await new ScanCache(new ScanStore(path, "linter")).scan(load, sources, MODULES),
    );
    expect(Object.keys(stored[0]?.imported ?? {})).toEqual(["y"]);
    expect(loads).toBe(0);

    const walked = R.unwrap(
      await new ScanCache(new ScanStore(path, "linter")).scan(
        load,
        sources,
        Modules.create([A, B, C]),
      ),
    );
    expect(Object.keys(walked[0]?.imported ?? {})).toEqual(["x"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
