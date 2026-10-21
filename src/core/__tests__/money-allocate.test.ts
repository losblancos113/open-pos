import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { money } from '../money';
import { allocate, allocateEqual } from '../money-allocate';

describe('allocate()', () => {
  it('splits 100.000 into 3 equal parts with remainder going to the earliest seats', () => {
    const parts = allocate(money(100_000, 'VND'), [1, 1, 1]);
    expect(parts.map((p) => p.minor)).toEqual([33_334, 33_333, 33_333]);
  });

  it('always returns a sum exactly equal to the total', () => {
    const parts = allocate(money(100_000, 'VND'), [1, 1, 1]);
    const sum = parts.reduce((acc, p) => acc + p.minor, 0);
    expect(sum).toBe(100_000);
  });

  it('splits proportionally to weights', () => {
    const parts = allocate(money(100_000, 'VND'), [2, 1]);
    expect(parts.map((p) => p.minor)).toEqual([66_667, 33_333]);
  });

  it('handles zero total', () => {
    expect(allocate(money(0, 'VND'), [1, 1]).map((p) => p.minor)).toEqual([0, 0]);
  });

  it('falls back to equal split when all weights are zero', () => {
    expect(allocate(money(100_000, 'VND'), [0, 0]).map((p) => p.minor)).toEqual([50_000, 50_000]);
  });

  it('returns empty array for empty weights', () => {
    expect(allocate(money(100_000, 'VND'), [])).toEqual([]);
  });

  it('rejects negative or non-finite weights', () => {
    expect(() => allocate(money(100_000, 'VND'), [1, -1])).toThrow(/weight/i);
    expect(() => allocate(money(100_000, 'VND'), [1, Number.NaN])).toThrow(/weight/i);
  });

  it('preserves sign for negative totals (refunds)', () => {
    const parts = allocate(money(-100_000, 'VND'), [1, 1, 1]);
    expect(parts.map((p) => p.minor)).toEqual([-33_334, -33_333, -33_333]);
    expect(parts.reduce((acc, p) => acc + p.minor, 0)).toBe(-100_000);
  });
});

describe('allocateEqual()', () => {
  it('splits evenly across N parts', () => {
    expect(allocateEqual(money(100_000, 'VND'), 3).map((p) => p.minor)).toEqual([
      33_334, 33_333, 33_333,
    ]);
  });
});

describe('allocate() property: sum is always exactly the total', () => {
  it('holds for arbitrary totals and weights', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 12 }),
        (totalMinor, weights) => {
          const total = money(totalMinor, 'VND');
          const parts = allocate(total, weights);
          const sum = parts.reduce((acc, p) => acc + p.minor, 0);
          expect(sum).toBe(totalMinor);
          expect(parts).toHaveLength(weights.length);
        },
      ),
      { numRuns: 500 },
    );
  });
});
