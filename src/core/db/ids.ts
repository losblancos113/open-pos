function requireSegment(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`);
  }
  if (value.includes(':')) {
    throw new Error(`${name} must not contain ":", got "${value}"`);
  }
  return value;
}

export function branchDocId(branchId: string): string {
  return `branch:${requireSegment(branchId, 'branchId')}`;
}

export function productDocId(productId: string): string {
  return `product:${requireSegment(productId, 'productId')}`;
}

export function productBranchOverrideId(productId: string, branchId: string): string {
  return `product_override:${requireSegment(branchId, 'branchId')}:${requireSegment(productId, 'productId')}`;
}

/** `_id` của một danh mục catalog (tầng global — dùng chung mọi chi nhánh). */
export function categoryDocId(categoryId: string): string {
  return `category:${requireSegment(categoryId, 'categoryId')}`;
}

/** `_id` của một nhóm modifier (topping) — tầng global. */
export function modifierGroupDocId(groupId: string): string {
  return `modifier_group:${requireSegment(groupId, 'groupId')}`;
}

/** `_id` của một combo / set menu — tầng global. */
export function comboDocId(comboId: string): string {
  return `combo:${requireSegment(comboId, 'comboId')}`;
}

/** `_id` của một bảng giá — thuộc một chi nhánh. */
export function priceListDocId(priceListId: string): string {
  return `price_list:${requireSegment(priceListId, 'priceListId')}`;
}

/** `_id` của một type definition trong collection `meta_types`. */
export function typeDocId(typeKey: string): string {
  return `type:${requireSegment(typeKey, 'typeKey')}`;
}

/** `_id` của một record thuộc entity type do người dùng định nghĩa. */
export function recordDocId(typeKey: string, id: string): string {
  return `${requireSegment(typeKey, 'typeKey')}:${requireSegment(id, 'id')}`;
}

/** `_id` của một khu vực trong nhà hàng (M3). */
export function areaDocId(branchId: string, areaId: string): string {
  return `area:${requireSegment(branchId, 'branchId')}:${requireSegment(areaId, 'areaId')}`;
}

/** `_id` của một bàn trong khu vực (M3). */
export function tableDocId(branchId: string, tableId: string): string {
  return `table:${requireSegment(branchId, 'branchId')}:${requireSegment(tableId, 'tableId')}`;
}

/** `_id` của một phiên gọi món / session (M3). */
export function sessionDocId(branchId: string, sessionId: string): string {
  return `session:${requireSegment(branchId, 'branchId')}:${requireSegment(sessionId, 'sessionId')}`;
}

/** `_id` của một hóa đơn / bill (M3). */
export function billDocId(branchId: string, billId: string): string {
  return `bill:${requireSegment(branchId, 'branchId')}:${requireSegment(billId, 'billId')}`;
}

/** `_id` của log sự kiện gọi món / session_events (M3). */
export function sessionEventsDocId(branchId: string, sessionId: string): string {
  return `session_events:${requireSegment(branchId, 'branchId')}:${requireSegment(sessionId, 'sessionId')}`;
}

/** `_id` của cấu hình tài khoản VietQR theo chi nhánh (M3). */
export function bankAccountDocId(branchId: string): string {
  return `bank_account:${requireSegment(branchId, 'branchId')}`;
}

