import type { DocEnvelope } from './envelope';

/**
 * Contract chung cho mọi backend lưu trữ.
 * Memory adapter (test/dev) và PouchDB adapter (thật) đều implement interface này,
 * nên business logic không cần biết đang chạy trên backend nào.
 */
export interface DbAdapter {
  /** Trả về document hoặc null nếu không tồn tại. */
  get(id: string): Promise<DocEnvelope | null>;

  /** Ghi document (tạo mới hoặc cập nhật). Trả về document kèm _rev mới. */
  put(doc: DocEnvelope): Promise<DocEnvelope>;

  /** Liệt kê document, lọc theo branchId khi được cung cấp. */
  allDocs(options?: { branchId?: string }): Promise<DocEnvelope[]>;

  /** Xoá document; cần _rev để phát hiện xung đột ghi. */
  remove(id: string, rev: string): Promise<void>;
}
