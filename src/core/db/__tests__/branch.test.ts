import { describe, it, expect } from 'vitest';
import { DEFAULT_BRANCH_ID, GLOBAL_BRANCH_ID, isGlobalBranch } from '../branch';

describe('catalog branch tiers', () => {
  it('uses a non-empty sentinel for the global tier', () => {
    // Invariant #1: branchId luôn là chuỗi không rỗng, kể cả doc dùng chung.
    expect(GLOBAL_BRANCH_ID).toBeTruthy();
    expect(GLOBAL_BRANCH_ID.trim()).toBe(GLOBAL_BRANCH_ID);
  });

  it('identifies the global tier', () => {
    expect(isGlobalBranch(GLOBAL_BRANCH_ID)).toBe(true);
    expect(isGlobalBranch(DEFAULT_BRANCH_ID)).toBe(false);
  });

  it('keeps the global sentinel distinct from the default branch', () => {
    expect(GLOBAL_BRANCH_ID).not.toBe(DEFAULT_BRANCH_ID);
  });
});
