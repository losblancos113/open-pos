import {
  defineConfig,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss';
import type { PresetWind4Theme } from 'unocss';
import { unoTheme } from './src/styles/uno-theme';

/**
 * UnoCSS là lớp style duy nhất của app: control của Vuetify0 không kèm style, ta style
 * bằng utility và chọn trạng thái qua `data-*` mà v0 gắn sẵn (xem AGENTS.md §4.9).
 *
 * `content.filesystem` quét thêm `*.ts`: hằng số class khai báo ngoài template vẫn phải
 * được sinh CSS.
 */
// Chỉ rõ `PresetWind4Theme`: `presetWind4()` trả `Preset<Theme>` của preset. Để
// `defineConfig` tự suy từ `theme: unoTheme` thì nó suy ra type hẹp (mọi khóa đều bắt
// buộc), và dưới `exactOptionalPropertyTypes` preset không gán được vào type hẹp đó.
export default defineConfig<PresetWind4Theme>({
  presets: [presetWind4()],
  theme: unoTheme,
  preflights: [
    {
      getCSS: () => 'dialog { margin: auto; }',
    },
  ],
  variants: [
    {
      // Vuetify0 tự gắn `data-selected` lên control khi ở trong group (Button.Root,
      // Tabs…), nên `selected:(...)` là cách viết ngắn cho `[&[data-selected]]:(...)`.
      // Viết dạng variant có tên còn để `transformerVariantGroup` gộp nhóm được —
      // transformer không xử lý variant chứa dấu ngoặc vuông.
      name: 'selected',
      match: (matcher) => {
        const found = /^selected:(.+)$/.exec(matcher);
        if (!found) return undefined;
        return { matcher: found[1] ?? '', selector: (s) => `${s}[data-selected]` };
      },
    },
  ],
  // Shortcut dùng chung cho mọi component — không tự ghép lại từng nơi. Màu/khoảng cách
  // đều qua token của `uno-theme.ts` (xem AGENTS.md §4.9).
  shortcuts: {
    // Nút: focus-visible có outline rõ ràng; `data-[disabled]` do v0 gắn khi disabled.
    btn: 'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
    'btn-primary': 'btn bg-primary text-primary-contrast hover:bg-primary/90 shadow-2xs',
    'btn-danger': 'btn bg-danger text-primary-contrast hover:bg-danger/90 shadow-2xs',
    'btn-ghost':
      'btn border border-solid border-border bg-surface text-text hover:bg-bg',
    // Ô nhập: class đặt trên `*.Control` (phần tử input thật), không đặt trên Root.
    'field-label': 'mb-1 block text-sm font-medium text-text',
    'field-input':
      'w-full rounded-md border border-solid border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted/60 transition-colors focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary',
    'form-grid': 'grid gap-4',
    'error-text': 'text-sm text-danger',
    'panel-card': 'rounded-lg bg-surface p-4 shadow-sm border border-border/80',
    'table-cell': 'px-3 py-2 text-left',
  },
  transformers: [transformerVariantGroup(), transformerDirectives()],
  content: {
    filesystem: ['index.html', 'src/**/*.{vue,ts}'],
  },
});
