/**
 * Offline VietQR EMVCo / NAPAS 247 Payload Generator
 *
 * Implements pure offline generation of dynamic and static VietQR payloads
 * following the EMVCo QR Code Specification for Payment Systems and NAPAS 247
 * Interbank Transfer QR guidelines (Spec §2 R9, §5.4).
 *
 * Invariants:
 * - Pure domain logic with zero external or framework dependencies (AGENTS.md §2, §4.5).
 * - Zero network requests: runs 100% offline on terminal or mobile device.
 * - Deterministic, standard CRC16-CCITT checksum with polynomial 0x1021 and initial value 0xFFFF.
 */

import type { Money } from '../money';

const NAPAS_GUID = 'A000000727';
const NAPAS_SERVICE_CODE = 'QRIBFTTA';
const CURRENCY_VND = '704';
const COUNTRY_VN = 'VN';

const BIN_REGEX = /^\d{6}$/;
const ACCOUNT_NUMBER_REGEX = /^[A-Za-z0-9]{1,30}$/;
const PAYMENT_REF_REGEX = /^POS[A-Z0-9]{1,17}$/;
const TAG_REGEX = /^\d{1,2}$/;

export interface VietQrInput {
  bankBin: string;
  accountNumber: string;
  accountName?: string;
  amount?: Money;
  paymentRef?: string;
}

/**
 * Calculates standard CRC-16/CCITT-FALSE checksum.
 *
 * Parameters:
 * - Polynomial: 0x1021 (x^16 + x^12 + x^5 + 1)
 * - Initial value: 0xFFFF
 * - RefIn: false
 * - RefOut: false
 * - XorOut: 0x0000
 *
 * @param str Input string
 * @returns 4 uppercase hexadecimal characters (e.g. "29B1")
 */
export function crc16Ccitt(str: string): string {
  if (typeof str !== 'string') {
    throw new Error(`crc16Ccitt(): input must be a string, got ${typeof str}`);
  }

  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) & 0xff) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Formats a single EMVCo TLV (Tag-Length-Value) element.
 *
 * @param tag 1 or 2 digit tag identifier (e.g. "00", "53")
 * @param value String data value (length <= 99)
 */
export function formatTlv(tag: string, value: string): string {
  if (typeof tag !== 'string' || !TAG_REGEX.test(tag)) {
    throw new Error(`formatTlv(): tag must be 1 or 2 digits, got "${tag}"`);
  }
  if (typeof value !== 'string') {
    throw new Error(`formatTlv(): value must be a string, got ${typeof value}`);
  }
  if (value.length > 99) {
    throw new Error(`formatTlv(): value length exceeds 99 characters (${value.length})`);
  }

  const paddedTag = tag.padStart(2, '0');
  const paddedLen = String(value.length).padStart(2, '0');
  return `${paddedTag}${paddedLen}${value}`;
}

/**
 * Sanitizes beneficiary account name:
 * - Strips Vietnamese accents
 * - Converts to uppercase
 * - Strips special characters
 * - Normalizes spacing
 * - Truncates to EMVCo Tag 59 max length (25 characters)
 */
export function sanitizeAccountName(name: string): string {
  if (typeof name !== 'string') {
    return '';
  }

  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .slice(0, 25);
}

/**
 * Builds an EMVCo / NAPAS 247 compliant VietQR payload string.
 *
 * Supports both dynamic (with amount and payment reference) and static QR codes.
 */
export function buildVietQrPayload(input: VietQrInput): string {
  if (!input || typeof input !== 'object') {
    throw new Error('buildVietQrPayload(): input must be an object');
  }

  // 1. Validate Bank BIN (NAPAS 6 digits)
  if (typeof input.bankBin !== 'string' || !BIN_REGEX.test(input.bankBin)) {
    throw new Error(
      `buildVietQrPayload(): bankBin must be a 6-digit numeric string, got "${input.bankBin}"`,
    );
  }

  // 2. Validate Account Number
  const trimmedAccountNumber = typeof input.accountNumber === 'string' ? input.accountNumber.trim() : '';
  if (!ACCOUNT_NUMBER_REGEX.test(trimmedAccountNumber)) {
    throw new Error(
      `buildVietQrPayload(): accountNumber must be a non-empty alphanumeric string, got "${input.accountNumber}"`,
    );
  }

  // 3. Validate Amount (if provided)
  if (input.amount !== undefined) {
    if (input.amount.currency !== 'VND') {
      throw new Error(
        `buildVietQrPayload(): VietQR requires VND currency, got "${input.amount.currency}"`,
      );
    }
    if (!Number.isInteger(input.amount.minor) || !Number.isSafeInteger(input.amount.minor)) {
      throw new Error(
        `buildVietQrPayload(): amount.minor must be a safe integer, got ${input.amount.minor}`,
      );
    }
    if (input.amount.minor <= 0) {
      throw new Error(
        `buildVietQrPayload(): amount.minor must be greater than 0, got ${input.amount.minor}`,
      );
    }
  }

  // 4. Validate Payment Ref (if provided)
  if (input.paymentRef !== undefined) {
    if (typeof input.paymentRef !== 'string' || !PAYMENT_REF_REGEX.test(input.paymentRef)) {
      throw new Error(
        `buildVietQrPayload(): Invalid paymentRef format. Must start with POS followed by uppercase alphanumeric characters (max 20 chars total), got "${input.paymentRef}"`,
      );
    }
  }

  // Assemble TLVs:
  // Tag 00: Payload Format Indicator (01)
  const tag00 = formatTlv('00', '01');

  // Tag 01: Point of Initiation Method: 12 (dynamic) if amount provided, else 11 (static)
  const isDynamic = input.amount !== undefined;
  const tag01 = formatTlv('01', isDynamic ? '12' : '11');

  // Tag 38: Merchant Account Information (NAPAS 247)
  const sub00Guid = formatTlv('00', NAPAS_GUID);
  const subSub00Bin = formatTlv('00', input.bankBin);
  const subSub01Account = formatTlv('01', trimmedAccountNumber);
  const sub01Beneficiary = formatTlv('01', `${subSub00Bin}${subSub01Account}`);
  const sub02Service = formatTlv('02', NAPAS_SERVICE_CODE);
  const tag38 = formatTlv('38', `${sub00Guid}${sub01Beneficiary}${sub02Service}`);

  // Tag 53: Transaction Currency (704 = VND)
  const tag53 = formatTlv('53', CURRENCY_VND);

  // Tag 54: Transaction Amount (optional, included if amount is set)
  const tag54 = input.amount !== undefined ? formatTlv('54', String(input.amount.minor)) : '';

  // Tag 58: Country Code (VN)
  const tag58 = formatTlv('58', COUNTRY_VN);

  // Tag 59: Merchant Name / Beneficiary Account Name (optional)
  const sanitizedName = input.accountName ? sanitizeAccountName(input.accountName) : '';
  const tag59 = sanitizedName ? formatTlv('59', sanitizedName) : '';

  // Tag 62: Additional Data Field (Subtag 08: Bill Reference, optional)
  let tag62 = '';
  if (input.paymentRef) {
    const sub08Ref = formatTlv('08', input.paymentRef);
    tag62 = formatTlv('62', sub08Ref);
  }

  // Tag 63: CRC16-CCITT checksum over everything up to "6304"
  const bodyBeforeCrc = `${tag00}${tag01}${tag38}${tag53}${tag54}${tag58}${tag59}${tag62}6304`;
  const checksum = crc16Ccitt(bodyBeforeCrc);

  return `${bodyBeforeCrc}${checksum}`;
}
