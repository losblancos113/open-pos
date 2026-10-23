/**
 * Pure Offline QR Matrix to SVG Renderer
 *
 * Standalone, zero-dependency QR code generator (ISO/IEC 18004 Model 2)
 * producing 2D boolean matrices and standard SVG strings.
 *
 * Invariants:
 * - Pure domain logic with zero external or framework dependencies (AGENTS.md §2, §4.5).
 * - Zero network requests: runs 100% offline on any terminal or device.
 * - Supports arbitrary byte payloads up to QR Version 40 (including VietQR ~150-250+ chars).
 */

export type EcLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrSvgOptions {
  size?: number;
  margin?: number;
  ecLevel?: EcLevel;
}

// ---------------------------------------------------------------------------
// QR Code Tables (ISO/IEC 18004)
// ---------------------------------------------------------------------------

// Total codewords (data + error correction) for Versions 1..40 (1-indexed)
const TOTAL_CODEWORDS: readonly number[] = [
  0,
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
  404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
  1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185,
  2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706,
];

// Remainder bits after interleaving for Versions 1..40 (1-indexed)
const REMAINDER_BITS: readonly number[] = [
  0,
  0, 7, 7, 7, 7, 7, 0, 0, 0, 0,
  0, 0, 0, 3, 3, 3, 3, 3, 3, 3,
  4, 4, 4, 4, 4, 4, 4, 3, 3, 3,
  3, 3, 3, 3, 0, 0, 0, 0, 0, 0,
];

// Alignment pattern center coordinates for Versions 1..40 (1-indexed)
const ALIGNMENT_PATTERN_POSITIONS: readonly number[][] = [
  [], // V1 has no alignment pattern
  [6, 18], // V2
  [6, 22], // V3
  [6, 26], // V4
  [6, 30], // V5
  [6, 34], // V6
  [6, 22, 38], // V7
  [6, 24, 42], // V8
  [6, 26, 46], // V9
  [6, 28, 50], // V10
  [6, 30, 54], // V11
  [6, 32, 58], // V12
  [6, 34, 62], // V13
  [6, 26, 46, 66], // V14
  [6, 26, 48, 70], // V15
  [6, 26, 50, 74], // V16
  [6, 30, 54, 78], // V17
  [6, 30, 56, 82], // V18
  [6, 30, 58, 86], // V19
  [6, 34, 62, 90], // V20
  [6, 28, 50, 72, 94], // V21
  [6, 26, 50, 74, 98], // V22
  [6, 30, 54, 78, 102], // V23
  [6, 28, 54, 80, 106], // V24
  [6, 32, 58, 84, 110], // V25
  [6, 30, 58, 86, 114], // V26
  [6, 34, 62, 90, 118], // V27
  [6, 26, 50, 74, 98, 122], // V28
  [6, 30, 54, 78, 102, 126], // V29
  [6, 26, 52, 78, 104, 130], // V30
  [6, 30, 56, 82, 108, 134], // V31
  [6, 34, 60, 86, 112, 138], // V32
  [6, 30, 58, 86, 114, 142], // V33
  [6, 34, 62, 90, 118, 146], // V34
  [6, 30, 54, 78, 102, 126, 150], // V35
  [6, 24, 50, 76, 102, 128, 154], // V36
  [6, 28, 54, 80, 106, 132, 158], // V37
  [6, 32, 58, 84, 110, 136, 162], // V38
  [6, 26, 54, 82, 110, 138, 166], // V39
  [6, 30, 58, 86, 114, 142, 170], // V40
];

