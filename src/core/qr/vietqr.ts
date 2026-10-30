/**
 * VietQR EMVCo / NAPAS 247 Payload Generator
 *
 * Sinh mã VietQR theo hai lớp (Spec R9):
 * 1. **Chính** — gọi API `POST https://vietqr.vn/api/vietqr/generate`.
 * 2. **Dự phòng** — dựng payload EMVCo/NAPAS ngay trên thiết bị bằng
 *    `vietnam-qr-pay` khi mất mạng, timeout, HTTP lỗi, hoặc API trả lỗi.
 *
 * Invariants:
 * - `buildVietQrPayload()` là hàm thuần, đồng bộ, không chạm mạng — luôn dùng được offline.
 * - Payload của hai lớp tương đương nhau (đã kiểm chứng bằng test so sánh từng byte).
 * - Không auto-confirm thanh toán; chỉ sinh mã (Spec §1.3, R9).
 */

import { QRPay, VietQRService } from 'vietnam-qr-pay';
import type { Money } from '../money';

export { QRPay, VietQRService };

export const VIETQR_API_GENERATE_URL = 'https://vietqr.vn/api/vietqr/generate';

/** Timeout mặc định cho lời gọi API (Spec R9: 3 giây). */
export const VIETQR_API_TIMEOUT_MS = 3000;

const BIN_REGEX = /^\d{6}$/;
const ACCOUNT_NUMBER_REGEX = /^[A-Za-z0-9]{1,30}$/;
const PAYMENT_REF_REGEX = /^POS[A-Z0-9]{1,17}$/;
const TAG_REGEX = /^\d{1,2}$/;

/**
 * Ánh xạ 6 số BIN → `bankCode` mà `vietqr.vn` chấp nhận.
 *
 * Danh sách lấy từ chính catalog của vietqr.vn (`GET /api/vietqr/banks`, trường
 * `caiValue` → `bankCode`). Mã BIN không có trong bảng sẽ được gửi nguyên và
 * để lớp dự phòng xử lý nếu API từ chối.
 */
export const BIN_TO_VIETQR_CODE: Readonly<Record<string, string>> = {
  '422589': 'CIMB',
  '458761': 'HSBC',
  '546034': 'CAKE',
  '546035': 'Ubank',
  '668888': 'KPB',
  '796500': 'DBS',
  '801011': 'NHB',
  '963388': 'TIMO',
  '970400': 'SBC',
  '970403': 'STB',
  '970405': 'AGR',
  '970406': 'DAB',
  '970407': 'TCB',
  '970408': 'GPB',
  '970409': 'BAB',
  '970410': 'SCVN',
  '970412': 'PVCB',
  '970414': 'MBV',
  '970415': 'VTB',
  '970416': 'ACB',
  '970418': 'BIDV',
  '970419': 'NCB',
  '970421': 'VRB',
  '970422': 'MB',
  '970423': 'TPB',
  '970424': 'SHINHAN',
  '970425': 'ABB',
  '970426': 'MSB',
  '970427': 'VAB',
  '970428': 'NAB',
  '970429': 'SCB',
  '970430': 'PGB',
  '970431': 'EIB',
  '970432': 'VPB',
  '970433': 'VBC',
  '970434': 'IVB',
  '970436': 'VCB',
  '970437': 'HDB',
  '970438': 'BVB',
  '970439': 'PBVN',
  '970440': 'SAB',
  '970441': 'VIB',
  '970442': 'HONGLEONG',
  '970443': 'SHB',
  '970444': 'CBB',
  '970446': 'COOPBANK',
  '970448': 'OCB',
  '970449': 'LPB',
  '970452': 'UMEE',
  '970454': 'VCAB',
  '970456': 'IBK',
  '970457': 'WRB',
  '970458': 'UOB',
  '970462': 'KBHN',
  '970463': 'KBHCM',
  '971005': 'VTLMONEY',
  '971011': 'VNPTMONEY',
  '971025': 'momo',
  '971101': 'ZALOPAY',
};

