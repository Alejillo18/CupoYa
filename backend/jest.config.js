export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    collectCoverageFrom: ['src/**/*.ts', '!src/server.ts'],
  };