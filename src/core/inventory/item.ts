import { GLOBAL_BRANCH_ID } from '../db/branch';
import { inventoryItemDocId } from '../db/ids';
import type { CreateInventoryItemInput, InventoryItemDoc } from './types';

export const INVENTORY_ITEM_DOC_TYPE = 'inventory_item';

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

export function validateInventoryItem(doc: InventoryItemDoc): void {
  requireNonEmpty(doc.itemId, 'itemId');
  requireNonEmpty(doc.sku, 'sku');
  requireNonEmpty(doc.unit, 'unit');

  if (typeof doc.minThreshold !== 'number' || doc.minThreshold < 0 || !Number.isFinite(doc.minThreshold)) {
    throw new Error('minThreshold must be non-negative');
  }

  if (!doc.costPerUnit || typeof doc.costPerUnit.minor !== 'number') {
    throw new Error('costPerUnit must be valid Money');
  }
}

export function createInventoryItemDoc(input: CreateInventoryItemInput): InventoryItemDoc {
  const itemId = requireNonEmpty(input.itemId, 'itemId');
  const sku = requireNonEmpty(input.sku, 'sku');
  const unit = requireNonEmpty(input.unit, 'unit');
  const minThreshold = input.minThreshold ?? 0;

  if (minThreshold < 0 || !Number.isFinite(minThreshold)) {
    throw new Error('minThreshold must be non-negative');
  }

  const now = input.now || new Date().toISOString();
  const branchId = input.branchId && input.branchId.trim() !== '' ? input.branchId.trim() : GLOBAL_BRANCH_ID;

  const doc: InventoryItemDoc = {
    _id: inventoryItemDocId(itemId),
    branchId,
    docType: INVENTORY_ITEM_DOC_TYPE,
    schemaVersion: 1,
    itemId,
    sku,
    ...(input.barcode ? { barcode: input.barcode.trim() } : {}),
    name: input.name,
    unit,
    costPerUnit: input.costPerUnit,
    minThreshold,
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  };

  validateInventoryItem(doc);
  return doc;
}
