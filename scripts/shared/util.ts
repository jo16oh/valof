import { Result as R, type Err } from "better-result";

import type { AnyVal } from "#valof";

import type { Sink } from "./pipe/index.ts";

interface GenAwait extends Sink {
  readonly out: this["in"] extends Promise<R<infer A, infer E>>
    ? AsyncGenerator<Err<never, E>, A>
    : never;
}

/**
 * The last step of a `flow` that holds a Result: inside `Result.gen`, `yield*` the call to
 * take the Ok value, or to stop at the Err.
 */
export const GenAwait = { sink: R.await } as unknown as GenAwait;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined };

/** A value an error can hold as a field. */
export type Field = JsonValue | AnyVal;

export type SerializedError = {
  name: string;
  message: string;
  cause?: SerializedError;
  [key: string]: Field | SerializedError | undefined;
};

declare const brand: unique symbol;

/** An error made by {@link defineError}. */
export interface DefinedError extends Error {
  readonly [brand]: true;
  readonly cause?: DefinedError;
  toJSON(): SerializedError;
}

export type CustomError<
  Name extends string,
  Fields = Record<never, never>,
  Base extends DefinedError = DefinedError,
> = Omit<Base, "name" | "toJSON"> &
  Readonly<Fields> & {
    readonly name: Name;
    toJSON(): { name: Name; message: string; cause?: SerializedError } & Fields;
  };

/** Makes an error without `new`, and works as the right side of `instanceof`. */
export interface ErrorFactory<
  Name extends string,
  Args extends unknown[],
  Fields,
  Base extends DefinedError,
> {
  (...args: Args): CustomError<Name, Fields, Base>;
  readonly prototype: CustomError<Name, Fields, Base>;
}

type DefaultArgs = [message?: string, options?: { cause?: DefinedError }];
type Init = { message?: string; cause?: DefinedError | undefined };
type SerializableInit<R> = Init & {
  [K in Exclude<keyof R, keyof Init>]: K extends "name" | "stack" | "toJSON"
    ? never
    : Field | undefined;
};
type Parent = ErrorFactory<string, DefaultArgs, Record<never, never>, DefinedError>;
type InstanceOf<P> = P extends { readonly prototype: infer I extends DefinedError }
  ? I
  : DefinedError;

class DefinedErrorRoot extends Error {
  constructor(message?: string, options?: { cause?: unknown }) {
    if (options?.cause !== undefined && !(options.cause instanceof DefinedErrorRoot)) {
      throw new TypeError(
        "cause takes only an error made by defineError; wrap others in toDefinedError",
      );
    }
    super(message, options);
  }

  toJSON(): SerializedError {
    // `name` is on the prototype, and `message` and `cause` are not enumerable.
    const json = Object.assign(
      { name: this.name, message: this.message },
      this,
    ) as unknown as SerializedError;
    if (this.cause instanceof DefinedErrorRoot) json.cause = this.cause.toJSON();
    return json;
  }
}

const classes = new WeakMap<object, typeof DefinedErrorRoot>();

/**
 * Defines an error whose cause is another defined error, and whose fields JSON can carry.
 * Without `init`, it takes the arguments of `Error`.
 */
export function defineError<Name extends string, P extends Parent | undefined = undefined>(
  name: Name,
  options?: { extends?: P },
): ErrorFactory<Name, DefaultArgs, Record<never, never>, InstanceOf<P>>;
export function defineError<
  Name extends string,
  Args extends unknown[],
  R extends SerializableInit<R>,
  P extends Parent | undefined = undefined,
>(
  name: Name,
  init: (...args: Args) => R,
  options?: { extends?: P },
): ErrorFactory<Name, Args, Omit<R, keyof Init>, InstanceOf<P>>;
export function defineError(name: string, a?: unknown, b?: unknown): unknown {
  const init = typeof a === "function" ? (a as (...args: unknown[]) => Init) : undefined;
  const parent = ((init ? b : a) as { extends?: object } | undefined)?.extends;
  const Base = parent ? classes.get(parent) : DefinedErrorRoot;
  if (!Base) throw new TypeError("extends takes only an error made by defineError");

  const Class = class extends Base {
    constructor(...args: unknown[]) {
      if (!init) {
        super(...(args as DefaultArgs));
        return;
      }
      const { message, cause, ...fields } = init(...args);
      super(message, cause === undefined ? undefined : { cause });
      Object.assign(this, fields);
    }
  };

  function factory(...args: unknown[]) {
    const error = new Class(...args);
    Error.captureStackTrace(error, factory);
    return error;
  }

  factory.prototype = Class.prototype;
  for (const target of [Class.prototype, factory, Class]) {
    Object.defineProperty(target, "name", { value: name, writable: true, configurable: true });
  }
  Object.defineProperty(Class.prototype, "constructor", {
    value: factory,
    writable: true,
    configurable: true,
  });
  classes.set(factory, Class);
  return factory;
}

/** Wraps a thrown value that is not a {@link DefinedError}. */
export const UnknownError = defineError("UnknownError", (thrown: unknown) => ({
  message: thrown instanceof Error ? thrown.message : String(thrown),
  originalName: thrown instanceof Error ? thrown.name : typeof thrown,
  cause:
    thrown instanceof Error && thrown.cause !== undefined
      ? toDefinedError(thrown.cause)
      : undefined,
}));

export function isDefinedError(value: unknown): value is DefinedError {
  return value instanceof DefinedErrorRoot;
}

/** Returns a {@link DefinedError} as it is, and wraps anything else in {@link UnknownError}. */
export function toDefinedError(value: unknown): DefinedError {
  return isDefinedError(value) ? value : UnknownError(value);
}
