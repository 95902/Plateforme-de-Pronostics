export const MAX_AMOUNT = 100000;

/**
 * Parse a money amount coming from a request body.
 * Returns the amount rounded to cents, or null if it is not a positive finite
 * number within MAX_AMOUNT (rejects strings like "abc", NaN, Infinity, negatives).
 */
export function parseAmount(value: unknown): number | null {
  const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;

  if (!Number.isFinite(amount)) return null;

  const rounded = Math.round(amount * 100) / 100;
  if (rounded <= 0 || rounded > MAX_AMOUNT) return null;

  return rounded;
}

/**
 * Parse a positive integer id (route param or body field). Returns null if invalid.
 */
export function parseId(value: unknown): number | null {
  const id = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
