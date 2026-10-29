import type { DocEnvelope } from './envelope';

/**
 * Contract chung cho mọi backend lưu trữ.
 * Memory adapter (test/dev) và PouchDB adapter (thật) đều implement interface này,
 * nên business logic không cần biết đang chạy trên backend nào.
 */
export interface AllDocsOptions {
  /** Chỉ trả về document thuộc chi nhánh này. Bỏ trống → trả về tất cả. */
  branchId?: string;
  /**
   * Trả thêm document của tầng global (`GLOBAL_BRANCH_ID`) — catalog dùng chung mọi
   * chi nhánh (§4.7). Chỉ có nghĩa khi `branchId` được đặt; không có `branchId` thì
   * vốn đã trả về tất cả nên cờ này không đổi kết quả.
   */
  includeGlobal?: boolean;
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

  /**
   * Đăng ký lắng nghe thay đổi dữ liệu (real-time changes / mutations).
   * Trả về hàm huỷ đăng ký (unsubscribe).
   */
  subscribe?(listener: () => void): () => void;
}