export interface VietQrInput {
  bankBin: string;
  accountNumber: string;
  accountName?: string;
  /** Ghi đè `bankCode` gửi lên API; mặc định suy ra từ `bankBin`. */
  bankCode?: string;
  amount?: Money;
  paymentRef?: string;
  service?: VietQRService;
}

/** Nhánh đã sinh ra payload — dùng cho log/telemetry, không ảnh hưởng nội dung QR. */
export type VietQrSource = 'api' | 'offline';

export interface VietQrResult {
  qrCode: string;
  source: VietQrSource;
}

export interface VietQrGenerateApiResponse {
  bankCode?: string;
  bankName?: string;
  bankAccount?: string;
  userBankName?: string;
  amount?: string;
  content?: string;
  qrCode?: string;
  imgId?: string;
  error?: string;
  [key: string]: unknown;
}

export interface VietQrApiOptions {
  /** Ghi đè timeout (ms). Mặc định `VIETQR_API_TIMEOUT_MS`. */
  timeoutMs?: number;
  /** Ghi đè endpoint (dùng cho test). */
  apiUrl?: string;
  /** Signal huỷ từ bên gọi (modal đóng, số tiền đổi). */
  signal?: AbortSignal;
  /** Bơm hàm fetch thay thế (dùng cho test, tránh gọi mạng thật). */
  fetchImpl?: typeof fetch;
}

/**
 * Suy ra `bankCode` gửi lên API từ BIN (hoặc dùng mã do bên gọi chỉ định).
 */
export function resolveVietQrBankCode(bankBin: string, customCode?: string): string {
  if (customCode && customCode.trim().length > 0) {
    return customCode.trim();
  }
  return BIN_TO_VIETQR_CODE[bankBin] ?? bankBin;
}

/**
 * Tính checksum CRC-16/CCITT-FALSE qua `QRPay.genCRCCode`.
 *
 * Tham số: polynomial 0x1021, giá trị khởi tạo 0xFFFF, RefIn/RefOut = false, XorOut = 0.
 *
 * @param str Chuỗi đầu vào
 * @returns 4 ký tự hex viết hoa (ví dụ "29B1")
 */
export function crc16Ccitt(str: string): string {
  if (typeof str !== 'string') {
    throw new Error(`crc16Ccitt(): input must be a string, got ${typeof str}`);
  }
  return QRPay.genCRCCode(str);
}

/**
 * Định dạng một phần tử EMVCo TLV (Tag-Length-Value).
 *
 * @param tag Mã tag 1 hoặc 2 chữ số (ví dụ "00", "53")
 * @param value Giá trị chuỗi (độ dài <= 99)
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
 * Chuẩn hoá tên chủ tài khoản thụ hưởng:
 * - Bỏ dấu tiếng Việt
 * - Chuyển chữ hoa
 * - Bỏ ký tự đặc biệt
 * - Gộp khoảng trắng
 * - Cắt còn tối đa 25 ký tự (giới hạn EMVCo Tag 59)
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
 * Dựng payload VietQR EMVCo / NAPAS 247 **hoàn toàn offline** bằng `vietnam-qr-pay`.
 *
 * Hàm thuần, đồng bộ: dùng làm lớp dự phòng và là nguồn hiển thị tức thời.
 */
