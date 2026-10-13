const base = require('./jest.config');

module.exports = {
  ...base,
  testPathIgnorePatterns: [],
  testMatch: ['**/tests/integration/**/*.int.test.ts'],
};