import { money } from '../money';
import { allocateEqual } from '../money-allocate';
import type { BillDoc, OrderLineItem, SessionDoc } from './types';
import type { OrderEventDoc } from './events';

// ─── Deep-clone helpers ──────────────────────────────────────────────────────

function cloneLine(line: OrderLineItem): OrderLineItem {
  return {
    ...line,
    modifiers: line.modifiers.map((m) => ({ ...m })),
    comboSelections: line.comboSelections ? [...line.comboSelections] : [],
  };
}

function cloneBill(bill: BillDoc): BillDoc {
  return {
    ...bill,
    lines: bill.lines.map(cloneLine),
    discounts: bill.discounts.map((d) => ({ ...d })),
    surcharges: bill.surcharges.map((s) => ({ ...s })),
    taxLines: bill.taxLines.map((t) => ({ ...t })),
    payments: bill.payments.map((p) => ({ ...p })),
  };
}

// ─── Event builders ───────────────────────────────────────────────────────────

function buildSplitEvent(
  sessionId: string,
  sourceBillId: string,
  targetBillId: string,
  actorId: string,
  deviceId: string,
  movedLineIds: string[],
  createdAt: string
): OrderEventDoc {
  return {
    eventId: `split-${sessionId}-${targetBillId}`,
    type: 'BILL_SPLIT',
    sessionId,
    billId: sourceBillId,
    actorId,
    deviceId,
    payload: { sourceBillId, targetBillId, movedLineIds },
    createdAt,
    schemaVersion: 1,
  };
}

function buildMergeEvent(
  sessionId: string,
  sourceBillIds: string[],
  targetBillId: string,
  actorId: string,
  deviceId: string,
  createdAt: string,
  mergedBill?: BillDoc
): OrderEventDoc {
  return {
    eventId: `merge-${sessionId}-${targetBillId}`,
    type: 'BILL_MERGED',
    sessionId,
    billId: targetBillId,
    actorId,
    deviceId,
    payload: { sourceBillIds, targetBillId, ...(mergedBill ? { mergedBill } : {}) },
    createdAt,
    schemaVersion: 1,
  };
}

function buildTransferEvent(
  sessionId: string,
  fromTableId: string,
  toTableId: string,
  actorId: string,
  deviceId: string,
  reason: string | undefined,
  createdAt: string
): OrderEventDoc {
  return {
    eventId: `transfer-${sessionId}`,
    type: 'TABLE_TRANSFERRED',
    sessionId,
    billId: '',
    actorId,
    deviceId,
    payload: { fromTableId, toTableId, reason },
    createdAt,
    schemaVersion: 1,
  };
}

// ─── Recalculate bill total ───────────────────────────────────────────────────

/**
 * In-place recalculation of a bill's financial totals.
 * Mirrors the reducer's recalculateBill but operates on a clone.
 */
export function recalculateBillInPlace(bill: BillDoc): void {
  const currency = bill.lines[0]?.unitPriceSnapshot?.currency ?? 'VND';

  // Subtotal of active (non-voided) lines
  let subtotalMinor = 0;
  for (const line of bill.lines) {
    if (line.status === 'voided') continue;
    const modifiersDelta = line.modifiers.reduce((s, m) => s + m.priceDelta.minor, 0);
    const comboDelta = line.comboPriceDelta?.minor ?? 0;
    const unitPriceMinor = line.unitPriceSnapshot.minor + modifiersDelta + comboDelta;
    subtotalMinor += unitPriceMinor * line.qty;
  }
  bill.subtotal = money(subtotalMinor, currency);

  // Discounts
  let totalDiscountMinor = 0;
  for (const discount of bill.discounts) {
    if (discount.type === 'percent') {
      if (discount.value > 0 && subtotalMinor > 0 && discount.value < 100) {
        totalDiscountMinor += Math.round((subtotalMinor * discount.value) / 100);
      } else if (discount.value >= 100) {
        totalDiscountMinor += subtotalMinor;
      }
    } else if (discount.type === 'fixed') {
      totalDiscountMinor += Math.max(0, discount.value);
    }
  }
  const discountMinor = Math.min(totalDiscountMinor, subtotalMinor);
  bill.discountTotal = money(discountMinor, currency);

  // Surcharges
  const netMinor = subtotalMinor - discountMinor;
  let totalSurchargeMinor = 0;
  for (const surcharge of bill.surcharges) {
    if (surcharge.ratePercent !== undefined && surcharge.ratePercent > 0) {
      totalSurchargeMinor += Math.round((netMinor * surcharge.ratePercent) / 100);
    }
    if (surcharge.fixedAmount !== undefined) {
      totalSurchargeMinor += Math.max(0, surcharge.fixedAmount.minor);
    }
  }
  bill.surchargeTotal = money(totalSurchargeMinor, currency);

  // Tax (simple: skip complex VAT for split-merge; the reducer handles full VAT)
  // Bill totals are already set; just compute total from components
  const totalMinor = Math.max(0, subtotalMinor - discountMinor + totalSurchargeMinor);
  bill.total = money(totalMinor, currency);

  // Balance remaining
  const paidTotalMinor = bill.payments.reduce((acc, p) => acc + p.amount.minor, 0);
  const balanceMinor = Math.max(0, totalMinor - paidTotalMinor);
  bill.balanceRemaining = money(balanceMinor, currency);

  bill.updatedAt = new Date().toISOString();
}

