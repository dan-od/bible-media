/**
 * The claim against a real local Supabase stack (src/**\/*.db.test.ts). Kept apart
 * from the main suite: it needs `npx supabase start`, and it runs in plain Node
 * because the jest-expo preset replaces fetch with Expo's stub.
 *
 *   npm run test:claim-db
 */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.db.test.ts'],
  transform: { '\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  setupFiles: ['<rootDir>/jest/setup.ts'],
};
