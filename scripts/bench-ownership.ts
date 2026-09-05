/**
 * Ownership tracking for the copy in `seal`, measured.
 *
 * A value's own subtrees are already immutable, so re-copying them on every `with` is waste.
 * Skipping that copy needs a way to tell "the library minted this node" from "this came from
 * the caller", and every candidate pays to record it. This measures what that costs and what
 * it buys, across the shapes and the call paths where the answer differs.
 *
 * Variants:
 *   plain      what ships today: copy the whole tree, every time
 *   ws-root    WeakSet, marking only the object `seal` returns
 *   ws-all     WeakSet, marking every node the copy creates
 *   interior   WeakSet, marking a node only when it has an object or array child
 *   K=n        WeakMap<node, subtree size>, marking a node whose subtree has >= n nodes
 *
 * `interior` is `K=2` without the counter: a subtree of two or more nodes is exactly a node
 * with at least one object child. Anything above K=2 needs the sizes, so it needs the WeakMap.
 *
 * Run: node scripts/bench-ownership.ts
 */

type Node = Record<string, unknown>;
type Copy = (value: unknown) => unknown;
type Variant = { seal: Copy; equals: (a: unknown, b: unknown) => boolean };

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

function plain(): Variant {
  const copy: Copy = (v) => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return (v as unknown[]).map(copy);
    const out: Node = {};
    for (const k of Object.keys(v)) out[k] = copy((v as Node)[k]);
    return out;
  };
  return { seal: copy, equals: deepEquals };
}

function weakSet(markAll: boolean): Variant {
  const owned = new WeakSet<object>();
  const copy: Copy = (v) => {
    if (v === null || typeof v !== "object") return v;
    if (owned.has(v)) return v;
    let out: unknown;
    if (Array.isArray(v)) {
      out = (v as unknown[]).map(copy);
    } else {
      const o: Node = {};
      for (const k of Object.keys(v)) o[k] = copy((v as Node)[k]);
      out = o;
    }
    if (markAll) owned.add(out as object);
    return out;
  };
  const seal: Copy = markAll
    ? copy
    : (v) => {
        const out = copy(v);
        if (out !== null && typeof out === "object") owned.add(out);
        return out;
      };
  return { seal, equals: deepEquals };
}

function interior(): Variant {
  const owned = new WeakSet<object>();
  // Set by every return, read by the caller: "was the value I just copied an object?".
  // A flag beats returning a tuple, which would allocate once per node.
  let wasObject = false;
  const copy: Copy = (v) => {
    if (v === null || typeof v !== "object") {
      wasObject = false;
      return v;
    }
    wasObject = true;
    if (owned.has(v)) return v;
    let out: unknown;
    let nested = false;
    if (Array.isArray(v)) {
      out = (v as unknown[]).map((element) => {
        const copied = copy(element);
        if (wasObject) nested = true;
        return copied;
      });
    } else {
      const o: Node = {};
      for (const k of Object.keys(v)) {
        o[k] = copy((v as Node)[k]);
        if (wasObject) nested = true;
      }
      out = o;
    }
    if (nested) owned.add(out as object);
    wasObject = true;
    return out;
  };
  return { seal: copy, equals: deepEquals };
}

function bySize(threshold: number): Variant {
  const sizes = new WeakMap<object, number>();
  // Running total rather than a return value, for the same reason `interior` uses a flag.
  let nodes = 0;
  const copy: Copy = (v) => {
    if (v === null || typeof v !== "object") return v;
    const known = sizes.get(v);
    // Owned nodes carry their size, so a re-seal keeps counting and the decision stays
    // stable: a subtree that was worth marking is still worth marking next time.
    if (known !== undefined) {
      nodes += known;
      return v;
    }
    const before = nodes;
    let out: unknown;
    if (Array.isArray(v)) {
      out = (v as unknown[]).map(copy);
    } else {
      const o: Node = {};
      for (const k of Object.keys(v)) o[k] = copy((v as Node)[k]);
      out = o;
    }
    const size = nodes - before + 1;
    nodes = before + size;
    if (size >= threshold) sizes.set(out as object, size);
    return out;
  };
  return {
    seal: (v) => {
      nodes = 0;
      return copy(v);
    },
    equals: deepEquals,
  };
}

/** The library's default comparison, minus the `undefined`-key handling the shapes never hit. */
function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const arr = Array.isArray(a);
  if (arr !== Array.isArray(b)) return false;
  if (arr) {
    const x = a as unknown[];
    const y = b as unknown[];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!deepEquals(x[i], y[i])) return false;
    return true;
  }
  const x = a as Node;
  const y = b as Node;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  for (const k of keys) {
    if (!Object.hasOwn(y, k)) return false;
    if (!deepEquals(x[k], y[k])) return false;
  }
  return true;
}

