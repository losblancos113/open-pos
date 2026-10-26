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

/** `_id` của counter số thứ tự hóa đơn theo chi nhánh, thiết bị và ngày (M3). */
export function counterDocId(branchId: string, deviceId: string, dateStr: string): string {
  return `counter:${requireSegment(branchId, 'branchId')}:${requireSegment(deviceId, 'deviceId')}:${requireSegment(dateStr, 'dateStr')}`;
}

/** `_id` của một tài khoản người dùng trong hệ thống (M6a). */
export function userDocId(userId: string): string {
  return `user:${requireSegment(userId, 'userId')}`;
}

/** `_id` của một nguyên liệu tồn kho trong hệ thống (M6b). */
export function inventoryItemDocId(itemId: string): string {
  return `inventory_item:${requireSegment(itemId, 'itemId')}`;
}

/** `_id` của một công thức định lượng (recipe / BOM) cho món, biến thể hoặc topping (M6b). */
export function inventoryRecipeDocId(targetType: 'product' | 'variant' | 'modifier', targetId: string): string {
  return `inventory_recipe:${requireSegment(targetType, 'targetType')}:${requireSegment(targetId, 'targetId')}`;
}

/** `_id` của một bản ghi xuất/nhập kho (append-only movement) tại một chi nhánh (M6b). */
export function inventoryMovementDocId(branchId: string, movementId: string): string {
  return `inventory_movement:${requireSegment(branchId, 'branchId')}:${requireSegment(movementId, 'movementId')}`;
}

/** `_id` của một nhà cung cấp nguyên liệu (M6b). */
export function supplierDocId(supplierId: string): string {
  return `supplier:${requireSegment(supplierId, 'supplierId')}`;
}

/** `_id` của một phiếu nhập hàng tại chi nhánh (M6b). */
export function purchaseOrderDocId(branchId: string, poId: string): string {
  return `purchase_order:${requireSegment(branchId, 'branchId')}:${requireSegment(poId, 'poId')}`;
}

/** `_id` của một ca làm việc tại chi nhánh (M6c). */
export function shiftDocId(branchId: string, shiftId: string): string {
  return `shift:${requireSegment(branchId, 'branchId')}:${requireSegment(shiftId, 'shiftId')}`;
}

/** `_id` của một biến động tiền mặt trong ca (cash in / cash drop) (M6c). */
export function shiftCashMovementDocId(branchId: string, movementId: string): string {
  return `shift_cash:${requireSegment(branchId, 'branchId')}:${requireSegment(movementId, 'movementId')}`;
}

/** `_id` của một bản ghi nhật ký kiểm toán (audit log) (M6c). */
export function auditLogDocId(branchId: string, auditId: string): string {
  return `audit_log:${requireSegment(branchId, 'branchId')}:${requireSegment(auditId, 'auditId')}`;
}


