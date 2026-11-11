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
import { expect, test } from "vite-plus/test";

import { FilePath } from "../../../src/lint/files.ts";
import { Parser } from "../../../src/lint/parser.ts";
import { Modules } from "../../../src/lint/scan/bindings.ts";
import { Scan } from "../../../src/lint/scan/index.ts";
import { ScanCache } from "../../../src/lint/scan-cache.ts";
import { ScanStore } from "../../../src/lint/scan-store.ts";
import { keeping } from "../support.ts";

const parser = R.unwrap(await Parser.load());
const a = FilePath.seal("/project/a.ts");
const b = FilePath.seal("/project/b.ts");
const c = FilePath.seal("/project/c.ts");
const modules = Modules.create([a, b]);

const scanOf = (file: FilePath, text: string, files = modules): Scan =>
  Scan.walk(file, Parser.exec(parser, file, text), files, text);

/** Runs `act` in a fresh directory, and deletes the directory afterwards. */
const inDirectory = (act: (dir: string) => void): void => {
  const dir = mkdtempSync(join(tmpdir(), "valof-scan-store-"));
  try {
    act(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("returns a saved scan for the same file and text to a store opened later", () => {
  inDirectory((dir) => {
    const path = join(dir, "scans.json");
    const scan = scanOf(a, 'import { x } from "./b";\n');
    const first = new ScanStore(path, "linter");
    first.keep(a, 'import { x } from "./b";\n', scan);
    first.save();

    const later = new ScanStore(path, "linter");
    expect(later.find(a, 'import { x } from "./b";\n')).toEqual(scan);
    expect(later.find(a, 'import { y } from "./b";\n')).toBeUndefined();
    expect(later.find(b, 'import { x } from "./b";\n')).toBeUndefined();
  });
});

test("returns nothing once the linter's files change", () => {
  inDirectory((dir) => {
    const path = join(dir, "scans.json");
    const first = new ScanStore(path, "linter");
    first.keep(a, "export {};\n", scanOf(a, "export {};\n"));
    first.save();

    expect(new ScanStore(path, "changed linter").find(a, "export {};\n")).toBeUndefined();
  });
});

test("saves only the scans found or kept since it opened", () => {
  inDirectory((dir) => {
    const path = join(dir, "scans.json");
    const first = new ScanStore(path, "linter");
    first.keep(a, "export {};\n", scanOf(a, "export {};\n"));
    first.keep(b, "export {};\n", scanOf(b, "export {};\n"));
    first.save();

    const second = new ScanStore(path, "linter");
    second.find(a, "export {};\n");
    second.keep(c, "export {};\n", scanOf(c, "export {};\n"));
    second.save();

    const third = new ScanStore(path, "linter");
    expect(third.find(a, "export {};\n")).toBeDefined();
    expect(third.find(b, "export {};\n")).toBeUndefined();
    expect(third.find(c, "export {};\n")).toBeDefined();
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
    store.keep(a, "export {};\n", scanOf(a, "export {};\n"));
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
    expect(store.find(a, "export {};\n")).toBeUndefined();

    // A file where the directory would go.
    writeFileSync(join(dir, "blocked"), "");
    const blocked = new ScanStore(join(dir, "blocked", "scans.json"), "linter");
    blocked.keep(a, "export {};\n", scanOf(a, "export {};\n"));
    expect(() => blocked.save()).not.toThrow();
  });
});

test("opens a store under node_modules/.cache, and none where there is no node_modules or VALOF_LINT_CACHE is 0", () => {
  inDirectory((dir) => {
    const bare = ScanStore.open(dir, keeping());
    bare.keep(a, "export {};\n", scanOf(a, "export {};\n"));
    bare.save();
    expect(existsSync(join(dir, "node_modules"))).toBe(false);

    mkdirSync(join(dir, "node_modules"));
    const off = ScanStore.open(dir, { ...keeping(), VALOF_LINT_CACHE: "0" });
    off.keep(a, "export {};\n", scanOf(a, "export {};\n"));
    off.save();
    expect(existsSync(join(dir, "node_modules", ".cache"))).toBe(false);

    const store = ScanStore.open(dir, keeping());
    store.keep(a, "export {};\n", scanOf(a, "export {};\n"));
    store.save();
    expect(existsSync(join(dir, "node_modules", ".cache", "valof-lint", "scans.json"))).toBe(true);
  });
});

test("lets a new cache take a stored scan while its imports resolve to the same files", () => {
  inDirectory((dir) => {
    const path = join(dir, "scans.json");
    // Kept under the text that imports `x`, so a scan taken from the store imports `y`.
    const marked = scanOf(a, 'import { y } from "./c";\n');
    const first = new ScanStore(path, "linter");
    first.keep(a, 'import { x } from "./c";\n', marked);
    first.save();

    const sources: [FilePath, string][] = [[a, 'import { x } from "./c";\n']];
    const [stored] = new ScanCache(new ScanStore(path, "linter")).scan(parser, sources, modules);
    expect(Object.keys(stored?.imported ?? {})).toEqual(["y"]);

    const [walked] = new ScanCache(new ScanStore(path, "linter")).scan(
      parser,
      sources,
      Modules.create([a, b, c]),
    );
    expect(Object.keys(walked?.imported ?? {})).toEqual(["x"]);
  });
});
