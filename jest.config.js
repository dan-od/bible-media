/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '\\.css$': '<rootDir>/jest/empty-module.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  // *.db.test.ts need a running Supabase stack: npm run test:claim-db (jest.db.config.js).
  testPathIgnorePatterns: ['/node_modules/', '\\.db\\.test\\.ts$'],
  setupFiles: ['<rootDir>/jest/setup.ts'],
};
