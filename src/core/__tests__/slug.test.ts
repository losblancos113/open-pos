import { describe, it, expect } from 'vitest';
import { slugify } from '../slug';

describe('slugify', () => {
  it('strips Vietnamese tone marks', () => {
    expect(slugify('Phở bò tái')).toBe('pho-bo-tai');
    expect(slugify('Bánh mì thịt nướng')).toBe('banh-mi-thit-nuong');
  });

  it('maps the letters NFD cannot decompose', () => {
    // đ/ơ/ư không có phân rã Unicode — phải map tay, nếu không sẽ ra "bn ph" hoặc dấu gạch.
    expect(slugify('Bún đậu mắm tôm')).toBe('bun-dau-mam-tom');
    expect(slugify('Sữa chua')).toBe('sua-chua');
    expect(slugify('Đồ uống')).toBe('do-uong');
    expect(slugify('Tôm ướp')).toBe('tom-uop');
  });

  it('collapses separators and trims them', () => {
    expect(slugify('  Cà   phê -- sữa  ')).toBe('ca-phe-sua');
    expect(slugify('Trà sữa (size L)')).toBe('tra-sua-size-l');
  });

  it('keeps digits and lowercase ascii', () => {
    expect(slugify('Combo 2 người')).toBe('combo-2-nguoi');
    expect(slugify('TRÀ ĐÁ')).toBe('tra-da');
  });

  it('throws when nothing usable is left', () => {
    expect(() => slugify('🍜')).toThrow(/slugify/);
    expect(() => slugify('   ')).toThrow(/slugify/);
  });
});