// ─── splitByItems ─────────────────────────────────────────────────────────────

export interface SplitByItemsResult {
  sourceBill: BillDoc;
  targetBill: BillDoc;
  events: OrderEventDoc[];
}

export function splitByItems(
  sourceBill: BillDoc,
  lineIds: string[],
  actorId: string,
  deviceId: string,
  sessionId: string,
  createdAt: string
): SplitByItemsResult {
  const src = cloneBill(sourceBill);

  // Validate all requested lineIds exist in the source bill
  const sourceLineIds = new Set(src.lines.map((l) => l.lineId));
  for (const lid of lineIds) {
    if (!sourceLineIds.has(lid)) {
      throw new Error(`splitByItems(): lineId "${lid}" not found in source bill`);
    }
  }

  const targetId = `bill:${src.branchId}:split-target`;
  const tgt: BillDoc = {
    _id: targetId,
    branchId: src.branchId,
    sessionId,
    billNumber: src.billNumber,
    paymentRef: src.paymentRef,
    status: 'draft' as const,
    lines: [],
    discounts: [],
    surcharges: [],
    taxLines: [],
    taxMode: src.taxMode,
    taxTotal: money(0, src.total.currency),
    subtotal: money(0, src.total.currency),
    discountTotal: money(0, src.total.currency),
    surchargeTotal: money(0, src.total.currency),
    total: money(0, src.total.currency),
    payments: [],
    balanceRemaining: money(0, src.total.currency),
    createdAt,
    updatedAt: createdAt,
  };

  const movedSet = new Set(lineIds);

  // Collect clones into target first (before mutating source), then void in source
  for (const line of src.lines) {
    if (movedSet.has(line.lineId)) {
      tgt.lines.push(cloneLine(line));
      line.status = 'voided';
      line.voidReason = 'split';
    }
  }

  recalculateBillInPlace(src);
  recalculateBillInPlace(tgt);

  const events: OrderEventDoc[] = [
    buildSplitEvent(sessionId, src._id, tgt._id, actorId, deviceId, lineIds, createdAt),
  ];

  return { sourceBill: src, targetBill: tgt, events };
}

// ─── splitEvenly ──────────────────────────────────────────────────────────────

export interface SplitEvenlyResult {
  sourceBill: BillDoc;
  targetBills: BillDoc[];
  events: OrderEventDoc[];
}

