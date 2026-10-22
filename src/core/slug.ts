/**
 * Sinh `_id` từ tên hiển thị.
 *
 * Tên tiếng Việt không chuyển thẳng sang ASCII bằng `normalize('NFD')` được: `đ`, `ơ`,
 * `ư` **không có phân rã Unicode** (chúng là chữ cái riêng, không phải chữ có dấu), nên
 * phải map tay trước. Bỏ bước đó thì `"Bún đậu"` thành `"bun-au"` (mất hẳn chữ đ) và
 * `"Sữa chua"` thành `"s-a-chua"` — cả hai đều không dùng được làm `_id`.
 */

/** Những chữ cái NFD không phân rã được, phải thay trước khi chuẩn hoá. */
const UNDECOMPOSABLE: Readonly<Record<string, string>> = {
  đ: 'd',
  ơ: 'o',
  ư: 'u',
};

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * `"Phở bò tái"` → `"pho-bo-tai"`.
 *
 * Mọi ký tự không phải `[a-z0-9]` (kể cả dấu câu và emoji) trở thành `-`, các `-` liên
 * tiếp gộp lại, rồi cắt ở hai đầu. Kết quả rỗng thì ném lỗi: một `_id` rỗng là lỗi lập
 * trình, không phải dữ liệu người dùng hợp lệ.
 */
export function slugify(text: string): string {
  const stripped = text
    .replace(/[đơưĐƠƯ]/g, (char) => UNDECOMPOSABLE[char.toLowerCase()] ?? char)
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '');

  const slug = stripped.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  if (slug === '') {
    throw new Error(
      `slugify(): ${JSON.stringify(text)} has no characters usable in an id ` +
        '(need at least one ASCII letter or digit)',
    );
  }

  return slug;
}
