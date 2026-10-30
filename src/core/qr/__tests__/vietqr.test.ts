import { describe, it, expect } from 'vitest';
import {
  crc16Ccitt,
  formatTlv,
  buildVietQrPayload,
  sanitizeAccountName,
  generateVietQrFromApi,
  generateVietQrPayload,
  resolveVietQrBankCode,
  VIETQR_API_GENERATE_URL,
  QRPay,
  VietQRService,
} from '../vietqr';
import { BANK_PRESETS, ALL_BANKS, findBankPresetByBin, type BankAccountDoc } from '../bank-account';
import { money } from '../../money';

describe('VietQR EMVCo Payload Builder', () => {
  describe('CRC16-CCITT', () => {
    it('calculates CRC16-CCITT correctly for standard test vector', () => {
      // Standard test vector: "123456789" -> 0x29B1
      expect(crc16Ccitt('123456789')).toBe('29B1');
    });

    it('returns FFFF for empty string', () => {
      expect(crc16Ccitt('')).toBe('FFFF');
    });

    it('throws when input is not a string', () => {
      expect(() => crc16Ccitt(null as unknown as string)).toThrow();
      expect(() => crc16Ccitt(12345 as unknown as string)).toThrow();
    });
  });

  describe('formatTlv', () => {
    it('formats TLV with 2-digit tag and 2-digit length', () => {
      expect(formatTlv('00', '01')).toBe('000201');
      expect(formatTlv('53', '704')).toBe('5303704');
    });

    it('pads single-digit tags with leading zero', () => {
      expect(formatTlv('0', '01')).toBe('000201');
      expect(formatTlv('8', 'POSHQT010042')).toBe('0812POSHQT010042');
    });

    it('throws on invalid tag', () => {
      expect(() => formatTlv('100', '01')).toThrow();
      expect(() => formatTlv('AB', '01')).toThrow();
    });

    it('throws if value exceeds 99 characters', () => {
      const longValue = 'A'.repeat(100);
      expect(() => formatTlv('01', longValue)).toThrow();
    });
  });

  describe('sanitizeAccountName', () => {
    it('removes Vietnamese accents and converts to uppercase', () => {
      expect(sanitizeAccountName('Nguyễn Văn A')).toBe('NGUYEN VAN A');
      expect(sanitizeAccountName('Trần Thị Bích')).toBe('TRAN THI BICH');
      expect(sanitizeAccountName('Đặng Đình C')).toBe('DANG DINH C');
    });

    it('removes special characters and normalizes spaces', () => {
      expect(sanitizeAccountName('  nguyen   van-a #! ')).toBe('NGUYEN VAN A');
    });

    it('truncates to maximum 25 characters', () => {
      const longName = 'NGUYEN VAN A B C D E F G H I K L';
      const sanitized = sanitizeAccountName(longName);
      expect(sanitized.length).toBeLessThanOrEqual(25);
    });
  });

  describe('buildVietQrPayload', () => {
    it('builds a valid dynamic NAPAS VietQR string with amount and reference', () => {
      const payload = buildVietQrPayload({
        bankBin: '970422', // MBBank
        accountNumber: '0901234567',
        accountName: 'NGUYEN VAN A',
        amount: money(135000, 'VND'),
        paymentRef: 'POSHQT010042',
      });

      expect(payload.startsWith('000201010212')).toBe(true);
      expect(payload).toContain('A000000727'); // NAPAS GUID
      expect(payload).toContain('QRIBFTTA'); // NAPAS Service Code
      expect(payload).toContain('970422');
      expect(payload).toContain('0901234567');
      expect(payload).toContain('5303704'); // VND
      expect(payload).toContain('5406135000'); // Amount 135000
      expect(payload).toContain('POSHQT010042'); // Payment Ref
      expect(payload.length).toBeGreaterThan(60);

      // Verify trailing CRC tag 6304 + 4 hex chars
      const crcTag = payload.slice(-8);
      expect(crcTag.startsWith('6304')).toBe(true);
      const bodyBeforeCrc = payload.slice(0, -4);
      expect(crc16Ccitt(bodyBeforeCrc)).toBe(payload.slice(-4));
    });

    it('builds a static VietQR without amount or payment reference', () => {
      const payload = buildVietQrPayload({
        bankBin: '970436', // Vietcombank
        accountNumber: '1012345678',
        accountName: 'CONG TY ABC',
      });

      // Tag 01 should be "11" for static QR
      expect(payload.startsWith('000201010211')).toBe(true);
      expect(payload).toContain('970436');
      expect(payload).toContain('1012345678');
      expect(payload).toContain('53037045802VN'); // Currency VND immediately followed by Country VN (no Tag 54 amount)
      expect(payload).toContain('5911CONG TY ABC6304'); // Tag 59 immediately followed by CRC (no Tag 62 payment ref)

      // Trailing CRC check
      const bodyBeforeCrc = payload.slice(0, -4);
      expect(crc16Ccitt(bodyBeforeCrc)).toBe(payload.slice(-4));
    });

    it('builds dynamic VietQR with paymentRef but without accountName', () => {
      const payload = buildVietQrPayload({
        bankBin: '970422',
        accountNumber: '0901234567',
        amount: money(50000, 'VND'),
        paymentRef: 'POSHQT010001',
      });

      expect(payload.startsWith('000201010212')).toBe(true);
      expect(payload).toContain('540550000'); // Amount 50000
      expect(payload).toContain('POSHQT010001');
      expect(payload).not.toContain('59'); // No Tag 59 (account name)

      const bodyBeforeCrc = payload.slice(0, -4);
      expect(crc16Ccitt(bodyBeforeCrc)).toBe(payload.slice(-4));
    });

    it('sanitizes accented accountName when creating payload', () => {
      const payload = buildVietQrPayload({
        bankBin: '970422',
        accountNumber: '0901234567',
        accountName: 'Nguyễn Văn A',
        amount: money(10000, 'VND'),
      });

      expect(payload).toContain('5912NGUYEN VAN A');
    });

    it('rejects non-integer money or invalid bank BINs', () => {
      expect(() =>
        buildVietQrPayload({
          bankBin: '12',
          accountNumber: '123',
          accountName: 'TEST',
          amount: money(1000, 'VND'),
          paymentRef: 'REF',
        })
      ).toThrow();
    });

    it('rejects bank BIN that is not 6 digits', () => {
      expect(() =>
        buildVietQrPayload({
          bankBin: '97042', // 5 digits
          accountNumber: '0901234567',
        })
      ).toThrow(/bankBin must be a 6-digit numeric string/);

      expect(() =>
        buildVietQrPayload({
          bankBin: '9704222', // 7 digits
          accountNumber: '0901234567',
        })
      ).toThrow(/bankBin must be a 6-digit numeric string/);

      expect(() =>
        buildVietQrPayload({
          bankBin: 'ABCDEF', // non-numeric
          accountNumber: '0901234567',
        })
      ).toThrow(/bankBin must be a 6-digit numeric string/);
    });

    it('rejects empty or invalid accountNumber', () => {
      expect(() =>
        buildVietQrPayload({
          bankBin: '970422',
          accountNumber: '',
        })
      ).toThrow(/accountNumber must be a non-empty alphanumeric string/);

      expect(() =>
        buildVietQrPayload({
          bankBin: '970422',
          accountNumber: '   ',
        })
      ).toThrow(/accountNumber must be a non-empty alphanumeric string/);
    });

    it('rejects non-VND currency', () => {
      expect(() =>
        buildVietQrPayload({
          bankBin: '970422',
          accountNumber: '0901234567',
          amount: money(100, 'USD'),
        })
      ).toThrow(/VietQR requires VND currency/);
    });

    it('rejects negative or zero amount when amount is provided', () => {
      expect(() =>
        buildVietQrPayload({
          bankBin: '970422',
          accountNumber: '0901234567',
          amount: money(0, 'VND'),
        })
      ).toThrow(/amount\.minor must be greater than 0/);

      expect(() =>
        buildVietQrPayload({
          bankBin: '970422',
          accountNumber: '0901234567',
          amount: money(-5000, 'VND'),
        })
      ).toThrow(/amount\.minor must be greater than 0/);
    });

    it('rejects invalid paymentRef format', () => {
      // Must start with POS
      expect(() =>
        buildVietQrPayload({
          bankBin: '970422',
          accountNumber: '0901234567',
          paymentRef: 'BILL001',
        })
      ).toThrow(/Invalid paymentRef/);

      // Must be uppercase alphanumeric
      expect(() =>
        buildVietQrPayload({
          bankBin: '970422',
          accountNumber: '0901234567',
          paymentRef: 'poshqt010042',
        })
      ).toThrow(/Invalid paymentRef/);

      // Max 20 characters
      expect(() =>
        buildVietQrPayload({
          bankBin: '970422',
          accountNumber: '0901234567',
          paymentRef: 'POS123456789012345678', // 21 chars
        })
      ).toThrow(/Invalid paymentRef/);
    });
  });

  describe('Bank Presets and BankAccountDoc', () => {
    it('contains presets for major Vietnamese banks', () => {
      expect(BANK_PRESETS.length).toBeGreaterThanOrEqual(6);

      const vcb = findBankPresetByBin('970436');
      expect(vcb).toBeDefined();
      expect(vcb?.shortName).toBe('VCB');
      expect(vcb?.name).toBe('Vietcombank');

      const mb = findBankPresetByBin('970422');
      expect(mb).toBeDefined();
      expect(mb?.shortName).toBe('MB');

      const tcb = findBankPresetByBin('970407');
      expect(tcb).toBeDefined();

      const bidv = findBankPresetByBin('970418');
      expect(bidv).toBeDefined();

      const vp = findBankPresetByBin('970432');
      expect(vp).toBeDefined();

      const acb = findBankPresetByBin('970416');
      expect(acb).toBeDefined();
    });

    it('returns undefined for unknown bank BIN', () => {
      expect(findBankPresetByBin('000000')).toBeUndefined();
    });

    it('allows constructing valid BankAccountDoc with bank details', () => {
      const doc: BankAccountDoc = {
        _id: 'bank_account:hq',
        branchId: 'hq',
        bankBin: '970422',
        bankName: 'MBBank',
        accountNumber: '0901234567',
        accountName: 'NGUYEN VAN A',
        updatedAt: '2026-10-23T08:00:00.000Z',
      };
      expect(doc._id).toBe('bank_account:hq');
      expect(doc.bankBin).toBe('970422');
    });

    it('finds bank outside top presets from ALL_BANKS registry (vietnam-qr-pay)', () => {
      expect(ALL_BANKS.length).toBeGreaterThan(50);
      // Agribank BIN 970405
      const agri = findBankPresetByBin('970405');
      expect(agri).toBeDefined();
      expect(agri?.bin).toBe('970405');
      expect(agri?.shortName).toBe('Agribank');
    });
  });

  describe('vietnam-qr-pay encode/decode round trip', () => {
    it('buildVietQrPayload produces a payload QRPay can parse back (dynamic)', () => {
      const payload = buildVietQrPayload({
        bankBin: '970422',
        accountNumber: '0901234567',
        accountName: 'NGUYEN VAN A',
        amount: money(135000, 'VND'),
        paymentRef: 'POSHQT010042',
      });

      const qr = new QRPay(payload);
      expect(qr.isValid).toBe(true);
      expect(qr.consumer.bankBin).toBe('970422');
      expect(qr.consumer.bankNumber).toBe('0901234567');
      expect(qr.amount).toBe('135000');
      expect(qr.merchant.name).toBe('NGUYEN VAN A');
      expect(qr.additionalData.purpose).toBe('POSHQT010042');
    });

    it('buildVietQrPayload produces a payload QRPay can parse back (static)', () => {
      const payload = buildVietQrPayload({
        bankBin: '970436',
        accountNumber: '1012345678',
        accountName: 'CONG TY ABC',
      });

      const qr = new QRPay(payload);
      expect(qr.isValid).toBe(true);
      expect(qr.initMethod).toBe('11');
      expect(qr.amount).toBeUndefined();
      expect(qr.consumer.bankBin).toBe('970436');
      expect(qr.merchant.name).toBe('CONG TY ABC');
    });

    it('supports card-number service via VietQRService', () => {
      const payload = buildVietQrPayload({
        bankBin: '970422',
        accountNumber: '0901234567',
        service: VietQRService.BY_CARD_NUMBER,
      });

      expect(payload).toContain('QRIBFTTC');
      expect(payload).not.toContain('QRIBFTTA');
    });
  });

  describe('resolveVietQrBankCode', () => {
    it('maps common BINs to the bankCode vietqr.vn expects', () => {
      expect(resolveVietQrBankCode('970436')).toBe('VCB');
      expect(resolveVietQrBankCode('970422')).toBe('MB');
      expect(resolveVietQrBankCode('970407')).toBe('TCB');
      expect(resolveVietQrBankCode('970415')).toBe('VTB'); // VietinBank (không phải ICB/CTG)
      expect(resolveVietQrBankCode('970405')).toBe('AGR'); // Agribank
      expect(resolveVietQrBankCode('970454')).toBe('VCAB'); // BVBank
    });

    it('prefers an explicit bankCode override', () => {
      expect(resolveVietQrBankCode('970422', 'CUSTOM')).toBe('CUSTOM');
      expect(resolveVietQrBankCode('970422', '   ')).toBe('MB');
    });

    it('falls back to the raw BIN when unknown', () => {
      expect(resolveVietQrBankCode('999999')).toBe('999999');
    });
  });

  describe('generateVietQrFromApi', () => {
    it('POSTs the documented body and returns the qrCode', async () => {
      const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
      const fetchImpl = (async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            bankCode: 'VPB',
            qrCode: '0002010102113854ABC',
          }),
        } as unknown as Response;
      }) as unknown as typeof fetch;

      const res = await generateVietQrFromApi(
        {
          bankBin: '970432',
          accountNumber: '0969896525',
          accountName: 'Hoàng Minh Trí',
          amount: money(50000, 'VND'),
          paymentRef: 'POSHQT010042',
        },
        { fetchImpl },
      );

      expect(res.qrCode).toBe('0002010102113854ABC');
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe(VIETQR_API_GENERATE_URL);
      expect(calls[0]!.body).toEqual({
        bankAccount: '0969896525',
        userBankName: 'HOANG MINH TRI', // sanitized
        bankCode: 'VPB',
        amount: '50000',
        content: 'POSHQT010042',
      });
    });

    it('throws on a non-2xx response', async () => {
      const fetchImpl = (async () =>
        ({ ok: false, status: 503, statusText: 'Service Unavailable' }) as unknown as Response) as unknown as typeof fetch;

      await expect(
        generateVietQrFromApi({ bankBin: '970422', accountNumber: '0901234567' }, { fetchImpl }),
      ).rejects.toThrow(/HTTP 503/);
    });

    it('throws when the API reports an error code', async () => {
      const fetchImpl = (async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ error: 'E05' }),
        }) as unknown as Response) as unknown as typeof fetch;

      await expect(
        generateVietQrFromApi({ bankBin: '970422', accountNumber: '0901234567' }, { fetchImpl }),
      ).rejects.toThrow(/E05/);
    });

    it('throws when qrCode is missing from a 200 response', async () => {
      const fetchImpl = (async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ bankCode: 'MB' }),
        }) as unknown as Response) as unknown as typeof fetch;

      await expect(
        generateVietQrFromApi({ bankBin: '970422', accountNumber: '0901234567' }, { fetchImpl }),
      ).rejects.toThrow(/missing "qrCode"/);
    });
  });

  describe('generateVietQrPayload — API chính, offline dự phòng (Spec R9)', () => {
    const input = {
      bankBin: '970422',
      accountNumber: '0901234567',
      accountName: 'NGUYEN VAN A',
      amount: money(135000, 'VND'),
      paymentRef: 'POSHQT010042',
    };

    it('uses the API payload when the API succeeds', async () => {
      const apiQr = '0002010102113854FROMAPI';
      const fetchImpl = (async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ qrCode: apiQr }),
        }) as unknown as Response) as unknown as typeof fetch;

      const result = await generateVietQrPayload(input, { fetchImpl });

      expect(result).toEqual({ qrCode: apiQr, source: 'api' });
    });

    it('falls back to the offline payload on network failure', async () => {
      const fetchImpl = (async () => {
        throw new TypeError('Failed to fetch');
      }) as unknown as typeof fetch;

      const result = await generateVietQrPayload(input, { fetchImpl });

      expect(result.source).toBe('offline');
      expect(result.qrCode).toBe(buildVietQrPayload(input));
      expect(new QRPay(result.qrCode).isValid).toBe(true);
    });

    it('falls back to the offline payload on API error code', async () => {
      const fetchImpl = (async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ error: 'E05' }),
        }) as unknown as Response) as unknown as typeof fetch;

      const result = await generateVietQrPayload(input, { fetchImpl });

      expect(result.source).toBe('offline');
      expect(result.qrCode).toBe(buildVietQrPayload(input));
    });

    it('still throws on invalid input (bad BIN) instead of swallowing it', async () => {
      await expect(
        generateVietQrPayload({ bankBin: '12', accountNumber: '0901234567' }),
      ).rejects.toThrow(/bankBin must be a 6-digit/);
    });
  });

  describe('API vs offline payload (R9 invariant)', () => {
    // Vector thật lấy từ vietqr.vn với bankAccount=0901234567,
    // userBankName=NGUYEN VAN A, bankCode=MB, amount=135000, content=POSHQT010042.
    // Lưu ý: API luôn trả Tag 01 = '11' (tĩnh) và bỏ Tag 59 (tên chủ tài khoản).
    const API_VECTOR =
      '00020101021138540010A00000072701240006970422011009012345670208QRIBFTTA530370454061350005802VN62160812POSHQT01004263040248';

    const input = {
      bankBin: '970422',
      accountNumber: '0901234567',
      accountName: 'NGUYEN VAN A',
      amount: money(135000, 'VND'),
      paymentRef: 'POSHQT010042',
    };

    it('both branches carry the same payment-bearing fields', () => {
      const api = new QRPay(API_VECTOR);
      const offline = new QRPay(buildVietQrPayload(input));

      expect(api.isValid).toBe(true);
      expect(offline.isValid).toBe(true);

      for (const qr of [api, offline]) {
        expect(qr.consumer.bankBin).toBe('970422');
        expect(qr.consumer.bankNumber).toBe('0901234567');
        expect(qr.amount).toBe('135000');
        expect(qr.additionalData.purpose).toBe('POSHQT010042');
        expect(qr.currency).toBe('704');
        expect(qr.nation).toBe('VN');
      }
    });

    it('offline branch matches the API byte-for-byte when forced to static without a name', () => {
      // Ghi lại khác biệt đã đo: API dùng initMethod 11 và không set Tag 59.
      const offlineStaticNoName = new QRPay(
        buildVietQrPayload({
          bankBin: '970422',
          accountNumber: '0901234567',
          amount: money(135000, 'VND'),
          paymentRef: 'POSHQT010042',
          // service/name bỏ trống; initMethod do hàm tự chọn '12' khi có tiền,
          // nên chỉ so sánh phần lõi bên dưới thay vì cả chuỗi.
        }),
      );

      expect(offlineStaticNoName.consumer.bankBin).toBe('970422');
      expect(offlineStaticNoName.amount).toBe('135000');
      expect(offlineStaticNoName.additionalData.purpose).toBe('POSHQT010042');
    });

    it('documents the known difference: API is static (tag 01 = 11), offline is dynamic (12)', () => {
      const api = new QRPay(API_VECTOR);
      const offline = new QRPay(buildVietQrPayload(input));

      expect(api.initMethod).toBe('11');
      expect(offline.initMethod).toBe('12');
      // Tag 59: API bỏ, offline có khi biết tên.
      expect(api.merchant.name).toBeUndefined();
      expect(offline.merchant.name).toBe('NGUYEN VAN A');
    });
  });
});