export function splitEvenly(
  sourceBill: BillDoc,
  parts: number,
  actorId: string,
  deviceId: string,
  sessionId: string,
  createdAt: string
): SplitEvenlyResult {
  if (parts < 1) throw new Error(`splitEvenly(): parts must be >= 1, got ${parts}`);
  if (parts === 1) {
    return { sourceBill: cloneBill(sourceBill), targetBills: [], events: [] };
  }

  const allocations = allocateEqual(sourceBill.total, parts);
  const currency = sourceBill.total.currency;
  const src = cloneBill(sourceBill);

  // Create N-1 target bills with exact allocated totals (no recalculation — totals set directly)
  const targetBills: BillDoc[] = [];
  for (let i = 1; i < parts; i++) {
    const alloc = allocations[i]!.minor;
    const targetId = `bill:${src.branchId}:split-evenly-${i}`;
    const tgt: BillDoc = {
      _id: targetId,
      branchId: src.branchId,
      sessionId,
      billNumber: src.billNumber,
      paymentRef: src.paymentRef,
      status: 'draft' as const,
      lines: [],
      discounts: [],
      surcharges: [],
      taxLines: [],
      taxMode: src.taxMode,
      taxTotal: money(0, currency),
      subtotal: money(0, currency),
      discountTotal: money(0, currency),
      surchargeTotal: money(0, currency),
      total: money(alloc, currency),
      payments: [],
      balanceRemaining: money(alloc, currency),
      createdAt,
      updatedAt: createdAt,
    };
    targetBills.push(tgt);
  }

  // Source bill: keep all original lines voided, add a single "split" line for source's allocation
  // This guarantees exact conservation: source.total + sum(targets) == original
  const sourceAlloc = allocations[0]!.minor;
  const targetSum = allocations.slice(1).reduce((a, m) => a + m.minor, 0);
  // Verify invariant: sourceAlloc + targetSum === original total
  if (sourceAlloc + targetSum !== sourceBill.total.minor) {
    throw new Error('splitEvenly(): allocateEqual invariant violated');
  }

  // Void all original lines and add a single split placeholder line for source
  src.lines = sourceBill.lines.map((l) => ({
    ...cloneLine(l),
    status: 'voided' as const,
    voidReason: `split-evenly`,
  }));
  // Add a placeholder line so the source bill has content but its total equals sourceAlloc
  // We set the line's price to sourceAlloc so recalculateBillInPlace produces exact result
  if (sourceAlloc > 0) {
    src.lines.push({
      lineId: `split-evenly-source-${parts}`,
      productId: sourceBill.lines[0]?.productId ?? '',
      nameSnapshot: { vi: '-chia đều (nguồn)', en: '-even split (source)' },
      unitPriceSnapshot: money(sourceAlloc, currency),
      qty: 1,
      modifiers: [],
      status: 'placed' as const,
      addedAt: createdAt,
    });
  }
  recalculateBillInPlace(src);

  // Final guarantee: force source total to be exact (should already be, but belt-and-suspenders)
  src.total = money(sourceAlloc, currency);
  src.balanceRemaining = money(sourceAlloc, currency);

  const events: OrderEventDoc[] = targetBills.map((tgt) =>
    buildSplitEvent(sessionId, src._id, tgt._id, actorId, deviceId, [], createdAt)
  );

  return { sourceBill: src, targetBills, events };
}

/** Raw line total without going through recalculateBill. */
function calculateLineTotalRaw(line: OrderLineItem): number {
  const modifiersDelta = line.modifiers.reduce((s, m) => s + m.priceDelta.minor, 0);
  const comboDelta = line.comboPriceDelta?.minor ?? 0;
  return (line.unitPriceSnapshot.minor + modifiersDelta + comboDelta) * line.qty;
}

// ─── splitBySeat ──────────────────────────────────────────────────────────────

export interface SplitBySeatResult {
  sourceBill: BillDoc;
  targetBills: BillDoc[];
  events: OrderEventDoc[];
}

export function splitBySeat(
  sourceBill: BillDoc,
  actorId: string,
  deviceId: string,
  sessionId: string,
  createdAt: string
): SplitBySeatResult {
  const src = cloneBill(sourceBill);

  // Group placed lines by seat
  const seatGroups = new Map<number | null, OrderLineItem[]>();
  for (const line of src.lines) {
    if (line.status === 'voided') continue;
    const seat = line.seat ?? null;
    const group = seatGroups.get(seat) ?? [];
    group.push(cloneLine(line));
    seatGroups.set(seat, group);
  }

  // Check that at least one line has an explicit seat number (not null/undefined)
  const hasSeat = src.lines.some((l) => l.status !== 'voided' && l.seat !== undefined);
  if (!hasSeat) {
    throw new Error('splitBySeat(): at least one line must have a seat number');
  }

  const targetBills: BillDoc[] = [];
  const events: OrderEventDoc[] = [];
  const currency = src.total.currency;

  // Assign seat numbers to target bills for identification
  let seatIndex = 0;
  for (const [seat, lines] of seatGroups) {
    const seatLabel = seat !== null ? `seat-${seat}` : 'unassigned';
    const targetId = `bill:${src.branchId}:split-seat-${seatIndex}`;
    const tgt: BillDoc = {
      ...cloneBill(src),
      _id: targetId,
      lines,
      discounts: [],
      surcharges: [],
      taxLines: [],
      taxTotal: money(0, currency),
      subtotal: money(0, currency),
      discountTotal: money(0, currency),
      surchargeTotal: money(0, currency),
      payments: [],
      balanceRemaining: money(0, currency),
      status: 'draft' as const,
      billNumber: src.billNumber,
      paymentRef: src.paymentRef,
      sessionId,
      createdAt,
      updatedAt: createdAt,
    };
    recalculateBillInPlace(tgt);
    targetBills.push(tgt);
    events.push(
      buildSplitEvent(sessionId, src._id, tgt._id, actorId, deviceId, lines.map((l) => l.lineId), createdAt)
    );
    seatIndex++;
  }

  // Void all source lines
  for (const line of src.lines) {
    if (line.status !== 'voided') {
      line.status = 'voided';
      line.voidReason = `split-seat`;
    }
  }
  src.subtotal = money(0, currency);
  src.discountTotal = money(0, currency);
  src.surchargeTotal = money(0, currency);
  src.taxTotal = money(0, currency);
  src.total = money(0, currency);
  src.payments = [];
  src.balanceRemaining = money(0, currency);
  src.status = 'draft' as const;

  return { sourceBill: src, targetBills, events };
}

