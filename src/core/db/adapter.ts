import type { DocEnvelope } from './envelope';

/**
 * Contract chung cho mọi backend lưu trữ.
 * Memory adapter (test/dev) và PouchDB adapter (thật) đều implement interface này,
 * nên business logic không cần biết đang chạy trên backend nào.
 */
export interface AllDocsOptions {
  /** Chỉ trả về document thuộc chi nhánh này. Bỏ trống → trả về tất cả. */
  branchId?: string;
}

export interface DbAdapter {
  /** Trả về document hoặc null nếu không tồn tại (kể cả document đã soft-delete). */
  get(id: string): Promise<DocEnvelope | null>;

  /** Ghi document (tạo mới hoặc cập nhật). Trả về document kèm _rev mới. */
  put(doc: DocEnvelope): Promise<DocEnvelope>;

  /** Liệt kê document, lọc theo branchId khi được cung cấp. Thứ tự không được quy định. */
  allDocs(options?: AllDocsOptions): Promise<DocEnvelope[]>;

  /** Xoá document; cần _rev để phát hiện xung đột ghi. */
  remove(id: string, rev: string): Promise<void>;
}