const VARIANTS: ReadonlyArray<readonly [string, () => Variant]> = [
  ["plain", () => plain()],
  ["ws-all", () => weakSet(true)],
  ["ws-root", () => weakSet(false)],
  ["interior", () => interior()],
  ["K=8", () => bySize(8)],
  ["K=32", () => bySize(32)],
];

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

const money = (): Node => ({ amount: 1234, currency: "JPY" });

/**
 * Each shape takes the variant's seal and returns a *payload*: the outer object is raw, and
 * whatever the shape models as a nested Val is already sealed. That is what a constructor
 * actually receives, since the phantom brand makes a nested Val unreachable without its own
 * seal.
 */
const SHAPES: Record<string, (seal: Copy) => () => Node> = {
  "flat 3 keys": () => () => ({ id: "u_1", name: "alice", age: 30 }),
  "order (3 child Vals)": (seal) => () => ({
    id: "o_1",
    note: "hello",
    createdAt: 1730000000000,
    total: seal(money()),
    tax: seal(money()),
    discount: seal(money()),
    addr: { zip: "100-0001", city: "Chiyoda" },
    lines: Array.from({ length: 8 }, (_, i) => ({ sku: `sku_${i}`, qty: i + 1 })),
  }),
  "deep tree 3x4": (seal) => {
    const level = (d: number): unknown =>
      d === 0
        ? seal({ leaf: "x", n: d })
        : seal({ n: d, kids: [0, 1, 2, 3].map(() => level(d - 1)) });
    return () => ({ n: 3, kids: [0, 1, 2, 3].map(() => level(2)) });
  },
  "200 rows": (seal) => () => ({
    title: "report",
    rows: Array.from({ length: 200 }, (_, i) => seal({ id: `r${i}`, qty: i, note: `n${i}` })),
  }),
};

/** The same tree with no nested Vals at all: one deep payload, as a JSON decode produces it. */
const rawTree = (depth: number, branch: number): Node =>
  depth === 0
    ? { leaf: "x", n: 0 }
    : { n: depth, kids: Array.from({ length: branch }, () => rawTree(depth - 1, branch)) };

/** Seals a raw tree bottom-up, the way modelling each level as its own Val forces you to. */
const decompose = (seal: Copy, node: Node): unknown =>
  seal(
    node["kids"]
      ? { n: node["n"], kids: (node["kids"] as Node[]).map((k) => decompose(seal, k)) }
      : node,
  );

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function bench(fn: (i: number) => unknown, iterations: number): number {
  for (let i = 0; i < Math.min(iterations, 20000); i++) fn(i);
  const started = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn(i);
  return Number(process.hrtime.bigint() - started) / iterations;
}

const ns = (x: number): string =>
  x >= 10000 ? `${(x / 1000).toFixed(1)}us` : x >= 1000 ? x.toFixed(0) : x.toFixed(1);

function table(
  title: string,
  columns: readonly string[],
  rows: ReadonlyArray<readonly [string, number[]]>,
) {
  console.log(`\n### ${title}\n`);
  console.log(`  ${"".padEnd(10)}${columns.map((c) => c.padStart(16)).join("")}`);
  const base = rows[0]?.[1];
  for (const [name, values] of rows) {
    const cells = values.map((v, i) =>
      `${ns(v)} (${(v / (base?.[i] ?? v)).toFixed(2)}x)`.padStart(16),
    );
    console.log(`  ${name.padEnd(10)}${cells.join("")}`);
  }
}

// ---------------------------------------------------------------------------
// 1. What each mechanism costs on its own
// ---------------------------------------------------------------------------

function micro(): void {
  const set = new WeakSet<object>();
  const map = new WeakMap<object, number>();
  const live = Array.from({ length: 512 }, (_, i) => ({ a: i }));
  for (const o of live) {
    set.add(o);
    map.set(o, 1);
  }
  const cold = Array.from({ length: 512 }, (_, i) => ({ a: i }));
  const rows: Array<readonly [string, number]> = [
    ["allocate {a}", bench(() => ({ a: 1 }), 3_000_000)],
    ["set.has hit", bench((i) => set.has(live[i & 511]!), 3_000_000)],
    ["set.has miss", bench((i) => set.has(cold[i & 511]!), 3_000_000)],
    ["map.get hit", bench((i) => map.get(live[i & 511]!), 3_000_000)],
    ["map.get miss", bench((i) => map.get(cold[i & 511]!), 3_000_000)],
    ["alloc + set.add", bench(() => set.add({ a: 1 }), 1_000_000)],
    ["alloc + map.set", bench(() => map.set({ a: 1 }, 1), 1_000_000)],
  ];
  console.log("\n### Per-operation cost\n");
  for (const [name, value] of rows)
    console.log(`  ${name.padEnd(18)}${ns(value).padStart(8)} ns/op`);
  console.log(
    "\n  Marking costs 15-20x what a lookup costs, so the threshold belongs on the mark.",
  );
}

