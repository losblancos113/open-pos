import type { CreateMovementInput, WasteReason } from './types';

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

export interface CreateWasteMovementInput {
  readonly branchId: string;
  readonly itemId: string;
  readonly qty: number;
  readonly unit: string;
  readonly wasteReason: WasteReason;
  readonly note?: string;
  readonly actorId: string;
  readonly movementId?: string;
}

export function createWasteMovement(input: CreateWasteMovementInput): CreateMovementInput {
  const branchId = requireNonEmpty(input.branchId, 'branchId');
  const itemId = requireNonEmpty(input.itemId, 'itemId');
  const unit = requireNonEmpty(input.unit, 'unit');
  const actorId = requireNonEmpty(input.actorId, 'actorId');

  if (typeof input.qty !== 'number' || !Number.isFinite(input.qty) || input.qty <= 0) {
    throw new Error('Waste quantity must be positive');
  }

  if (!VALID_WASTE_REASONS.has(input.wasteReason)) {
    throw new Error(`Invalid waste reason: ${input.wasteReason}`);
  }

  return {
    ...(input.movementId ? { movementId: input.movementId.trim() } : {}),
    branchId,
    type: 'waste',
    itemId,
    qtyDelta: -input.qty,
    unit,
    wasteReason: input.wasteReason,
    ...(input.note ? { note: input.note.trim() } : {}),
    actorId,
  };
}
