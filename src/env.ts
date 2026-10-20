export const development =
  typeof process === "undefined" ? false : process.env["NODE_ENV"] !== "production";