// ---------------------------------------------------------------------------
// 2. seal / with / equals, per shape
// ---------------------------------------------------------------------------

function perShape(): void {
  for (const [label, shape] of Object.entries(SHAPES)) {
    const iterations = label.startsWith("200") || label.startsWith("deep") ? 30000 : 100000;
    const rows: Array<readonly [string, number[]]> = [];
    for (const [name, make] of VARIANTS) {
      const v = make();
      const payload = shape(v.seal);
      const inputs = Array.from({ length: 64 }, payload);
      const fresh = bench((i) => v.seal(inputs[i & 63]!), iterations);
      const value = v.seal(payload()) as Node;
      const rebuilt = bench(() => v.seal({ ...value, note: "x" }), iterations);
      const twin = v.seal({ ...value });
      const compared = bench(() => v.equals(value, twin), iterations);
      rows.push([name, [fresh, rebuilt, compared]]);
    }
    table(label, ["seal", "with", "equals"], rows);
  }
}

// ---------------------------------------------------------------------------
// 3. Decode paths: the shapes where tracking has nothing to share
// ---------------------------------------------------------------------------

function decodePaths(): void {
  const [depth, branch] = [3, 4];
  const inputs = Array.from({ length: 32 }, () => rawTree(depth, branch));
  const rows: Array<readonly [string, number[]]> = [];
  for (const [name, make] of VARIANTS) {
    const v = make();
    const whole = bench((i) => v.seal(inputs[i & 31]!), 20000);
    const split = bench((i) => decompose(v.seal, inputs[i & 31]!), 20000);
    const asWhole = v.seal(rawTree(depth, branch)) as Node;
    const asSplit = decompose(v.seal, rawTree(depth, branch)) as Node;
    const updateWhole = bench(() => {
      let value = asWhole;
      for (let j = 0; j < 10; j++) value = v.seal({ ...value, n: j }) as Node;
      return value;
    }, 20000);
    const updateSplit = bench(() => {
      let value = asSplit;
      for (let j = 0; j < 10; j++) value = v.seal({ ...value, n: j }) as Node;
      return value;
    }, 20000);
    rows.push([name, [whole, split, updateWhole, updateSplit]]);
  }
  table(
    `raw ${depth}x${branch} tree, 106 nodes: one Val vs nested Vals`,
    ["one seal", "split", "one +with x10", "split +with x10"],
    rows,
  );
  console.log(
    "\n  `split` costs 3-4x `one seal` even without tracking: today every level re-copies\n" +
      "  everything below it. Tracking is what removes that, and any update at all pays for it.",
  );
}

// ---------------------------------------------------------------------------
// 4. Soundness
// ---------------------------------------------------------------------------

function soundness(): void {
  let failures = 0;
  for (const [name, make] of VARIANTS) {
    const v = make();

    // A caller's object must never end up inside a value, on any path.
    const foreign = { tags: ["a"] };
    const sealed = v.seal({ id: "x", inner: foreign }) as { inner: { tags: string[] } };
    foreign.tags.push("b");
    if (sealed.inner.tags.length !== 1) {
      console.log(`  FAIL ${name}: constructor aliased its argument`);
      failures++;
    }
    const patched = v.seal({ ...sealed, inner: foreign }) as { inner: { tags: string[] } };
    foreign.tags.push("c");
    if (patched.inner.tags.length !== 2) {
      console.log(`  FAIL ${name}: a patch aliased the caller's object`);
      failures++;
    }

    if (name === "plain") continue;

    // Sharing must not oscillate: a subtree shared once stays shared.
    const child = v.seal({ rows: Array.from({ length: 64 }, (_, i) => ({ i })) });
    let value = v.seal({ n: 0, child }) as Node;
    const seen = new Set<unknown>();
    for (let i = 0; i < 5; i++) {
      value = v.seal({ ...value, n: i }) as Node;
      seen.add(value["child"]);
    }
    if (seen.size !== 1) {
      console.log(`  FAIL ${name}: the shared subtree changed identity across re-seals`);
      failures++;
    }
  }
  console.log(failures === 0 ? "\n  All variants sound.\n" : `\n  ${failures} failures.\n`);
}

console.log(`node ${process.version}, ns/op, ratios against \`plain\``);
micro();
perShape();
decodePaths();
console.log("\n### Soundness\n");
soundness();
