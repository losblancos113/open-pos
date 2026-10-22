/**
 * Hai tầng chi nhánh của catalog (spec §4.7).
 *
 * Spec viết tầng dùng chung là `branchId: null`, nhưng invariant của M0 (#1) là
 * `branchId` **luôn** là chuỗi không rỗng — `createEnvelope()` ném lỗi khi thiếu, và
 * có test bảo vệ. Cho phép `null` sẽ buộc mọi filter chi nhánh phải hiểu thêm một
 * nhánh ngữ nghĩa "null = mọi chi nhánh", tức là nới lỏng đúng chốt chặn Risk #17.
 *
 * Nên tầng global được biểu diễn bằng một sentinel không rỗng. `'*'` không chứa `:`
 * nên vẫn qua được `requireSegment` của `ids.ts`, và không đụng tên chi nhánh thật.
 */
export const GLOBAL_BRANCH_ID = '*';

/** Chi nhánh mặc định khi app chưa có màn hình quản lý chi nhánh (M6a mới có). */
export const DEFAULT_BRANCH_ID = 'hq';

export function isGlobalBranch(branchId: string): boolean {
  return branchId === GLOBAL_BRANCH_ID;
}
