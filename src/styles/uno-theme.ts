import { tokens } from './tokens';

/**
 * Theme UnoCSS suy trực tiếp từ `tokens.ts` — nguồn sự thật duy nhất (AGENTS.md §4.7).
 * Thêm token là utility xuất hiện theo, không phải sửa file này.
 *
 * Tên khóa theo thang của `preset-wind4`: `colors`, `radius`, `text` (cỡ chữ), `font`
 * (họ chữ) — khác `borderRadius`/`fontSize`/`fontFamily` của preset-wind3.
 */
const ref = (name: string): string => `var(--${name})`;

function collect<T>(prefix: string, map: (name: string, value: string) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [name, value] of Object.entries(tokens)) {
    if (name.startsWith(prefix)) out[name.slice(prefix.length)] = map(name, value);
  }
  return out;
}

export const unoTheme = {
  // `color-primary` → `bg-primary` / `text-primary` / `border-primary`. Giá trị vẫn là
  // biến CSS nên đổi token là utility đổi theo, và preset vẫn cộng được opacity
  // (`bg-primary/50`) nhờ bọc trong `color-mix()`.
  colors: collect('color-', (name) => ref(name)),
  // Bám thẳng giá trị token (`8px`) chứ không bám `var(--radius-md)`: preset tự phát
  // `--radius-md` từ chính theme này, trỏ về nó là vòng lặp biến CSS.
  radius: collect('radius-', (_name, value) => value),
  // Phải là object `{ fontSize }`: preset phát `--text-sm-fontSize` rồi `.text-sm` dùng
  // lại biến đó; truyền chuỗi trần thì preset không phát biến và `text-sm` mất cỡ chữ.
  text: collect('font-size-', (name) => ({ fontSize: ref(name) })),
  // Preflight của preset đặt `html { font-family: var(--font-sans) }`; gắn `--font-sans`
  // về token base để cả trang dùng đúng font mà không cần CSS riêng.
  font: { sans: ref('font-family-base') },
};
