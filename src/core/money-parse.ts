import type { CurrencyCode, Money } from './money';
import { currencyExponent, money } from './money';

/**
 * Chuyển đổi giữa `Money` và **chuỗi số ở đơn vị lớn** — dạng người dùng gõ trong ô
 * nhập và dạng nằm trong file CSV.
 *
 * Tách khỏi `format()` của `money.ts` một cách có chủ ý: `format()` sinh chuỗi để
 * **hiển thị** ("65.000 ₫") và không bao giờ được parse ngược (AGENTS.md §4.2). Hai
 * hàm ở đây là cặp nghịch đảo của nhau, làm việc trên chuỗi thuần — không có bước
 * nào đi qua số thực, nên không mất đồng nào.
 */

/** `"65000"`, `"12.34"`, `"-0.05"` — dấu, phần nguyên, phần thập phân tuỳ chọn. */
const WELL_FORMED = /^([+-]?)(\d+)(?:\.(\d+))?$/;

/**
 * Chuỗi số ở đơn vị lớn → `Money` chính xác.
 *
 * Chấp nhận: khoảng trắng hai đầu, dấu `+`/`-`, số chữ số thập phân **không vượt quá**
 * exponent của tiền tệ. Từ chối: dấu phân cách nghìn, ký hiệu tiền tệ, ký pháp khoa học,
 * phần thập phân quá dài (VND không có phần thập phân), và mọi giá trị ngoài dải số
 * nguyên an toàn — thà ném lỗi còn hơn trả về số tiền sai.
 */
export function parseMoneyInput(text: string, currency: CurrencyCode): Money {
  const trimmed = text.trim();
  const match = WELL_FORMED.exec(trimmed);

  if (match === null) {
    throw new Error(
      `parseMoneyInput(): ${JSON.stringify(text)} is not a plain major-unit amount ` +
        `(expected digits with an optional "." fraction, no thousands separators)`,
    );
  }

  const sign = match[1] ?? '';
  const whole = match[2] ?? '';
  const fraction = match[3] ?? '';
  const exponent = currencyExponent(currency);

  if (fraction.length > exponent) {
    throw new Error(
      `parseMoneyInput(): ${JSON.stringify(text)} has ${fraction.length} decimal places, ` +
        `but ${currency} has ${exponent}`,
    );
  }

  const padded = fraction.padEnd(exponent, '0');
  const minor = Number(`${sign}${whole}${padded}`);

  if (!Number.isSafeInteger(minor)) {
    throw new Error(
      `parseMoneyInput(): ${JSON.stringify(text)} is outside the safe integer range ` +
        `for ${currency}`,
    );
  }

  // `-0` là cùng một số tiền với `0`; giữ dấu âm chỉ tạo ra hai biểu diễn của một giá trị.
  return money(minor === 0 ? 0 : minor, currency);
}

/**
 * `Money` → chuỗi đơn vị lớn, không phân cách nghìn, không ký hiệu tiền tệ.
 *
 * Nghịch đảo của `parseMoneyInput`: `parseMoneyInput(formatMoneyInput(m), m.currency)`
 * luôn bằng `m`. Chuỗi được cắt ra từ chính các chữ số của `minor` (không chia cho
 * `10 ** e`) nên không có bước nào đi qua float.
 */
export function formatMoneyInput(value: Money): string {
  const exponent = currencyExponent(value.currency);
  const digits = String(Math.abs(value.minor)).padStart(exponent + 1, '0');
  const sign = value.minor < 0 ? '-' : '';

  if (exponent === 0) return `${sign}${digits}`;

  const cut = digits.length - exponent;
  return `${sign}${digits.slice(0, cut)}.${digits.slice(cut)}`;
}
