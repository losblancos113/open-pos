import { describe, it, expect } from 'vitest';
import type { UserDoc, AuthTokenClaims } from '../types';
import { userDocId } from '../../db/ids';
import { GLOBAL_BRANCH_ID } from '../../db/branch';

describe('User & Auth schema', () => {
  it('defines valid UserDoc with global branchId sentinel', () => {
    const user: UserDoc = {
      _id: userDocId('admin'),
      docType: 'user',
      branchId: GLOBAL_BRANCH_ID,
      username: 'admin',
      displayName: 'Quản trị viên',
      pinHash: 'hashed-pin',
      role: 'owner',
      branchIds: ['hq', 'dist1'],
      isActive: true,
      schemaVersion: 1,
      createdAt: '2026-10-25T00:00:00.000Z',
      updatedAt: '2026-10-25T00:00:00.000Z',
    };
    expect(user.role).toBe('owner');
    expect(user.branchIds).toContain('dist1');
  });

  it('defines valid AuthTokenClaims', () => {
    const claims: AuthTokenClaims = {
      sub: 'admin',
      username: 'admin',
      role: 'owner',
      branchIds: ['hq', 'dist1'],
      activeBranchId: 'hq',
      exp: Math.floor(Date.now() / 1000) + 43200,
      iat: Math.floor(Date.now() / 1000),
    };
    expect(claims.activeBranchId).toBe('hq');
  });
});
