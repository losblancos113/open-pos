/**
 * Pure Offline QR Matrix to SVG Renderer
 *
 * Thin adapter over the vendored Nayuki QR generator (`qrcodegen.ts`),
 * producing 2D boolean matrices and standard SVG strings.
 *
 * Invariants:
 * - Pure domain logic with zero external or framework dependencies (AGENTS.md §2, §4.5).
 * - Zero network requests: runs 100% offline on any terminal or device.
 * - Supports arbitrary byte payloads up to QR Version 40 (including VietQR ~150-250+ chars).
 */

import { Ecc, QrCode, QrSegment } from './qrcodegen';

export type EcLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrSvgOptions {
  size?: number;
  margin?: number;
  ecLevel?: EcLevel;
}

const ECC_BY_LEVEL: Record<EcLevel, Ecc> = {
  L: Ecc.LOW,
  M: Ecc.MEDIUM,
  Q: Ecc.QUARTILE,
  H: Ecc.HIGH,
};

/**
 * Generates a 2D boolean array representing the QR code matrix.
 *
 * @param text The string to encode (UTF-8 bytes)
 * @param ecLevel Error correction level ('L', 'M', 'Q', 'H'), defaults to 'M'
 * @returns 2D boolean array of modules (true = dark, false = light)
 */
export function generateQrMatrix(text: string, ecLevel: EcLevel = 'M'): boolean[][] {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('generateQrMatrix(): text must be a non-empty string');
  }

  let qr: QrCode;
  try {
    // boostEcl = false: honour the requested level so the format bits stay predictable.
    qr = QrCode.encodeSegments(QrSegment.makeSegments(text), ECC_BY_LEVEL[ecLevel], 1, 40, -1, false);
  } catch (err) {
    if (err instanceof RangeError && err.message === 'Data too long') {
      throw new Error(
        `generateQrMatrix(): text too long for QR code (exceeds Version 40 capacity for EC level ${ecLevel})`,
      );
    }
    throw err;
  }

  const matrix: boolean[][] = [];
  for (let y = 0; y < qr.size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < qr.size; x++) {
      row.push(qr.getModule(x, y));
    }
    matrix.push(row);
  }
  return matrix;
}

/**
 * Generates a clean standalone SVG string for the given text.
 *
 * @param text Payload to encode (e.g. VietQR EMVCo string or URL)
 * @param options Styling options (size, margin, ecLevel)
 * @returns Valid standalone SVG XML string
 */
export function generateQrSvg(text: string, options?: QrSvgOptions): string {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('generateQrSvg(): text must be a non-empty string');
  }

  const size = options?.size ?? 256;
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error(`generateQrSvg(): size must be a positive integer, got ${size}`);
  }

  const margin = options?.margin ?? 4;
  if (!Number.isInteger(margin) || margin < 0) {
    throw new Error(`generateQrSvg(): margin must be a non-negative integer, got ${margin}`);
  }

  const ecLevel = options?.ecLevel ?? 'M';
  const matrix = generateQrMatrix(text, ecLevel);
  const matrixSize = matrix.length;
  const viewBoxSize = matrixSize + margin * 2;

  let rects = '';
  for (let r = 0; r < matrixSize; r++) {
    const row = matrix[r]!;
    for (let c = 0; c < matrixSize; c++) {
      if (row[c]) {
        rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="#000000"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${size}" height="${size}"><rect width="${viewBoxSize}" height="${viewBoxSize}" fill="#ffffff"/>${rects}</svg>`;
}
