export type CurrencyCode = 'VND' | 'USD';

const EXPONENTS: Record<CurrencyCode, number> = { VND: 0, USD: 2 };

/**
 * Số đơn vị nhỏ (minor unit) trong một đơn vị lớn: VND → 1, USD → 100.
 *
 * Cần cho formula: một literal như `100` trong `price >= 100` là 100 **đơn vị lớn**,
 * còn `Money.minor` là đơn vị nhỏ. Không có hàm này thì hai bên không so sánh được.
 */
export function minorUnitsPerMajor(currency: CurrencyCode): number {
  return 10 ** EXPONENTS[currency];
}

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

/**
 * Nhân money với một phân số `numerator / denominator` bằng số học số nguyên.
 *
 * Cần thiết cho formula (ví dụ `cost = price * 0.6`): `mulInt` chỉ nhận số nguyên,
 * còn nhân bằng float sẽ sai tiền với số lớn. Làm tròn **half away from zero** —
 * 0.5 làm tròn ra xa 0, nhất quán cho cả số âm.
 * Ném lỗi nếu tích trung gian vượt safe integer, thay vì trả về số sai.
 */
export function mulRational(m: Money, numerator: number, denominator: number): Money {
  if (!Number.isInteger(numerator)) {
    throw new Error(`mulRational(): numerator must be an integer, got ${numerator}`);
  }
  if (!Number.isInteger(denominator)) {
    throw new Error(`mulRational(): denominator must be an integer, got ${denominator}`);
  }
  if (denominator === 0) {
    throw new Error('mulRational(): denominator must not be zero');
  }
  if (denominator < 0) {
    return mulRational(m, -numerator, -denominator);
  }

  const product = m.minor * numerator;
  if (!Number.isSafeInteger(product)) {
    throw new Error(
      `mulRational(): minor * numerator exceeds the safe integer range ` +
        `(minor=${m.minor}, numerator=${numerator})`,
    );
  }

  const quotient = Math.trunc(product / denominator);
  const remainder = product % denominator;
  const twiceRemainder = Math.abs(remainder) * 2;

  // Nhỏ hơn nửa đơn vị → cắt về phía 0; bằng hoặc lớn hơn nửa → làm tròn ra xa 0.
  if (twiceRemainder < denominator) return money(quotient, m.currency);
  return money(quotient + Math.sign(product), m.currency);
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