// Error correction codewords per block for Versions 1..40
const ECC_CODEWORDS: Record<EcLevel, readonly number[]> = {
  L: [
    0,
    7, 10, 15, 20, 26, 18, 20, 24, 30, 18,
    20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
    28, 28, 30, 30, 26, 28, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  M: [
    0,
    10, 16, 26, 18, 24, 16, 18, 22, 22, 26,
    30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
    26, 28, 28, 28, 28, 28, 28, 28, 28, 28,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  ],
  Q: [
    0,
    13, 22, 18, 26, 18, 24, 18, 22, 20, 24,
    28, 26, 24, 20, 30, 24, 28, 28, 26, 30,
    28, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  H: [
    0,
    17, 28, 22, 16, 22, 28, 26, 26, 24, 28,
    24, 28, 22, 24, 24, 30, 28, 28, 26, 28,
    30, 24, 30, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
};

// Number of error correction blocks for Versions 1..40
const NUM_BLOCKS: Record<EcLevel, readonly number[]> = {
  L: [
    0,
    1, 1, 1, 1, 1, 2, 2, 2, 2, 4,
    4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
    8, 9, 9, 10, 12, 12, 12, 13, 14, 15,
    16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
  ],
  M: [
    0,
    1, 1, 1, 2, 2, 4, 4, 4, 5, 5,
    5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
    17, 17, 18, 20, 21, 23, 25, 26, 28, 29,
    31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
  ],
  Q: [
    0,
    1, 1, 2, 2, 4, 4, 6, 6, 8, 8,
    8, 10, 12, 16, 12, 17, 16, 18, 21, 20,
    23, 23, 25, 27, 29, 34, 34, 35, 38, 40,
    43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
  ],
  H: [
    0,
    1, 1, 2, 4, 4, 4, 5, 6, 8, 8,
    11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
    25, 34, 30, 32, 35, 37, 40, 42, 45, 48,
    51, 54, 57, 60, 63, 66, 70, 72, 74, 77,
  ],
};

// 2-bit format indicators for Error Correction levels
const EC_FORMAT_BITS: Record<EcLevel, number> = {
  L: 1, // 01
  M: 0, // 00
  Q: 3, // 11
  H: 2, // 10
};

// ---------------------------------------------------------------------------
// Galois Field GF(2^8) Arithmetic for Reed-Solomon Code
// ---------------------------------------------------------------------------

const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(() => {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = val;
    EXP_TABLE[i + 255] = val;
    LOG_TABLE[val] = i;
    val <<= 1;
    if (val & 0x100) {
      val ^= 0x11d; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
    }
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x]! + LOG_TABLE[y]!]!;
}

function getRsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const alpha = EXP_TABLE[i]!;
    for (let j = 0; j < poly.length; j++) {
      next[j] = (next[j] ?? 0) ^ poly[j]!;
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(poly[j]!, alpha);
    }
    poly = next;
  }
  return poly;
}

function computeRsRemainder(data: Uint8Array, degree: number, genPoly: Uint8Array): Uint8Array {
  const rem = new Uint8Array(degree);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i]! ^ rem[0]!;
    for (let j = 0; j < degree - 1; j++) {
      rem[j] = rem[j + 1]!;
    }
    rem[degree - 1] = 0;
    for (let j = 0; j < degree; j++) {
      rem[j] = (rem[j] ?? 0) ^ gfMul(genPoly[j + 1]!, factor);
    }
  }
  return rem;
}

// ---------------------------------------------------------------------------
// Helpers: UTF-8 Encoding, Format/Version BCH Codes
// ---------------------------------------------------------------------------

