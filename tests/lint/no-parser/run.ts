// Runs the default export of the module named on the command line, and prints what it threw.
const { default: run } = (await import(process.argv[2] as string)) as {
  default: () => unknown;
};
try {
  await run();
} catch (error) {
  console.log((error as Error).name, (error as Error).message);
}
