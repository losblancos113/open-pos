import { describe, it, expect } from 'vitest';
import { generateQrSvg, generateQrMatrix } from '../qr-matrix';
import { buildVietQrPayload } from '../vietqr';
import { money } from '../../money';

describe('Offline QR Matrix SVG generator', () => {
  it('generates an SVG string containing valid dimensions and rect elements', () => {
    const svg = generateQrSvg('https://openpos.vn', { size: 256 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('<rect');
    expect(svg).toContain('width="256"');
    expect(svg).toContain('height="256"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('renders VietQR payload into a readable SVG without throwing', () => {
    const longPayload =
      '00020101021238580010A00000072701260006970422011209012345670208QRIBFTTA530370454061350005802VN5911NGUYEN VAN A62160812POSHQT010042630429B1';
    const svg = generateQrSvg(longPayload);
    expect(svg.length).toBeGreaterThan(500);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('viewBox=');
    // Default size is 256
    expect(svg).toContain('width="256"');
    expect(svg).toContain('height="256"');
  });

  it('respects custom size and margin options', () => {
    const svg = generateQrSvg('TEST', { size: 512, margin: 2 });
    expect(svg).toContain('width="512"');
    expect(svg).toContain('height="512"');
    // Check viewBox reflects matrix size + 2 * margin
    // Version 1 is 21x21 modules, with margin 2 each side -> 25x25
    expect(svg).toContain('viewBox="0 0 25 25"');
  });

  it('supports margin 0 (no quiet zone)', () => {
    const svg = generateQrSvg('TEST', { size: 210, margin: 0 });
    expect(svg).toContain('viewBox="0 0 21 21"');
    expect(svg).toContain('width="210"');
  });

  it('supports UTF-8 Vietnamese strings', () => {
    const svg = generateQrSvg('Cà phê sữa đá Sài Gòn');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('<rect');
  });

  it('supports larger payloads up to 250+ characters', () => {
    const veryLongPayload =
      '00020101021238580010A00000072701260006970422011209012345670208QRIBFTTA530370454061350005802VN5925CONG TY TNHH MOT THANH VIEN CA PHE VIET NAM62200816POSORD2026102300018020POS-TERMINAL-01-TABLE-056304ABCD';
    const svg = generateQrSvg(veryLongPayload);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.length).toBeGreaterThan(1000);
  });

  it('supports all error correction levels: L, M, Q, H', () => {
    for (const ecLevel of ['L', 'M', 'Q', 'H'] as const) {
      const svg = generateQrSvg('PAYMENT_CHECKOUT', { ecLevel });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
    }
  });

  it('generates expected 2D boolean matrix with finder and timing patterns', () => {
    const matrix = generateQrMatrix('TEST', 'M');
    const n = matrix.length;
    expect(n).toBe(21); // Version 1 is 21x21

    // Finder pattern top-left: 7x7 outer border is dark
    for (let i = 0; i < 7; i++) {
      expect(matrix[0]![i]).toBe(true);
      expect(matrix[6]![i]).toBe(true);
      expect(matrix[i]![0]).toBe(true);
      expect(matrix[i]![6]).toBe(true);
    }
    // Finder center 3x3 is dark
    expect(matrix[3]![3]).toBe(true);

    // Timing pattern row 6 from col 8 to 12
    expect(matrix[6]![8]).toBe(true);
    expect(matrix[6]![9]).toBe(false);
    expect(matrix[6]![10]).toBe(true);
    expect(matrix[6]![11]).toBe(false);
    expect(matrix[6]![12]).toBe(true);
  });

  it('conforms to ISO/IEC 18004 Table 23 format information placement and passes BCH integrity check', () => {
    const ecLevelMap = {
      L: 1, // 01
      M: 0, // 00
      Q: 3, // 11
      H: 2, // 10
    } as const;

    for (const [level, expectedEcBits] of Object.entries(ecLevelMap) as Array<[keyof typeof ecLevelMap, number]>) {
      const matrix = generateQrMatrix('https://openpos.vn', level);
      const size = matrix.length;

      // Extract Copy 1 (top-left) according to ISO/IEC 18004 Table 23
      let copy1 = 0;
      for (let i = 0; i < 15; i++) {
        let r: number;
        let c: number;
        if (i <= 5) {
          r = i;
          c = 8;
        } else if (i === 6) {
          r = 7;
          c = 8;
        } else if (i === 7) {
          r = 8;
          c = 8;
        } else if (i === 8) {
          r = 8;
          c = 7;
        } else {
          r = 8;
          c = 14 - i;
        }
        if (matrix[r]![c]) {
          copy1 |= 1 << i;
        }
      }

      // Extract Copy 2 (bottom-left and top-right) according to ISO/IEC 18004 Table 23
      let copy2 = 0;
      for (let i = 0; i < 15; i++) {
        let r: number;
        let c: number;
        if (i < 8) {
          r = 8;
          c = size - 1 - i;
        } else {
          r = size - 15 + i;
          c = 8;
        }
        if (matrix[r]![c]) {
          copy2 |= 1 << i;
        }
      }

      // Both copies must match
      expect(copy1).toBe(copy2);

      // Unmask with ISO 18004 mask 0x5412
      const unmasked1 = copy1 ^ 0x5412;
      const unmasked2 = copy2 ^ 0x5412;

      // Calculate BCH syndrome: GF(2) division by generator polynomial 0x537 (x^10 + x^8 + x^5 + x^4 + x^2 + x + 1)
      const getBchSyndrome = (formatBits: number): number => {
        let rem = formatBits;
        for (let i = 4; i >= 0; i--) {
          if ((rem & (1 << (i + 10))) !== 0) {
            rem ^= 0x537 << i;
          }
        }
        return rem;
      };

      expect(getBchSyndrome(unmasked1)).toBe(0);
      expect(getBchSyndrome(unmasked2)).toBe(0);

      // Verify data bits (top 5 bits of unmasked format information)
      const dataBits = unmasked1 >> 10;
      const extractedEcBits = dataBits >> 3;
      const extractedMask = dataBits & 0x07;

      expect(extractedEcBits).toBe(expectedEcBits);
      expect(extractedMask).toBeGreaterThanOrEqual(0);
      expect(extractedMask).toBeLessThanOrEqual(7);
    }
  });

  it('seamlessly integrates with buildVietQrPayload to produce printable SVG', () => {
    const payload = buildVietQrPayload({
      bankBin: '970422', // MB Bank
      accountNumber: '0901234567',
      accountName: 'NGUYEN VAN A',
      amount: money(150000, 'VND'),
      paymentRef: 'POSORD001',
    });

    const svg = generateQrSvg(payload, { size: 300, margin: 4 });
    expect(svg).toContain('width="300"');
    expect(svg).toContain('height="300"');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('<rect');
  });

  it('throws descriptive error on invalid inputs', () => {
    expect(() => generateQrSvg('')).toThrow('generateQrSvg(): text must be a non-empty string');
    // @ts-expect-error testing invalid type
    expect(() => generateQrSvg(null)).toThrow('generateQrSvg(): text must be a non-empty string');
    // @ts-expect-error testing invalid type
    expect(() => generateQrSvg(undefined)).toThrow('generateQrSvg(): text must be a non-empty string');
    expect(() => generateQrSvg('test', { size: 0 })).toThrow('generateQrSvg(): size must be a positive integer');
    expect(() => generateQrSvg('test', { size: -10 })).toThrow('generateQrSvg(): size must be a positive integer');
    expect(() => generateQrSvg('test', { margin: -1 })).toThrow('generateQrSvg(): margin must be a non-negative integer');
    expect(() => generateQrMatrix('')).toThrow('generateQrMatrix(): text must be a non-empty string');
  });

  it('throws error when text exceeds QR code Version 40 capacity', () => {
    const hugeText = 'A'.repeat(3000);
    expect(() => generateQrMatrix(hugeText, 'H')).toThrow('text too long for QR code');
  });
});
