/**
 * Money is never a floating point number. A decimal with up to six places is a
 * BigInt scaled by 1,000,000, so every step is exact integer arithmetic.
 */
const scale = 1_000_000n;
const pattern = /^\d+(\.\d{1,6})?$/;

/** "12.5" becomes 12_500_000n. Throws for anything that is not a plain decimal. */
export function parseDecimal(text: string): bigint {
  if (!pattern.test(text)) throw new Error('Not a decimal with up to 6 places');
  const [whole = '0', fraction = ''] = text.split('.');
  return BigInt(whole) * scale + BigInt(fraction.padEnd(6, '0'));
}

/** Always six places, for example 18.518505 or 0.000001. */
export function formatDecimal(value: bigint): string {
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(6, '0');
  return `${whole}.${fraction}`;
}

/**
 * price (USD per million tokens, scaled) x tokens / 1,000,000, rounded half up
 * to six places, as a scaled value. Both operands are non-negative.
 */
export function multiplyPerMillion(price: bigint, tokens: number): bigint {
  if (!Number.isInteger(tokens) || tokens < 0)
    throw new Error('Token counts are whole numbers of 0 or more');
  return (price * BigInt(tokens) + scale / 2n) / scale;
}

/** The exact total, rounded once: price x tokens summed before rounding. */
export function totalPerMillion(
  parts: { price: bigint; tokens: number }[],
): bigint {
  let sum = 0n;
  for (const { price, tokens } of parts) {
    if (!Number.isInteger(tokens) || tokens < 0)
      throw new Error('Token counts are whole numbers of 0 or more');
    sum += price * BigInt(tokens);
  }
  return (sum + scale / 2n) / scale;
}
