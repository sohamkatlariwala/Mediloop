module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/backend/tests/**/*.test.ts'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
