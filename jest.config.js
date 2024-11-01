/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "<rootDir>/jest.environment.ts",
  testEnvironmentOptions: {
    // Needed to allow Nock's interceptors to work within A JSDOM environment.
    customExportConditions: [""],
  },
  transform: {
    "^.+.tsx?$": ["ts-jest", {}],
  },
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
