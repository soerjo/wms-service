module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: '.spec.ts$',
  testPathIgnorePatterns: ['/node_modules/', '\\.e2e-spec\\.ts$'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/test/test-setup.ts'],
  testTimeout: 30000,
};
