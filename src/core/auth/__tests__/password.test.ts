import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  checkAuthRateLimit,
  recordFailedAuthAttempt,
  resetAuthAttempts,
} from '../token';

describe('Password Hashing & Authentication Rate Limit', () => {
  beforeEach(() => {
    resetAuthAttempts('user_test_1');
  });

  it('hashes password with salt and produces secure hash format', () => {
    const hash = hashPassword('MySecurePass123!');
    expect(hash).toMatch(/^pwd_v1\$[a-zA-Z0-9_-]+\$[a-zA-Z0-9_-]+$/);
  });

  it('verifies correct password successfully', () => {
    const hash = hashPassword('SuperAdmin@2026');
    expect(verifyPassword('SuperAdmin@2026', hash)).toBe(true);
    expect(verifyPassword('WrongPassword', hash)).toBe(false);
    expect(verifyPassword('', hash)).toBe(false);
  });

  it('produces different hashes for the same password due to random salt', () => {
    const hash1 = hashPassword('same_password');
    const hash2 = hashPassword('same_password');
    expect(hash1).not.toBe(hash2);
    expect(verifyPassword('same_password', hash1)).toBe(true);
    expect(verifyPassword('same_password', hash2)).toBe(true);
  });

  it('rejects invalid or corrupted hash formats gracefully', () => {
    expect(verifyPassword('secret', 'not-a-valid-hash')).toBe(false);
    expect(verifyPassword('secret', 'pwd_v1$short')).toBe(false);
    expect(verifyPassword('secret', '')).toBe(false);
  });

  it('locks out user after 5 consecutive failed attempts', () => {
    const userId = 'user_test_1';
    const baseTime = 1700000000000;

    for (let i = 0; i < 4; i++) {
      recordFailedAuthAttempt(userId, baseTime);
      expect(checkAuthRateLimit(userId, baseTime).allowed).toBe(true);
    }

    // 5th failed attempt triggers lockout for 5 minutes (300 seconds)
    recordFailedAuthAttempt(userId, baseTime);
    const limit = checkAuthRateLimit(userId, baseTime);
    expect(limit.allowed).toBe(false);
    expect(limit.remainingLockoutSeconds).toBe(300);

    // After 2 minutes, still locked out
    expect(checkAuthRateLimit(userId, baseTime + 120 * 1000).allowed).toBe(false);

    // After 5 minutes (300 seconds), lockout expires
    expect(checkAuthRateLimit(userId, baseTime + 301 * 1000).allowed).toBe(true);
  });

  it('resets attempts after successful login', () => {
    const userId = 'user_test_1';
    recordFailedAuthAttempt(userId);
    recordFailedAuthAttempt(userId);
    resetAuthAttempts(userId);
    expect(checkAuthRateLimit(userId).allowed).toBe(true);
  });
});