function encodeUtf8(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.codePointAt(i)!;
    if (code > 0xffff) {
      i++; // Surrogate pair
    }
    if (code <= 0x7f) {
      bytes.push(code);
    } else if (code <= 0x7ff) {
      bytes.push(0xc0 | (code >> 6));
      bytes.push(0x80 | (code & 0x3f));
    } else if (code <= 0xffff) {
      bytes.push(0xe0 | (code >> 12));
      bytes.push(0x80 | ((code >> 6) & 0x3f));
      bytes.push(0x80 | (code & 0x3f));
    } else {
      bytes.push(0xf0 | (code >> 18));
      bytes.push(0x80 | ((code >> 12) & 0x3f));
      bytes.push(0x80 | ((code >> 6) & 0x3f));
      bytes.push(0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

function getFormatInfo(ecBits: number, mask: number): number {
  const data = (ecBits << 3) | mask;
  let rem = data << 10;
  for (let i = 4; i >= 0; i--) {
    if ((rem & (1 << (i + 10))) !== 0) {
      rem ^= 0x537 << i;
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function getVersionInfo(version: number): number {
  let rem = version << 12;
  for (let i = 5; i >= 0; i--) {
    if ((rem & (1 << (i + 12))) !== 0) {
      rem ^= 0x1f25 << i;
    }
  }
  return (version << 12) | rem;
}

function isMasked(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Penalty Evaluation (ISO/IEC 18004 §6.8.2.1)
// ---------------------------------------------------------------------------

function getPenaltyScore(modules: boolean[][]): number {
  const size = modules.length;
  let penalty = 0;

  // Rule 1: Rows
  for (let r = 0; r < size; r++) {
    const row = modules[r]!;
    let runColor = row[0]!;
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (row[c] === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) {
          penalty += 3 + (runLen - 5);
        }
        runColor = row[c]!;
        runLen = 1;
      }
    }
    if (runLen >= 5) {
      penalty += 3 + (runLen - 5);
    }
  }

  // Rule 1: Columns
  for (let c = 0; c < size; c++) {
    let runColor = modules[0]![c]!;
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      const color = modules[r]![c]!;
      if (color === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) {
          penalty += 3 + (runLen - 5);
        }
        runColor = color;
        runLen = 1;
      }
    }
    if (runLen >= 5) {
      penalty += 3 + (runLen - 5);
    }
  }

  // Rule 2: 2x2 blocks of the same color
  for (let r = 0; r < size - 1; r++) {
    const row1 = modules[r]!;
    const row2 = modules[r + 1]!;
    for (let c = 0; c < size - 1; c++) {
      const color = row1[c]!;
      if (row2[c] === color && row1[c + 1] === color && row2[c + 1] === color) {
        penalty += 3;
      }
    }
  }

  // Rule 3: 1:1:3:1:1 pattern with 4 light modules on either side
  // 00001011101 (0x05D) or 10111010000 (0x5D0)
  for (let r = 0; r < size; r++) {
    const row = modules[r]!;
    let bits = 0;
    for (let c = 0; c < size; c++) {
      bits = ((bits << 1) & 0x7ff) | (row[c] ? 1 : 0);
      if (c >= 10 && (bits === 0x05d || bits === 0x5d0)) {
        penalty += 40;
      }
    }
  }
  for (let c = 0; c < size; c++) {
    let bits = 0;
    for (let r = 0; r < size; r++) {
      bits = ((bits << 1) & 0x7ff) | (modules[r]![c] ? 1 : 0);
      if (r >= 10 && (bits === 0x05d || bits === 0x5d0)) {
        penalty += 40;
      }
    }
  }

  // Rule 4: Proportion of dark modules
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    const row = modules[r]!;
    for (let c = 0; c < size; c++) {
      if (row[c]) {
        darkCount++;
      }
    }
  }
  const total = size * size;
  const k = Math.floor(Math.abs(darkCount * 20 - total * 10) / total);
  penalty += k * 10;

  return penalty;
}

// ---------------------------------------------------------------------------
// QR Code Generator Implementation
// ---------------------------------------------------------------------------

function applyFormatInfo(modules: boolean[][], ecBits: number, mask: number): void {
  const size = modules.length;
  const format = getFormatInfo(ecBits, mask);

  for (let i = 0; i < 15; i++) {
    const bit = ((format >> i) & 1) === 1;

    // First copy: top-left (ISO/IEC 18004 Table 23)
    let r1: number;
    let c1: number;
    if (i <= 5) {
      r1 = i;
      c1 = 8;
    } else if (i === 6) {
      r1 = 7;
      c1 = 8;
    } else if (i === 7) {
      r1 = 8;
      c1 = 8;
    } else if (i === 8) {
      r1 = 8;
      c1 = 7;
    } else {
      r1 = 8;
      c1 = 14 - i;
    }
    modules[r1]![c1] = bit;

    // Second copy: bottom-left and top-right (ISO/IEC 18004 Table 23)
    let r2: number;
    let c2: number;
    if (i < 8) {
      r2 = 8;
      c2 = size - 1 - i;
    } else {
      r2 = size - 15 + i;
      c2 = 8;
    }
    modules[r2]![c2] = bit;
  }
}

function applyVersionInfo(modules: boolean[][], version: number): void {
  const size = modules.length;
  const vInfo = getVersionInfo(version);

  for (let i = 0; i < 18; i++) {
    const bit = ((vInfo >> i) & 1) === 1;
    const a = Math.floor(i / 3);
    const b = i % 3;

    // Top-right
    modules[a]![size - 11 + b] = bit;
    // Bottom-left
    modules[size - 11 + b]![a] = bit;
  }
}

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

  const rawBytes = encodeUtf8(text);
  const dataByteCount = rawBytes.length;

  // Determine minimum version that fits dataByteCount
  let version = 0;
  let totalDataCodewords = 0;

  for (let v = 1; v <= 40; v++) {
    const totalCodewords = TOTAL_CODEWORDS[v]!;
    const ecPerBlock = ECC_CODEWORDS[ecLevel][v]!;
    const numBlocks = NUM_BLOCKS[ecLevel][v]!;
    const dataCodewords = totalCodewords - ecPerBlock * numBlocks;
    const headerBits = v <= 9 ? 12 : 20; // 4 bits mode + 8 or 16 bits count
    const maxCapacity = Math.floor((dataCodewords * 8 - headerBits) / 8);

    if (dataByteCount <= maxCapacity) {
      version = v;
      totalDataCodewords = dataCodewords;
      break;
    }
  }

  if (version === 0) {
    throw new Error(
      `generateQrMatrix(): text too long for QR code (exceeds Version 40 capacity for EC level ${ecLevel})`,
    );
  }

  const ecPerBlock = ECC_CODEWORDS[ecLevel][version]!;
  const numBlocks = NUM_BLOCKS[ecLevel][version]!;
  const ecBits = EC_FORMAT_BITS[ecLevel];

  // 1. Build data bit stream (Byte Mode: 0100)
  const bits: number[] = [0, 1, 0, 0];
  const charCountBits = version <= 9 ? 8 : 16;
  for (let b = charCountBits - 1; b >= 0; b--) {
    bits.push((dataByteCount >> b) & 1);
  }
  for (const byte of rawBytes) {
    for (let b = 7; b >= 0; b--) {
      bits.push((byte >> b) & 1);
    }
  }

  // Terminator (up to 4 zero bits)
  const capacityBits = totalDataCodewords * 8;
  const terminatorCount = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < terminatorCount; i++) {
    bits.push(0);
  }

  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  // Alternating pad bytes 0xEC and 0x11
  let padByte = 0xec;
  while (bits.length < capacityBits) {
    for (let b = 7; b >= 0; b--) {
      bits.push((padByte >> b) & 1);
    }
    padByte = padByte === 0xec ? 0x11 : 0xec;
  }

  // Convert bit stream to data codewords array
  const dataCodewords = new Uint8Array(totalDataCodewords);
  for (let i = 0; i < totalDataCodewords; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bits[i * 8 + b]!;
    }
    dataCodewords[i] = byte;
  }

  // 2. Split data codewords into blocks and compute EC codewords
  const rem = totalDataCodewords % numBlocks;
  const d1 = Math.floor(totalDataCodewords / numBlocks);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  const genPoly = getRsGeneratorPoly(ecPerBlock);

  let offset = 0;
  for (let i = 0; i < numBlocks; i++) {
    const blockSize = i < numBlocks - rem ? d1 : d1 + 1;
    const block = dataCodewords.slice(offset, offset + blockSize);
    dataBlocks.push(block);
    ecBlocks.push(computeRsRemainder(block, ecPerBlock, genPoly));
    offset += blockSize;
  }

  // 3. Interleave data and error correction codewords
  const finalCodewords: number[] = [];
  const maxBlockLen = d1 + (rem > 0 ? 1 : 0);
  for (let col = 0; col < maxBlockLen; col++) {
    for (let i = 0; i < numBlocks; i++) {
      if (col < dataBlocks[i]!.length) {
        finalCodewords.push(dataBlocks[i]![col]!);
      }
    }
  }
  for (let col = 0; col < ecPerBlock; col++) {
    for (let i = 0; i < numBlocks; i++) {
      finalCodewords.push(ecBlocks[i]![col]!);
    }
  }

  // 4. Convert interleaved codewords to matrix bits and add remainder bits
  const matrixBits: number[] = [];
  for (const cw of finalCodewords) {
    for (let b = 7; b >= 0; b--) {
      matrixBits.push((cw >> b) & 1);
    }
  }
  const remainderCount = REMAINDER_BITS[version]!;
  for (let i = 0; i < remainderCount; i++) {
    matrixBits.push(0);
  }

  // 5. Construct QR Matrix and place function patterns
  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Helper to mark function module
  const setFunctionModule = (r: number, c: number, dark: boolean) => {
    modules[r]![c] = dark;
    isFunction[r]![c] = true;
  };

  // 5a. Finder Patterns & Separators
  const placeFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setFunctionModule(r0 + r, c0 + c, isBorder || isCenter);
      }
    }
  };

  // Top-left
  placeFinder(0, 0);
  for (let i = 0; i < 8; i++) {
    setFunctionModule(7, i, false);
    setFunctionModule(i, 7, false);
  }

  // Top-right
  placeFinder(0, size - 7);
  for (let i = 0; i < 8; i++) {
    setFunctionModule(7, size - 8 + i, false);
    setFunctionModule(i, size - 8, false);
  }

  // Bottom-left
  placeFinder(size - 7, 0);
  for (let i = 0; i < 8; i++) {
    setFunctionModule(size - 8, i, false);
    setFunctionModule(size - 8 + i, 7, false);
  }

  // 5b. Alignment Patterns (Version >= 2)
  if (version >= 2) {
    const positions = ALIGNMENT_PATTERN_POSITIONS[version]!;
    for (const r0 of positions) {
      for (const c0 of positions) {
        // Skip if overlaps with any finder pattern
        if (
          (r0 < 9 && c0 < 9) ||
          (r0 < 9 && c0 >= size - 8) ||
          (r0 >= size - 8 && c0 < 9)
        ) {
          continue;
        }

        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dist = Math.max(Math.abs(dr), Math.abs(dc));
            setFunctionModule(r0 + dr, c0 + dc, dist !== 1);
          }
        }
      }
    }
  }

  // 5c. Timing Patterns
  for (let i = 8; i <= size - 9; i++) {
    if (!isFunction[6]![i]) {
      setFunctionModule(6, i, i % 2 === 0);
    }
    if (!isFunction[i]![6]) {
      setFunctionModule(i, 6, i % 2 === 0);
    }
  }

  // 5d. Dark Module
  setFunctionModule(size - 8, 8, true);

  // 5e. Reserve Format Information Areas
  for (let i = 0; i <= 8; i++) {
    isFunction[8]![i] = true;
    isFunction[i]![8] = true;
  }
  for (let i = size - 8; i < size; i++) {
    isFunction[8]![i] = true;
  }
  for (let i = size - 7; i < size; i++) {
    isFunction[i]![8] = true;
  }

  // 5f. Reserve Version Information Areas (Version >= 7)
  if (version >= 7) {
    for (let r = 0; r < 6; r++) {
      for (let c = size - 11; c <= size - 9; c++) {
        isFunction[r]![c] = true;
      }
    }
    for (let r = size - 11; r <= size - 9; r++) {
      for (let c = 0; c < 6; c++) {
        isFunction[r]![c] = true;
      }
    }
  }

  // 6. Place Data Bits in Non-Function Modules
  let bitIdx = 0;
  let upward = true;
  for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
    if (rightCol === 6) {
      rightCol = 5;
    }
    const rowStart = upward ? size - 1 : 0;
    const rowEnd = upward ? -1 : size;
    const rowStep = upward ? -1 : 1;

    for (let r = rowStart; r !== rowEnd; r += rowStep) {
      for (const c of [rightCol, rightCol - 1]) {
        if (!isFunction[r]![c]) {
          modules[r]![c] = matrixBits[bitIdx++] === 1;
        }
      }
    }
    upward = !upward;
  }

  // 7. Find Best Mask Pattern (0..7) with Lowest Penalty Score
  let bestMask = 0;
  let minPenalty = Number.POSITIVE_INFINITY;
  let bestCandidate: boolean[][] = modules;

  for (let mask = 0; mask < 8; mask++) {
    const candidate: boolean[][] = modules.map((row, r) =>
      row.map((val, c) => {
        if (!isFunction[r]![c] && isMasked(mask, r, c)) {
          return !val;
        }
        return val;
      }),
    );

    applyFormatInfo(candidate, ecBits, mask);
    if (version >= 7) {
      applyVersionInfo(candidate, version);
    }

    const penalty = getPenaltyScore(candidate);
    if (penalty < minPenalty) {
      minPenalty = penalty;
      bestMask = mask;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
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
