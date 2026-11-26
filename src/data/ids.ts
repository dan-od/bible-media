/**
 * Client ids: a UUIDv4 made on this phone the moment a record is created (see
 * claimable.ts). expo-crypto's randomUUID is synchronous and uses the platform's
 * secure random source.
 */
import { randomUUID } from 'expo-crypto';

export function newId(): string {
  return randomUUID();
}
