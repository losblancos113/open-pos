/**
 * CSV ở mức RFC 4180, đủ cho người dùng Việt mở bằng **Excel**.
 *
 * Ba chi tiết không phải "cho đẹp" mà là điều kiện để file dùng được:
 *
 * 1. **BOM UTF-8** — Excel trên Windows đọc file không BOM bằng code page hệ thống, nên
 *    "Phở bò" thành "Ph? b?" với cả menu.
 * 2. **CRLF** — Excel và Notepad trên Windows mới là đích thật của file này.
 * 3. **Bọc ô khi cần** — tên món thật có dấu phẩy ("Phở bò, tái"), dấu ngoặc kép, và
 *    đôi khi cả xuống dòng; không bọc thì file lệch cột ngay từ dòng đó.
 *
 * Không hỗ trợ dấu phân cách khác `,` hay dấu nháy đơn kiểu Excel — người dùng nhận
 * đúng định dạng do `formatCsv` sinh ra.
 */

/** BOM UTF-8 — bắt buộc để Excel nhận đúng tiếng Việt. */
export const CSV_BOM = '\uFEFF';

const NEEDS_QUOTING = /[",\r\n]/;

/** Một ô: bọc trong `"` khi chứa `,` `"` `\r` `\n` hoặc space ở đầu/cuối; `"` → `""`. */
export function formatCsvCell(value: string): string {
  const needsQuotes =
    NEEDS_QUOTING.test(value) || value.startsWith(' ') || value.endsWith(' ');

  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** Toàn bộ bảng → chuỗi CSV: BOM + CRLF giữa các dòng, kết thúc bằng CRLF. */
export function formatCsv(rows: readonly (readonly string[])[]): string {
  const lines = rows.map((row) => row.map(formatCsvCell).join(','));
  return `${CSV_BOM}${lines.map((line) => `${line}\r\n`).join('')}`;
}

/**
 * Chuỗi CSV → bảng. Tự bỏ BOM, hiểu `"..."` (kèm `""`), chấp nhận cả CRLF và LF.
 *
 * Ném lỗi khi gặp ô mở `"` mà không đóng — nuốt lỗi ở đây sẽ làm mọi dòng sau lệch cột,
 * và người dùng chỉ phát hiện ra khi menu đã nhập sai.
 */
export function parseCsv(text: string): string[][] {
  const body = text.startsWith(CSV_BOM) ? text.slice(CSV_BOM.length) : text;
  if (body === '') return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  /** Vị trí dòng bắt đầu của ô đang đọc — dùng cho thông báo lỗi. */
  let line = 1;
  let cellStartLine = 1;
  let index = 0;

  const endCell = (): void => {
    row.push(cell);
    cell = '';
    cellStartLine = line;
  };

  const endRow = (): void => {
    endCell();
    rows.push(row);
    row = [];
  };

  while (index < body.length) {
    const char = body[index] as string;

    if (inQuotes) {
      if (char === '"') {
        if (body[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      if (char === '\n') line += 1;
      cell += char;
      index += 1;
      continue;
    }

    if (char === '"' && cell === '') {
      inQuotes = true;
      cellStartLine = line;
      index += 1;
      continue;
    }

    if (char === ',') {
      endCell();
      index += 1;
      continue;
    }

    if (char === '\r' || char === '\n') {
      // CRLF là một lần xuống dòng, không phải hai.
      if (char === '\r' && body[index + 1] === '\n') index += 1;
      index += 1;
      line += 1;
      endRow();
      continue;
    }

    cell += char;
    index += 1;
  }

  if (inQuotes) {
    throw new Error(
      `parseCsv(): unterminated quoted cell starting on line ${cellStartLine} ` +
        '(a missing closing quote would shift every following row)',
    );
  }

  // Dòng cuối không có ký tự xuống dòng vẫn là một dòng; nhưng file kết thúc bằng
  // xuống dòng thì không sinh thêm dòng rỗng.
  if (cell !== '' || row.length > 0) endRow();

  return rows;
}
