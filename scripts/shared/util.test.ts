import { inspect } from "node:util";
import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import { defineError, toDefinedError, UnknownError } from "./util.ts";

const PlainError = defineError("PlainError");
const HttpError = defineError(
  "HttpError",
  (status: number, url: string, cause?: ReturnType<typeof PlainError>) => ({
    message: `HTTP ${status}: ${url}`,
    cause,
    status,
    url,
  }),
);
const AppError = defineError("AppError");
const DbError = defineError("DbError", { extends: AppError });

describe("defineError", () => {
  test("takes a message and a cause like Error, without new", () => {
    const cause = PlainError("inner");
    const error = PlainError("outer", { cause });
    expect(error).toBeInstanceOf(PlainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PlainError");
    expect(error.message).toBe("outer");
    expect(error.cause).toBe(cause);
    expect(inspect(error)).toMatch(/^PlainError: outer/);
  });

  test("turns the arguments into a message, a cause and fields with init", () => {
    const cause = PlainError("inner");
    const error = HttpError(503, "/users/1", cause);
    expectTypeOf(error.status).toEqualTypeOf<number>();
    expect(error.message).toBe("HTTP 503: /users/1");
    expect(error.cause).toBe(cause);
    expect([error.status, error.url]).toEqual([503, "/users/1"]);
  });

  test("leaves out the cause when init returns undefined for it", () => {
    expect("cause" in HttpError(404, "/x")).toBe(false);
  });

  test("makes an error that extends another", () => {
    const error = DbError("query failed");
    expect(error).toBeInstanceOf(DbError);
    expect(error).toBeInstanceOf(AppError);
    expect(AppError("x")).not.toBeInstanceOf(DbError);
    expect(error.name).toBe("DbError");
    const QueryError = defineError("QueryError", (sql: string) => ({ message: sql }), {
      extends: AppError,
    });
    expect(QueryError("select")).toBeInstanceOf(AppError);
  });

  test("serializes the name, the message, the fields and the causes", () => {
    const error = HttpError(503, "/users/1", PlainError("inner"));
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      name: "HttpError",
      message: "HTTP 503: /users/1",
      status: 503,
      url: "/users/1",
      cause: { name: "PlainError", message: "inner" },
    });
  });

  test("starts the stack at the caller", () => {
    expect(PlainError("x").stack?.split("\n")[1]).toContain("util.test.ts");
  });

  test("throws on a cause it did not make", () => {
    // oxlint-disable-next-line no-explicit-any -- the case under test
    expect(() => PlainError("x", { cause: new Error("native") as any })).toThrow(TypeError);
  });

  test("throws on extending an error it did not make", () => {
    // oxlint-disable-next-line no-explicit-any -- the case under test
    expect(() => defineError("Bad", { extends: Error as any })).toThrow(/defineError/);
  });

  test("rejects what it cannot serialize or did not make", () => {
    expectTypeOf(() => {
      // @ts-expect-error a native error as the cause
      PlainError("x", { cause: new Error("native") });
      // @ts-expect-error a native error as the cause, through init
      HttpError(500, "/x", new Error("native"));
      const fake = { name: "Fake", message: "", toJSON: () => ({ name: "Fake", message: "" }) };
      // @ts-expect-error an object shaped like a defined error
      PlainError("x", { cause: fake });
      // @ts-expect-error a native error as the parent
      defineError("Bad", { extends: Error });
      // @ts-expect-error a field that JSON cannot carry
      defineError("Bad", (at: Date) => ({ at }));
      // @ts-expect-error a reserved name as a field
      defineError("Bad", () => ({ stack: "" }));
    }).toBeFunction();
  });
});

describe("toDefinedError", () => {
  test("passes a defined error through", () => {
    const error = PlainError("x");
    expect(toDefinedError(error)).toBe(error);
  });

  test("wraps anything else, and its causes, in UnknownError", () => {
    const wrapped = toDefinedError(new RangeError("socket closed", { cause: "ECONNRESET" }));
    expect(wrapped).toBeInstanceOf(UnknownError);
    expect(JSON.parse(JSON.stringify(wrapped))).toEqual({
      name: "UnknownError",
      message: "socket closed",
      originalName: "RangeError",
      cause: { name: "UnknownError", message: "ECONNRESET", originalName: "string" },
    });
  });

  test("keeps a defined error that a native error holds as its cause", () => {
    const cause = PlainError("inner");
    expect(toDefinedError(new Error("outer", { cause })).cause).toBe(cause);
  });
});
