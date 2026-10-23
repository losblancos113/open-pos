import { describe, it, expect } from 'vitest';
import { crc16Ccitt, formatTlv, buildVietQrPayload, sanitizeAccountName } from '../vietqr';
import { BANK_PRESETS, findBankPresetByBin, type BankAccountDoc } from '../bank-account';
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
  });
});
