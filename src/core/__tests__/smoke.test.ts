import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs vitest and executes TypeScript', () => {
    const value: number = 1 + 1;
    expect(value).toBe(2);
  });
});