// ─── mergeBills ───────────────────────────────────────────────────────────────

export interface MergeBillsResult {
  mergedBill: BillDoc;
  events: OrderEventDoc[];
}

export function mergeBills(
  sources: BillDoc[],
  actorId: string,
  deviceId: string,
  sessionId: string,
  createdAt: string
): MergeBillsResult {
  if (sources.length < 2) {
    throw new Error(`mergeBills(): need at least 2 source bills, got ${sources.length}`);
  }

  const branchId = sources[0]!.branchId;
  const currency = sources[0]!.total.currency;
  const mergedId = `bill:${branchId}:merged`;

  // Collect all non-voided lines from all sources
  const allLines: OrderLineItem[] = [];
  for (const src of sources) {
    for (const line of src.lines) {
      if (line.status !== 'voided') {
        allLines.push(cloneLine(line));
      }
    }
  }

  const merged: BillDoc = {
    _id: mergedId,
    branchId,
    sessionId,
    billNumber: sources[0]!.billNumber,
    paymentRef: sources[0]!.paymentRef,
    status: 'draft' as const,
    lines: allLines,
    discounts: sources.flatMap((s) => s.discounts),
    surcharges: sources.flatMap((s) => s.surcharges),
    taxLines: [],
    taxMode: sources[0]!.taxMode,
    taxTotal: money(0, currency),
    subtotal: money(0, currency),
    discountTotal: money(0, currency),
    surchargeTotal: money(0, currency),
    total: money(0, currency),
    payments: sources.flatMap((s) => s.payments),
    balanceRemaining: money(0, currency),
    createdAt,
    updatedAt: createdAt,
  };

  recalculateBillInPlace(merged);

  const events: OrderEventDoc[] = [
    buildMergeEvent(sessionId, sources.map((s) => s._id), mergedId, actorId, deviceId, createdAt, merged),
  ];

  return { mergedBill: merged, events };
}

// ─── transferTable ────────────────────────────────────────────────────────────

export interface TransferTableResult {
  session: SessionDoc;
  events: OrderEventDoc[];
}

export function transferTable(
  session: SessionDoc,
  fromTableId: string,
  toTableId: string,
  actorId: string,
  deviceId: string,
  reason: string | undefined,
  createdAt: string
): TransferTableResult {
  if (fromTableId === toTableId) {
    throw new Error(`transferTable(): fromTableId and toTableId must differ`);
  }

  const shortFrom = fromTableId.startsWith('table:') ? fromTableId.split(':').pop()! : fromTableId;
  const nextSession: SessionDoc = {
    ...session,
    tableIds: session.tableIds.filter(
      (t) => t !== fromTableId && t !== shortFrom && !t.endsWith(`:${shortFrom}`)
    ),
  };
  if (!nextSession.tableIds.includes(toTableId)) {
    nextSession.tableIds.push(toTableId);
  }

  const events: OrderEventDoc[] = [
    buildTransferEvent(session._id, fromTableId, toTableId, actorId, deviceId, reason, createdAt),
  ];

  return { session: nextSession, events };
}

// ─── moveLines ────────────────────────────────────────────────────────────────

export interface MoveLinesResult {
  sourceBill: BillDoc;
  targetBill: BillDoc;
  events: OrderEventDoc[];
}

export function moveLines(
  sourceBill: BillDoc,
  lineIds: string[],
  targetBill: BillDoc,
  actorId: string,
  deviceId: string,
  sessionId: string,
  createdAt: string
): MoveLinesResult {
  const src = cloneBill(sourceBill);
  // Clone target bill but start with empty lines (not a full clone)
  const tgt: BillDoc = {
    ...cloneBill(targetBill),
    _id: targetBill._id,
    lines: [...targetBill.lines.map(cloneLine)],
    discounts: [...targetBill.discounts],
    surcharges: [...targetBill.surcharges],
    taxLines: [...targetBill.taxLines],
    payments: [...targetBill.payments],
  };
  const movedSet = new Set(lineIds);

  for (const line of src.lines) {
    if (movedSet.has(line.lineId)) {
      tgt.lines.push(cloneLine(line));
      line.status = 'voided';
      line.voidReason = `moved-to:${tgt._id}`;
    }
  }

  recalculateBillInPlace(src);
  recalculateBillInPlace(tgt);

  const events: OrderEventDoc[] = [
    buildSplitEvent(sessionId, src._id, tgt._id, actorId, deviceId, lineIds, createdAt),
  ];

  return { sourceBill: src, targetBill: tgt, events };
}
