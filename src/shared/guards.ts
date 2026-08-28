import type { TokenPair } from '../api/contracts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isTokenPair(value: unknown): value is TokenPair {
  if (!isRecord(value)) return false;
  return typeof value.accessToken === 'string'
    && value.accessToken.length > 0
    && typeof value.refreshToken === 'string'
    && value.refreshToken.length > 0
    && typeof value.householdId === 'string'
    && value.householdId.length > 0;
}
