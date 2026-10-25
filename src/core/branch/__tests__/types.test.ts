import { describe, it, expect } from 'vitest';
import { branchDocId, userDocId } from '../../db/ids';
import type { BranchDoc } from '../types';
import { GLOBAL_BRANCH_ID } from '../../db/branch';

describe('Branch schema & ID helper', () => {
  it('formats branch document ID correctly', () => {
    expect(branchDocId('hq')).toBe('branch:hq');
    expect(branchDocId('dist1')).toBe('branch:dist1');
  });

  it('rejects invalid branch IDs with colons or empty strings', () => {
    expect(() => branchDocId('')).toThrow('branchId must be a non-empty string');
    expect(() => branchDocId('bad:id')).toThrow('branchId must not contain ":"');
  });

  it('formats user document ID correctly', () => {
    expect(userDocId('u1')).toBe('user:u1');
  });

  it('creates valid BranchDoc shape with global branchId sentinel', () => {
    const branch: BranchDoc = {
      _id: branchDocId('hq'),
      docType: 'branch',
      branchId: GLOBAL_BRANCH_ID,
      code: 'HQ',
      name: 'Trụ sở chính',
      address: '123 Lê Lợi, Q1, TP.HCM',
      phone: '02812345678',
      timezone: 'Asia/Ho_Chi_Minh',
      isActive: true,
      schemaVersion: 1,
      createdAt: '2026-10-25T00:00:00.000Z',
      updatedAt: '2026-10-25T00:00:00.000Z',
    };
    expect(branch.branchId).toBe('*');
  });
});
