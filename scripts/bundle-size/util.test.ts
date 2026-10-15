import { Result as R } from "better-result";
import { describe, expect, expectTypeOf, test, vi } from "vite-plus/test";

import { flow, pipe, tap } from "./util.ts";

class NotFoundError extends Error {}
class InvalidError extends Error {}

const wrap = <T>(x: T): T[] => [x];
const wrapAsync = async <T>(x: T): Promise<T[]> => [x];

describe("pipe", () => {
  test("infers each step's argument from the previous step", () => {
    const length = pipe(
      R.ok<string, NotFoundError>("abc"),
      R.map((s) => s.length),
      R.andThen((n) => (n > 0 ? R.ok(n) : R.err(new InvalidError()))),
    );
    expectTypeOf(length).toEqualTypeOf<R<number, NotFoundError | InvalidError>>();
    expect(length.unwrap()).toBe(3);
  });

  test("chains each of eight steps to the one before", () => {
    expectTypeOf(pipe(0, wrap, wrap, wrap, wrap, wrap, wrap, wrap, wrap)).toEqualTypeOf<
      number[][][][][][][][]
    >();
  });
});

describe("flow", () => {
  test("rejects with a step's rejection and skips the steps after it", async () => {
    const error = new Error("failed");
    const rest = vi.fn();
    await expect(flow("a", () => Promise.reject(error), rest)).rejects.toBe(error);
    expect(rest).not.toHaveBeenCalled();
  });

  test("awaits the initial value", async () => {
    expect(await flow(Promise.resolve("a"), (s) => `${s}b`)).toBe("ab");
  });

  test("infers each step's argument from the resolved previous step", async () => {
    const length = flow(
      R.ok<string, NotFoundError>("abc"),
      R.map((s) => s.length),
      R.andThenAsync(async (n) => (n > 0 ? R.ok(n) : R.err(new InvalidError()))),
      R.map((n) => n * 2),
    );
    expectTypeOf(length).toEqualTypeOf<Promise<R<number, NotFoundError | InvalidError>>>();
    expect((await length).unwrap()).toBe(6);
  });

  test("chains each of eight steps to the resolved one before", () => {
    expectTypeOf(
      flow(0, wrap, wrapAsync, wrap, wrapAsync, wrap, wrapAsync, wrap, wrapAsync),
    ).toEqualTypeOf<Promise<number[][][][][][][][]>>();
  });
});

describe("tap", () => {
  test("calls the function with the value and passes the value on", () => {
    const seen = vi.fn();
    const result = pipe(
      1,
      tap((n) => {
        seen(n.toFixed(1));
      }),
      (n) => n + 1,
    );
    expectTypeOf(result).toEqualTypeOf<number>();
    expect(seen).toHaveBeenCalledWith("1.0");
    expect(result).toBe(2);
  });

  test("awaits the promise the function returns before the next step", async () => {
    const order: string[] = [];
    const tapped = pipe(
      1,
      tap(
        () =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              order.push("tap");
              resolve();
            }),
          ),
      ),
    );
    expectTypeOf(tapped).toEqualTypeOf<Promise<number>>();
    expect(
      await flow(tapped, (n) => {
        order.push("next");
        return n + 1;
      }),
    ).toBe(2);
    expect(order).toEqual(["tap", "next"]);
  });

  test("types the step as a value or a promise when the function's result is any or unknown", () => {
    // oxlint-disable-next-line no-explicit-any -- the case under test
    expectTypeOf(tap<number, any>(() => undefined)).returns.toEqualTypeOf<
      number | Promise<number>
    >();
    expectTypeOf(tap<number, unknown>(() => undefined)).returns.toEqualTypeOf<
      number | Promise<number>
    >();
  });

  test("passes the value on directly when the function returns a non-native thenable", () => {
    const settled = Promise.resolve();
    // oxlint-disable-next-line no-thenable -- the case under test
    const thenable: PromiseLike<void> = { then: (onfulfilled) => settled.then(onfulfilled) };
    const result = pipe(
      1,
      tap(() => thenable),
    );
    expectTypeOf(result).toEqualTypeOf<number>();
    expect(result).toBe(1);
  });

  test("rejects with the rejection of the promise the function returns", async () => {
    const error = new Error("failed");
    await expect(
      flow(
        1,
        tap(() => Promise.reject(error)),
      ),
    ).rejects.toBe(error);
  });
});
