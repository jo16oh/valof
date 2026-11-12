import { expect, test } from "vite-plus/test";

import { align, bytes } from "./format.ts";

test("prints bytes below 1 kB as they are, and above it in kB", () => {
  expect([bytes(1023), bytes(1024), bytes(1100)]).toEqual(["1023 B", "1.00 kB", "1.07 kB"]);
});

test("pads each column to its widest cell, on its side", () => {
  expect(align([["a", "1"], ["bbb", "22"], ["cc"]], ["left", "right"])).toEqual([
    ["a  ", " 1"],
    ["bbb", "22"],
    ["cc ", "  "],
  ]);
});
