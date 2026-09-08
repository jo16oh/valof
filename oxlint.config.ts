export default {
  ignorePatterns: ["tests/lint/**/fixtures/**", "scripts/ts-compatibility/public-api.ts"],
  options: {
    typeAware: true,
    typeCheck: true,
  },
};
