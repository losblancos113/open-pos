import { describe, it, expect } from 'vitest';
import { tokens } from '../tokens';
import { unoTheme } from '../uno-theme';

/**
 * `uno-theme.ts` là cầu nối giữa `tokens.ts` (nguồn sự thật) và UnoCSS. Cầu lệch thì lỗi
 * chỉ lộ ra trên giao diện, nên khoá lại bằng test: token nào cũng phải có utility, và
 * mọi tham chiếu `var()` trong theme phải trỏ về một biến CSS có thật trong `tokens.ts`.
 */

/** Gom mọi giá trị chuỗi trong theme để kiểm tra chúng chỉ trỏ về token. */
function collectValues(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string') {
    found.push(value);
  } else if (typeof value === 'object' && value !== null) {
    for (const nested of Object.values(value)) collectValues(nested, found);
  }
  return found;
}

const tokenNames = Object.keys(tokens);
const byPrefix = (prefix: string) => tokenNames.filter((name) => name.startsWith(prefix));
const keysOf = (prefix: string) => byPrefix(prefix).map((name) => name.slice(prefix.length));
const sorted = (names: string[]) => [...names].sort();

describe('uno theme', () => {
  it('maps every color token to a var()-backed utility color', () => {
    for (const name of byPrefix('color-')) {
      expect(unoTheme.colors[name.slice('color-'.length)], name).toBe(`var(--${name})`);
    }
    expect(sorted(Object.keys(unoTheme.colors))).toEqual(sorted(keysOf('color-')));
  });

  it('maps radius tokens to their raw values', () => {
    for (const name of byPrefix('radius-')) {
      expect(unoTheme.radius[name.slice('radius-'.length)], name).toBe(tokens[name]);
    }
    expect(sorted(Object.keys(unoTheme.radius))).toEqual(sorted(keysOf('radius-')));
  });

  it('maps font-size tokens to the preset text scale as fontSize entries', () => {
    // Chuỗi trần không chạy: preset phát `--text-sm-fontSize` rồi `.text-sm` dùng lại biến.
    for (const name of byPrefix('font-size-')) {
      expect(unoTheme.text[name.slice('font-size-'.length)], name).toEqual({
        fontSize: `var(--${name})`,
      });
    }
    expect(sorted(Object.keys(unoTheme.text))).toEqual(sorted(keysOf('font-size-')));
  });

  it('binds the preset default sans stack to the base font token', () => {
    // Preflight của preset phát `font-family: var(--font-sans)`; gắn `--font-sans` về
    // token base thì cả preflight lẫn utility `font-sans` dùng đúng font của app.
    expect(unoTheme.font.sans).toBe('var(--font-family-base)');
  });

  it('never binds radius to the var the preset generates from it', () => {
    // `--radius-md` do CHÍNH preset phát ra từ theme này; bind `var(--radius-md)` vào đây
    // là vòng lặp (`--radius-md: var(--radius-md)`) và `rounded-md` mất bo góc.
    for (const [key, value] of Object.entries(unoTheme.radius)) {
      expect(value, `radius.${key} is a CSS variable cycle`).not.toBe(`var(--radius-${key})`);
    }
  });

  it('references only CSS variables that exist in tokens.ts', () => {
    const references = collectValues(unoTheme).filter((value) => value.startsWith('var('));
    expect(references.length).toBeGreaterThan(0);
    for (const value of references) {
      const name = /^var\(--([a-z0-9-]+)\)$/.exec(value)?.[1];
      expect(name, `theme value is not a token var: ${value}`).toBeDefined();
      expect(tokenNames, `${value} points at a token that does not exist`).toContain(name);
    }
  });

  it('keeps every space-* token on the preset spacing base', () => {
    // Utility `p-3` của preset = 3 × 4px. Token `space-3` phải bằng đúng 12px, nếu không
    // thì markup dùng utility và markup dùng token sẽ lệch nhau.
    const spaceTokens = tokenNames.filter((name) => /^space-\d+$/.test(name));
    expect(spaceTokens.length).toBeGreaterThan(0);
    for (const name of spaceTokens) {
      const step = Number(name.slice('space-'.length));
      expect(tokens[name], name).toBe(`${step * 4}px`);
    }
  });
});
