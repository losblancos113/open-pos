/**
 * Offline Bill Numbering & Payment Reference Generator
 *
 * Implements deterministic, collision-proof bill numbers and VietQR payment
 * references for multi-terminal offline environments (AGENTS.md §4, Spec §5.3).
 *
 * Invariants:
 * - Pure domain logic with zero external or framework dependencies.
 * - Alphanumeric codes are validated and normalized to uppercase.
 * - Payment references strictly adhere to the VietQR / NAPAS format and character limit (<= 20 chars).
 */

const CODE_REGEX = /^[A-Za-z0-9]+$/;
const BILL_NUMBER_REGEX = /^([A-Za-z0-9]+)-([A-Za-z0-9]+)-(\d{8})-(\d+)$/;

export interface ParsedBillNumber {
  branchCode: string;
  terminalCode: string;
  dateStr: string;
  seq: number;
}

/**
 * Formats a Date object into YYYYMMDD string using local calendar date.
 */
function formatDateYYYYMMDD(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error(`formatBillNumber(): date must be a valid Date object, got ${date}`);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Validates branch or terminal code.
 */
function validateCode(funcName: string, paramName: string, value: string): void {
  if (typeof value !== 'string' || !CODE_REGEX.test(value)) {
    throw new Error(`${funcName}(): ${paramName} must be alphanumeric, got "${value}"`);
  }
}

/**
 * Validates sequence number.
 */
function validateSeq(funcName: string, seq: number): void {
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0 || !Number.isSafeInteger(seq)) {
    throw new Error(`${funcName}(): seq must be a non-negative integer, got ${seq}`);
  }
}

/**
 * Formats a bill number for print, display, and storage.
 * Format: {branchCode}-{terminalCode}-{YYYYMMDD}-{seq} (e.g. "HQ-T01-20261023-0042")
 */
export function formatBillNumber(
  branchCode: string,
  terminalCode: string,
  date: Date,
  seq: number,
): string {
  validateCode('formatBillNumber', 'branchCode', branchCode);
  validateCode('formatBillNumber', 'terminalCode', terminalCode);
  validateSeq('formatBillNumber', seq);

  const dateStr = formatDateYYYYMMDD(date);
  const paddedSeq = String(seq).padStart(4, '0');

  return `${branchCode.toUpperCase()}-${terminalCode.toUpperCase()}-${dateStr}-${paddedSeq}`;
}

/**
 * Formats a VietQR payment reference.
 * Format: POS{branchCode}{terminalCode}{seq} (e.g. "POSHQT010042")
 *
 * Guarantees uniqueness across offline terminals and compatibility with NAPAS 247
 * reference length (max 20 characters, uppercase alphanumeric only).
 */
export function formatPaymentRef(
  branchCode: string,
  terminalCode: string,
  seq: number,
): string {
  validateCode('formatPaymentRef', 'branchCode', branchCode);
  validateCode('formatPaymentRef', 'terminalCode', terminalCode);
  validateSeq('formatPaymentRef', seq);

  const paddedSeq = String(seq).padStart(4, '0');
  const ref = `POS${branchCode.toUpperCase()}${terminalCode.toUpperCase()}${paddedSeq}`;

  if (ref.length > 20) {
    throw new Error(
      `formatPaymentRef(): generated reference exceeds 20 characters (max allowed for VietQR), got "${ref}" (${ref.length} chars)`,
    );
  }

  return ref;
}

/**
 * Parses a formatted bill number into its constituent components.
 * Accepts: {branchCode}-{terminalCode}-{YYYYMMDD}-{seq}
 */
export function parseBillNumber(billNumber: string): ParsedBillNumber {
  if (typeof billNumber !== 'string') {
    throw new Error(`parseBillNumber(): billNumber must be a string, got ${typeof billNumber}`);
  }

  const match = billNumber.match(BILL_NUMBER_REGEX);
  if (!match || !match[1] || !match[2] || !match[3] || !match[4]) {
    throw new Error(`parseBillNumber(): invalid bill number format, got "${billNumber}"`);
  }

  const seq = parseInt(match[4], 10);
  if (!Number.isSafeInteger(seq)) {
    throw new Error(`parseBillNumber(): sequence number is out of safe range, got "${match[4]}"`);
  }

  return {
    branchCode: match[1].toUpperCase(),
    terminalCode: match[2].toUpperCase(),
    dateStr: match[3],
    seq,
  };
}
