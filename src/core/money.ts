export type CurrencyCode = 'VND' | 'USD';

const EXPONENTS: Record<CurrencyCode, number> = { VND: 0, USD: 2 };

export interface Money {
  readonly minor: number;
  readonly currency: CurrencyCode;
}

export function money(minor: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(minor)) {
    throw new Error(`Money.minor must be an integer, got ${minor}`);
  }
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`Money.minor must be a safe integer, got ${minor}`);
  }
  return { minor, currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function sub(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor - b.minor, a.currency);
}

export function mulInt(a: Money, n: number): Money {
  if (!Number.isInteger(n)) {
    throw new Error(`Multiplier must be an integer, got ${n}`);
  }
  return money(a.minor * n, a.currency);
}

export function isZero(m: Money): boolean {
  return m.minor === 0;
}

export function isNegative(m: Money): boolean {
  return m.minor < 0;
}

export function format(m: Money, locale = 'vi-VN'): string {
  const exponent = EXPONENTS[m.currency];
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(m.minor / 10 ** exponent);
}
