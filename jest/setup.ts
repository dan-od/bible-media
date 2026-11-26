// expo-crypto's randomUUID is native; in Jest it has no implementation. Node's
// crypto.randomUUID produces the same thing: a v4 UUID from a secure source.
jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  randomUUID: () => crypto.randomUUID(),
}));
