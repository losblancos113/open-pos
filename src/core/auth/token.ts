import type { AuthTokenClaims, UserDoc } from './types';

// ─── Pure TypeScript SHA-256 & HMAC-SHA256 ───────────────────────────────────

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(n: number, b: number): number {
  return (n >>> b) | (n << (32 - b));
}

function sha256(data: Uint8Array): Uint8Array {
  const len = data.length;
  const bitLen = len * 8;
  const kPadLen = (56 - ((len + 1) % 64) + 64) % 64;
  const totalLen = len + 1 + kPadLen + 8;
  const buf = new Uint8Array(totalLen);

  buf.set(data);
  buf[len] = 0x80;

  // Append 64-bit big-endian bit length
  const view = new DataView(buf.buffer);
  view.setUint32(totalLen - 4, bitLen, false);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const W = new Uint32Array(64);

  for (let i = 0; i < totalLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15]!, 7) ^ rotr(W[t - 15]!, 18) ^ (W[t - 15]! >>> 3);
      const s1 = rotr(W[t - 2]!, 17) ^ rotr(W[t - 2]!, 19) ^ (W[t - 2]! >>> 10);
      W[t] = (W[t - 16]! + s0 + W[t - 7]! + s1) >>> 0;
    }

    let a = H[0]!;
    let b = H[1]!;
    let c = H[2]!;
    let d = H[3]!;
    let e = H[4]!;
    let f = H[5]!;
    let g = H[6]!;
    let h = H[7]!;

    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t]! + W[t]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0]! + a) >>> 0;
    H[1] = (H[1]! + b) >>> 0;
    H[2] = (H[2]! + c) >>> 0;
    H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0;
    H[5] = (H[5]! + f) >>> 0;
    H[6] = (H[6]! + g) >>> 0;
    H[7] = (H[7]! + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) {
    outView.setUint32(i * 4, H[i]!, false);
  }
  return out;
}

function hmacSha256(keyStr: string, msgStr: string): Uint8Array {
  const enc = new TextEncoder();
  const rawKey = enc.encode(keyStr);
  const msg = enc.encode(msgStr);

  const key: Uint8Array = rawKey.length > 64 ? sha256(rawKey) : rawKey;
  const paddedKey = new Uint8Array(64);
  paddedKey.set(key);

  const iPad = new Uint8Array(64);
  const oPad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    iPad[i] = paddedKey[i]! ^ 0x36;
    oPad[i] = paddedKey[i]! ^ 0x5c;
  }

  const innerBuf = new Uint8Array(64 + msg.length);
  innerBuf.set(iPad, 0);
  innerBuf.set(msg, 64);
  const innerHash = sha256(innerBuf);

  const outerBuf = new Uint8Array(64 + 32);
  outerBuf.set(oPad, 0);
  outerBuf.set(innerHash, 64);
  return sha256(outerBuf);
}

// ─── Base64URL Encoding & Constant-Time Compare ──────────────────────────────

export function base64urlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 = typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlDecode(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = typeof atob !== 'undefined' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ─── Token Generation & Verification ─────────────────────────────────────────

export function generateSessionToken(
  user: UserDoc,
  activeBranchId: string,
  secret: string,
  ttlSeconds: number = 43200, // 12 hours default
): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: AuthTokenClaims = {
    sub: user.username,
    username: user.username,
    role: user.role,
    branchIds: user.branchIds,
    activeBranchId,
    iat: now,
    exp: now + ttlSeconds,
  };

  const payloadB64 = base64urlEncode(JSON.stringify(claims));
  const sig = base64urlEncode(hmacSha256(secret, payloadB64));
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  nowEpochSeconds: number = Math.floor(Date.now() / 1000),
): AuthTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const payloadB64 = parts[0]!;
  const signatureB64 = parts[1]!;

  const expectedSig = base64urlEncode(hmacSha256(secret, payloadB64));
  if (!constantTimeEqual(signatureB64, expectedSig)) {
    return null;
  }

  try {
    const claimsStr = base64urlDecode(payloadB64);
    const claims = JSON.parse(claimsStr) as AuthTokenClaims;
    if (typeof claims.exp === 'number' && claims.exp < nowEpochSeconds) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

// ─── PIN Hashing & Verification ──────────────────────────────────────────────

export function hashPin(pin: string, salt: string = 'openpos_salt_v1'): string {
  const hash = base64urlEncode(hmacSha256(salt, `pin:${pin}`));
  return `pin_v1$${salt}$${hash}`;
}

export function verifyPin(pin: string, pinHash: string): boolean {
  const parts = pinHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'pin_v1') {
    return false;
  }
  const salt = parts[1]!;
  const expectedHash = parts[2]!;
  const actualHash = base64urlEncode(hmacSha256(salt, `pin:${pin}`));
  return constantTimeEqual(actualHash, expectedHash);
}

// ─── Rate Limiting & Lockout ──────────────────────────────────────────────────

interface RateLimitEntry {
  attempts: number;
  lockedUntilMs: number;
}

const pinAttempts = new Map<string, RateLimitEntry>();

export function checkPinRateLimit(
  userId: string,
  nowEpochMs: number = Date.now(),
): { allowed: boolean; remainingLockoutSeconds?: number } {
  const entry = pinAttempts.get(userId);
  if (!entry) return { allowed: true };

  if (entry.lockedUntilMs > nowEpochMs) {
    const remainingLockoutSeconds = Math.ceil((entry.lockedUntilMs - nowEpochMs) / 1000);
    return { allowed: false, remainingLockoutSeconds };
  }

  return { allowed: true };
}

export function recordFailedPinAttempt(userId: string, nowEpochMs: number = Date.now()): void {
  const entry = pinAttempts.get(userId) ?? { attempts: 0, lockedUntilMs: 0 };
  entry.attempts += 1;

  if (entry.attempts >= 5) {
    entry.lockedUntilMs = nowEpochMs + 5 * 60 * 1000; // 5 minute lockout
  }

  pinAttempts.set(userId, entry);
}

export function resetPinAttempts(userId: string): void {
  pinAttempts.delete(userId);
}
