/**
 * Số hữu tỉ chính xác cho formula.
 *
 * Formula phải tính được `price * 0.6 / 3` mà không đi qua float ở bất kỳ bước nào —
 * làm tròn chỉ xảy ra **một lần ở cuối** (khi bọc kết quả về money). Vì vậy mọi phép
 * toán trung gian dùng phân số nguyên `n / d`, luôn tối giản và giữ `d > 0`.
 *
 * Cùng phong cách với `allocate()` và `mulRational()`: khi tích trung gian vượt
 * `Number.MAX_SAFE_INTEGER`, hàm **ném lỗi** thay vì trả về một kết quả sai.
 */
export interface Rational {
  readonly n: number;
  readonly d: number;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`rat(): ${label} must be an integer, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(`rat(): ${label} must be a safe integer, got ${value}`);
  }
}

/** Dựng một số hữu tỉ đã tối giản, giữ mẫu số dương. */
export function rat(n: number, d = 1): Rational {
  assertSafeInteger(n, 'numerator');
  assertSafeInteger(d, 'denominator');
  if (d === 0) {
    throw new Error('rat(): denominator must not be zero');
  }

  let numerator = n;
  let denominator = d;
  if (denominator < 0) {
    numerator = -numerator;
    denominator = -denominator;
  }

  const divisor = gcd(numerator, denominator);
  if (divisor > 1) {
    numerator /= divisor;
    denominator /= divisor;
  }

  return { n: numerator, d: denominator };
}

const DECIMAL_LITERAL = /^-?\d+(\.\d+)?$/;

/**
 * Parse một literal thập phân thành số hữu tỉ **chính xác**.
 * Không đi qua `parseFloat` — `'0.1'` phải là đúng `1/10`, không phải xấp xỉ nhị phân.
 */
export function ratFromDecimal(text: string): Rational {
  if (typeof text !== 'string' || !DECIMAL_LITERAL.test(text)) {
    throw new Error(`ratFromDecimal(): ${JSON.stringify(text)} is not a valid decimal number`);
  }

  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = unsigned.split('.');

  const denominator = 10 ** fraction.length;
  const numerator = Number(whole) * denominator + Number(fraction === '' ? '0' : fraction);

  return rat(negative ? -numerator : numerator, denominator);
}

/** Kiểm tra tích trung gian trước khi dựng kết quả, để không trả về số sai. */
function safeProduct(a: number, b: number, label: string): number {
  const product = a * b;
  if (!Number.isSafeInteger(product)) {
    throw new Error(
      `rat(): ${label} exceeds the safe integer range (${a} * ${b}); ` +
        'split the computation into smaller steps',
    );
  }
  return product;
}

export function ratAdd(a: Rational, b: Rational): Rational {
  return rat(
    safeProduct(a.n, b.d, 'numerator') + safeProduct(b.n, a.d, 'numerator'),
    safeProduct(a.d, b.d, 'denominator'),
  );
}

export function ratSub(a: Rational, b: Rational): Rational {
  return rat(
    safeProduct(a.n, b.d, 'numerator') - safeProduct(b.n, a.d, 'numerator'),
    safeProduct(a.d, b.d, 'denominator'),
  );
}

export function ratMul(a: Rational, b: Rational): Rational {
  return rat(safeProduct(a.n, b.n, 'numerator'), safeProduct(a.d, b.d, 'denominator'));
}

export function ratDiv(a: Rational, b: Rational): Rational {
  if (b.n === 0) {
    throw new Error('ratDiv(): division by zero');
  }
  return rat(safeProduct(a.n, b.d, 'numerator'), safeProduct(a.d, b.n, 'denominator'));
}

/** So sánh chính xác; chỉ rơi về so sánh float khi tích vượt safe integer. */
export function ratCmp(a: Rational, b: Rational): -1 | 0 | 1 {
  const left = a.n * b.d;
  const right = b.n * a.d;
  if (Number.isSafeInteger(left) && Number.isSafeInteger(right)) {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  const leftRatio = a.n / a.d;
  const rightRatio = b.n / b.d;
  if (leftRatio < rightRatio) return -1;
  if (leftRatio > rightRatio) return 1;
  return 0;
}

export function ratIsInteger(r: Rational): boolean {
  return r.d === 1;
}

export function ratToNumber(r: Rational): number {
  return r.n / r.d;
}

/** Làm tròn **half away from zero** về số nguyên — cùng quy tắc với `mulRational()`. */
export function ratRound(r: Rational): number {
  // Chia lấy phần nguyên bằng số học số nguyên: `n - (n % d)` luôn chia hết cho `d`,
  // nên không phụ thuộc vào độ chính xác của phép chia float ở dải số lớn.
  const remainder = r.n % r.d;
  const quotient = (r.n - remainder) / r.d;
  if (Math.abs(remainder) * 2 < r.d) return quotient;
  return quotient + Math.sign(r.n);
}