export function buildVietQrPayload(input: VietQrInput): string {
  if (!input || typeof input !== 'object') {
    throw new Error('buildVietQrPayload(): input must be an object');
  }

  // 1. Kiểm tra Bank BIN (NAPAS 6 số)
  if (typeof input.bankBin !== 'string' || !BIN_REGEX.test(input.bankBin)) {
    throw new Error(
      `buildVietQrPayload(): bankBin must be a 6-digit numeric string, got "${input.bankBin}"`,
    );
  }

  // 2. Kiểm tra số tài khoản
  const trimmedAccountNumber =
    typeof input.accountNumber === 'string' ? input.accountNumber.trim() : '';
  if (!ACCOUNT_NUMBER_REGEX.test(trimmedAccountNumber)) {
    throw new Error(
      `buildVietQrPayload(): accountNumber must be a non-empty alphanumeric string, got "${input.accountNumber}"`,
    );
  }

  // 3. Kiểm tra số tiền (nếu có)
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

  // 4. Kiểm tra mã đối chiếu (nếu có)
  if (input.paymentRef !== undefined) {
    if (typeof input.paymentRef !== 'string' || !PAYMENT_REF_REGEX.test(input.paymentRef)) {
      throw new Error(
        `buildVietQrPayload(): Invalid paymentRef format. Must start with POS followed by uppercase alphanumeric characters (max 20 chars total), got "${input.paymentRef}"`,
      );
    }
  }

  // 5. Lắp payload qua `vietnam-qr-pay`
  const isDynamic = input.amount !== undefined;
  const qrPay = QRPay.initVietQR({
    bankBin: input.bankBin,
    bankNumber: trimmedAccountNumber,
    initMethod: isDynamic ? '12' : '11',
    ...(input.amount !== undefined ? { amount: String(input.amount.minor) } : {}),
    ...(input.paymentRef !== undefined ? { purpose: input.paymentRef } : {}),
    ...(input.service !== undefined ? { service: input.service } : {}),
  });

  if (input.accountName) {
    const sanitizedName = sanitizeAccountName(input.accountName);
    if (sanitizedName) {
      qrPay.merchant.name = sanitizedName;
    }
  }

  return qrPay.build();
}

/**
 * Gọi trực tiếp API `https://vietqr.vn/api/vietqr/generate`.
 *
 * Ném lỗi khi: mất mạng, timeout, HTTP không phải 2xx, API trả `{ error }`,
 * hoặc response thiếu `qrCode`. Bên gọi chịu trách nhiệm dự phòng.
 */
export async function generateVietQrFromApi(
  input: VietQrInput,
  options?: VietQrApiOptions,
): Promise<VietQrGenerateApiResponse> {
  const doFetch = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? VIETQR_API_TIMEOUT_MS;

  const body = {
    bankAccount: input.accountNumber.trim(),
    userBankName: input.accountName ? sanitizeAccountName(input.accountName) : '',
    bankCode: resolveVietQrBankCode(input.bankBin, input.bankCode),
    amount: input.amount !== undefined ? String(input.amount.minor) : '',
    content: input.paymentRef ?? '',
  };

  // Huỷ theo timeout, đồng thời tôn trọng signal của bên gọi.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  options?.signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const res = await doFetch(options?.apiUrl ?? VIETQR_API_GENERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`VietQR API request failed with HTTP ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as VietQrGenerateApiResponse;
    if (data.error) {
      throw new Error(`VietQR API returned error: ${data.error}`);
    }
    if (!data.qrCode || typeof data.qrCode !== 'string') {
      throw new Error('VietQR API response missing "qrCode" field');
    }

    return data;
  } finally {
    clearTimeout(timer);
    options?.signal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Sinh payload VietQR theo thứ tự: API trước, offline sau.
 *
 * Không bao giờ ném lỗi vì lý do mạng — nếu API hỏng thì dựng offline.
 * Lỗi dữ liệu đầu vào (BIN/số tiền/mã đối chiếu sai) vẫn được ném ra.
 */
export async function generateVietQrPayload(
  input: VietQrInput,
  options?: VietQrApiOptions,
): Promise<VietQrResult> {
  // Dựng sẵn bản offline: vừa là dự phòng, vừa validate đầu vào trước khi gọi mạng.
  const offline = buildVietQrPayload(input);

  try {
    const data = await generateVietQrFromApi(input, options);
    return { qrCode: data.qrCode as string, source: 'api' };
  } catch {
    return { qrCode: offline, source: 'offline' };
  }
}
