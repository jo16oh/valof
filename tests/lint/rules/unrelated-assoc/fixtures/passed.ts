import { Val } from "valof";

import { cents } from "./passed/helpers.ts";

export type Money = Val<"Money", { cents: number }>;
const Money = Val.companion<Money>()
  .implAssoc(() => ({
    fromText: parseMoney,
    double: doubled,
    format: formatCents,
    label,
    fromCents: exportedParse,
    triple: exportedTripled,
    half: halved,
    quarter: quartered,
    total: cents,
    wrapped,
  }))
  .build();

function parseMoney(text: string): Money {
  return Money.seal({ cents: Number(text) });
}

const doubled = (money: Money): number => money.cents * 2;

function formatCents(n: number): string {
  return `${n / 100}`;
}

function label(n: number): string {
  return `${n}`;
}

export function exportedParse(n: number): Money {
  return Money.seal({ cents: n });
}

export const exportedTripled = (money: Money): number => money.cents * 3;

const halved = function (money: Money): number {
  return money.cents / 2;
};

// Only a `const` is read: a `let` can hold another function by the time the member is called.
let quartered = (money: Money): number => money.cents / 4;

// A call, not a function: what it returns is not read.
const wrapped = wrap((money: Money): number => money.cents);

function wrap<T>(fn: T): T {
  return fn;
}

export const read = [
  Money.fromText,
  Money.double,
  Money.format,
  Money.label,
  Money.fromCents,
  Money.triple,
  Money.half,
  Money.quarter,
  Money.total,
  Money.wrapped,
];
