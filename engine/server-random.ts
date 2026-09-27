import { GameRuleError } from './game.ts';
import type { RandomIntSource } from './types.ts';

/**
 * Server-side Web Crypto adapter. Rejection sampling avoids modulo bias, including
 * for the 25-card development shuffle. Do not call this in a browser game client.
 */
export function webCryptoRandomSource(): RandomIntSource {
  if (!globalThis.crypto?.getRandomValues) {
    throw new GameRuleError('CRYPTO_UNAVAILABLE', 'Web Crypto is required for game randomness');
  }
  return {
    int(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x100000000) {
        throw new GameRuleError('INVALID_RANDOM_RANGE', 'Random range must be between 1 and 2^32');
      }
      const range = 0x100000000;
      const limit = Math.floor(range / maxExclusive) * maxExclusive;
      const word = new Uint32Array(1);
      do {
        globalThis.crypto.getRandomValues(word);
      } while (word[0]! >= limit);
      return word[0]! % maxExclusive;
    },
  };
}

export function createSecureBoardSeed(): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new GameRuleError('CRYPTO_UNAVAILABLE', 'Web Crypto is required for game randomness');
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
