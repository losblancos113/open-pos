import { inventoryMovementDocId } from '../db/ids';
import { mulInt } from '../money';
import type {
  CreateMovementInput,
  InventoryItemDoc,
  InventoryMovementDoc,
  ItemStockBalance,
  MovementType,
  WasteReason,
} from './types';

export const INVENTORY_MOVEMENT_DOC_TYPE = 'inventory_movement';

const VALID_MOVEMENT_TYPES: ReadonlySet<string> = new Set([
  'purchase',
  'sale_deduction',
  'waste',
  'adjust',
  'stocktake',
]);

const VALID_WASTE_REASONS: ReadonlySet<string> = new Set([
  'expired',
  'damaged',
  'burnt_mistake',
  'quality_reject',
  'staff_meal',
  'other',
]);

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

export function createMovementDoc(input: CreateMovementInput): InventoryMovementDoc {
  const branchId = requireNonEmpty(input.branchId, 'branchId');
  if (branchId.includes(':')) {
    throw new Error(`branchId must not contain ":", got "${branchId}"`);
  }

  if (!VALID_MOVEMENT_TYPES.has(input.type)) {
    throw new Error(`Invalid movement type: ${input.type}`);
  }

  const itemId = requireNonEmpty(input.itemId, 'itemId');
  if (itemId.includes(':')) {
    throw new Error(`itemId must not contain ":", got "${itemId}"`);
  }

  if (typeof input.qtyDelta !== 'number' || !Number.isFinite(input.qtyDelta)) {
    throw new Error('qtyDelta must be a finite number');
  }

  const unit = requireNonEmpty(input.unit, 'unit');
  const actorId = requireNonEmpty(input.actorId, 'actorId');
  const movementId = input.movementId?.trim() || crypto.randomUUID();
  const createdAt = input.createdAt || new Date().toISOString();

  let wasteReason: WasteReason | undefined = undefined;
  if (input.wasteReason) {
    if (!VALID_WASTE_REASONS.has(input.wasteReason)) {
      throw new Error(`Invalid waste reason: ${input.wasteReason}`);
    }
    wasteReason = input.wasteReason;
  }

  let totalCost = input.totalCost;
  if (!totalCost && input.unitCost) {
    totalCost = mulInt(input.unitCost, Math.round(Math.abs(input.qtyDelta)));
  }

  const doc: InventoryMovementDoc = {
    _id: inventoryMovementDocId(branchId, movementId),
    branchId,
    docType: INVENTORY_MOVEMENT_DOC_TYPE,
    schemaVersion: 1,
    movementId,
    type: input.type as MovementType,
    itemId,
    qtyDelta: input.qtyDelta,
    unit,
    ...(input.unitCost ? { unitCost: input.unitCost } : {}),
    ...(totalCost ? { totalCost } : {}),
    ...(input.refId ? { refId: input.refId.trim() } : {}),
    ...(wasteReason ? { wasteReason } : {}),
    ...(input.note ? { note: input.note.trim() } : {}),
    actorId,
    createdAt,
  };

  return doc;
}

export function computeStockBalances(
  items: readonly InventoryItemDoc[],
  movements: readonly InventoryMovementDoc[],
): Map<string, ItemStockBalance> {
  const map = new Map<string, ItemStockBalance>();

  for (const item of items) {
    map.set(item.itemId, {
      itemId: item.itemId,
      currentQty: 0,
      unit: item.unit,
      minThreshold: item.minThreshold,
      isLowStock: item.minThreshold >= 0,
    });
  }

  for (const m of movements) {
    const bal = map.get(m.itemId);
    if (bal) {
      bal.currentQty += m.qtyDelta;
      if (!bal.lastMovementAt || m.createdAt > bal.lastMovementAt) {
        bal.lastMovementAt = m.createdAt;
      }
    }
  }

  for (const bal of map.values()) {
    bal.isLowStock = bal.currentQty <= bal.minThreshold;
  }

  return map;
}
