import { describe, it, expect, beforeAll } from 'vitest';
import { createGenerator } from 'unocss';
import unoConfig from '../../../uno.config';

/**
 * Test tích hợp cho `uno.config.ts`: chạy generator thật rồi soi CSS sinh ra. Unit test
 * của `uno-theme.ts` chỉ kiểm dữ liệu; ở đây khoá lại thứ chỉ lộ ra sau khi preset và
 * transformer xử lý — biến CSS của theme, variant `selected:`, và shortcut dùng chung.
 */
let css = '';
let shortcutCss = '';

beforeAll(async () => {
  const uno = await createGenerator(unoConfig);
  // Viết từng utility thay vì `selected:(...)`: `generate()` không chạy transformer (chúng
  // chỉ chạy trên file nguồn trong build), nên cú pháp nhóm chỉ được kiểm ở bước build.
  const result = await uno.generate(
    'min-h-screen bg-bg text-text rounded-md text-sm font-sans shadow-sm ' +
      'selected:bg-primary selected:text-primary-contrast selected:shadow-sm',
    { preflights: true },
  );
  css = result.css;

  // Shortcut khai báo trong config được resolve sẵn khi generate — không cần transformer.
  const shortcuts = await uno.generate(
    'btn btn-primary btn-danger btn-ghost field-label field-input form-grid error-text panel-card table-cell',
    { preflights: false },
  );
  shortcutCss = shortcuts.css;
});

describe('uno config', () => {
  it('emits theme variables backed by design tokens', () => {
    expect(css).toContain('--radius-md: 8px');
    expect(css).toContain('--text-sm-fontSize: var(--font-size-sm)');
    expect(css).toContain('--font-sans: var(--font-family-base)');
  });

  it('resolves color utilities to token variables', () => {
    expect(css).toContain('--color-bg');
    expect(css).toContain('--color-primary');
    expect(css).toContain('--color-primary-contrast');
  });

  it('applies the selected: variant to [data-selected]', () => {
    // Vuetify0 chỉ gắn attribute khi đang chọn, nên selector phải là [data-selected].
    // Có thể gộp chung selector list với utility gốc, nên không đòi `{` ngay sau `]`.
    expect(css).toMatch(/\[data-selected\][^{]*\{[^}]*background-color/);
    expect(css).toMatch(/\[data-selected\][^{]*\{[^}]*color:/);
    expect(css).toMatch(/\[data-selected\][^{]*\{[^}]*box-shadow/);
  });

  it('never leaves a dangling paren class from group syntax', () => {
    // Cú pháp nhóm chưa qua transformer sẽ thành `.shadow-sm\)` — dấu hiệu hỏng.
    expect(css).not.toContain('\\)');
  });
});

describe('uno config shortcuts', () => {
  it('resolves every shared shortcut to real CSS', () => {
    // Shortcut được resolve ngay trong generate; thiếu một shortcut thì selector của nó
    // vắng mặt trong CSS — và class trong component thành "hàng không" vô hình.
    const shortcuts = [
      'btn',
      'btn-primary',
      'btn-danger',
      'btn-ghost',
      'field-label',
      'field-input',
      'form-grid',
      'error-text',
      'panel-card',
      'table-cell',
    ] as const;
    for (const name of shortcuts) {
      // UnoCSS escape dấu `:` trong selector; `btn-primary` nằm trong `.btn-primary{...}`.
      expect(shortcutCss, `shortcut ${name} produced no CSS`).toMatch(
        new RegExp(`\\.${name.replace(/[-:]/g, (c) => `\\${c}`)}[{,]`),
      );
    }
  });

  it('binds shortcut colors to design tokens, not literal colors', () => {
    // Shortcut phải đi qua theme token: đổi token là shortcut đổi theo.
    expect(shortcutCss).toContain('var(--color-primary)');
    expect(shortcutCss).toContain('var(--color-danger)');
    expect(shortcutCss).toContain('var(--color-surface)');
  });

  it('styles the disabled state through v0 data attributes', () => {
    // Vuetify0 gắn `data-disabled` khi disabled — shortcut phải phản ứng đúng attr đó.
    expect(shortcutCss).toMatch(/\[data-disabled\][^{]*\{[^}]*cursor:not-allowed/);
  });
});
