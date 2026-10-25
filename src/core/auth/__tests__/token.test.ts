import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateSessionToken,
  verifySessionToken,
  hashPin,
  verifyPin,
  checkPinRateLimit,
  recordFailedPinAttempt,
  resetPinAttempts,
} from '../token';
import type { UserDoc } from '../types';
import { userDocId } from '../../db/ids';
import { GLOBAL_BRANCH_ID } from '../../db/branch';

describe('Auth Token & PIN Security', () => {
  const secret = 'super-secret-key-for-testing-123456';

  const user: UserDoc = {
    _id: userDocId('cashier1'),
    docType: 'user',
    branchId: GLOBAL_BRANCH_ID,
    username: 'cashier1',
    displayName: 'Nguyễn Văn A',
    pinHash: hashPin('1234'),
    role: 'cashier',
    branchIds: ['hq'],
    isActive: true,
    schemaVersion: 1,
    createdAt: '2026-10-25T00:00:00.000Z',
    updatedAt: '2026-10-25T00:00:00.000Z',
  };

  beforeEach(() => {
    resetPinAttempts('cashier1');
  });

  it('hashes PIN and verifies correctly', () => {
    const hash = hashPin('1234');
    expect(verifyPin('1234', hash)).toBe(true);
    expect(verifyPin('9999', hash)).toBe(false);
  });

  it('generates HMAC-signed token and verifies valid token', () => {
    const token = generateSessionToken(user, 'hq', secret, 3600);
    const claims = verifySessionToken(token, secret);

    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe('cashier1');
    expect(claims?.role).toBe('cashier');
    expect(claims?.activeBranchId).toBe('hq');
    expect(claims?.branchIds).toEqual(['hq']);
  });

  it('rejects token with wrong secret or tampered payload', () => {
    const token = generateSessionToken(user, 'hq', secret, 3600);
    expect(verifySessionToken(token, 'wrong-secret')).toBeNull();

    const parts = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ ...user, role: 'owner' })).toString('base64url');
    const tamperedToken = `${tamperedPayload}.${parts[1]}`;
    expect(verifySessionToken(tamperedToken, secret)).toBeNull();
  });

  it('rejects expired token', () => {
    const token = generateSessionToken(user, 'hq', secret, -10); // Expired 10s ago
    expect(verifySessionToken(token, secret)).toBeNull();
  });

  it('Review Focus 5: locks out user after 5 failed PIN attempts for 5 minutes', () => {
    const now = 1000000;
    for (let i = 0; i < 5; i++) {
      expect(checkPinRateLimit('cashier1', now).allowed).toBe(true);
      recordFailedPinAttempt('cashier1', now);
    }

    const checkLocked = checkPinRateLimit('cashier1', now + 1000);
    expect(checkLocked.allowed).toBe(false);
    expect(checkLocked.remainingLockoutSeconds).toBe(299); // 300s - 1s

    // After 5 minutes (300,000ms), lockout expires
    const checkExpired = checkPinRateLimit('cashier1', now + 301000);
    expect(checkExpired.allowed).toBe(true);

    // Finding 4: After lockout expires, attempts should reset so a single new failure does not immediately relock
    recordFailedPinAttempt('cashier1', now + 301000);
    const checkAfterOneFailure = checkPinRateLimit('cashier1', now + 301000);
    expect(checkAfterOneFailure.allowed).toBe(true);
  });
});
