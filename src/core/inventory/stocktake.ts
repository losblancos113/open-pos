import type { CreateMovementInput, ItemStockBalance } from './types';

export interface PhysicalCountItem {
  readonly itemId: string;
  readonly countedQty: number;
  readonly unit?: string;
}

export function calculateStocktakeAdjustments(
  expectedBalances: Map<string, ItemStockBalance>,
  counts: readonly PhysicalCountItem[],
  branchId: string,
  actorId: string,
  stocktakeId: string,
): readonly CreateMovementInput[] {
  const adjustments: CreateMovementInput[] = [];

  for (const count of counts) {
    if (typeof count.countedQty !== 'number' || !Number.isFinite(count.countedQty)) {
      throw new Error('Counted quantity must be a valid number');
    }

    if (count.countedQty < 0) {
      throw new Error('Counted quantity cannot be negative');
    }

    const expected = expectedBalances.get(count.itemId);
    const expectedQty = expected?.currentQty ?? 0;
    const unit = count.unit || expected?.unit || 'piece';
    const variance = count.countedQty - expectedQty;

    if (variance !== 0) {
      adjustments.push({
        branchId,
        type: 'stocktake',
        itemId: count.itemId,
        qtyDelta: variance,
        unit,
        refId: stocktakeId,
        actorId,
      });
    }
  }

  return adjustments;
}
