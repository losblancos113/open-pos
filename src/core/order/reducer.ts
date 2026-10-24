import {
  type Money,
  money,
  mulRational,
} from '../money';
import { allocate } from '../money-allocate';
import type {
  SessionDoc,
  BillDoc,
  OrderLineItem,
  OrderDiscount,
  OrderSurcharge,
  PaymentEntry,
  OrderAggregateState,
  TableStatus,
} from './types';
import type { OrderEventDoc } from './events';

export type { OrderAggregateState };

/**
 * Calculates line total:
 * `(unitPriceSnapshot + sum(modifiers.priceDelta) + (comboPriceDelta ?? 0)) * qty`
 */
export function calculateLineTotal(line: OrderLineItem): Money {
  const currency = line.unitPriceSnapshot.currency;
  const modifiersDelta = line.modifiers.reduce((sum, mod) => sum + mod.priceDelta.minor, 0);
  const comboDelta = line.comboPriceDelta?.minor ?? 0;
  const unitPriceMinor = line.unitPriceSnapshot.minor + modifiersDelta + comboDelta;
  const lineTotalMinor = unitPriceMinor * line.qty;
  return money(lineTotalMinor, currency);
}

/**
 * Helper to clone an order line without violating exactOptionalPropertyTypes.
 */
function cloneOrderLine(l: OrderLineItem): OrderLineItem {
  const lineCopy: OrderLineItem = {
    ...l,
    modifiers: l.modifiers.map((m) => ({ ...m })),
  };
  if (l.comboSelections !== undefined) {
    lineCopy.comboSelections = [...l.comboSelections];
  }
  return lineCopy;
}

/**
 * Recalculates all financial totals (subtotal, discounts, surcharges, VAT, total, balance remaining)
 * deterministically using minor integer units and largest-remainder allocation.
 */
export function recalculateBill(bill: BillDoc): BillDoc {
  const currency =
    bill.lines[0]?.unitPriceSnapshot?.currency ??
    bill.total?.currency ??
    'VND';

  // 1. Subtotal of active (non-voided) lines
  const activeLines = bill.lines.filter((line) => line.status !== 'voided');
  let subtotalMinor = 0;
  for (const line of activeLines) {
    const lineTotal = calculateLineTotal(line);
    subtotalMinor += lineTotal.minor;
  }
  bill.subtotal = money(subtotalMinor, currency);

  // 2. Discounts
  let totalDiscountMinor = 0;
  for (const discount of bill.discounts) {
    if (discount.type === 'percent') {
      if (discount.value > 0 && subtotalMinor > 0) {
        if (discount.value >= 100) {
          totalDiscountMinor += subtotalMinor;
        } else {
          const [allocatedDisc] = allocate(bill.subtotal, [discount.value, 100 - discount.value]);
          totalDiscountMinor += allocatedDisc?.minor ?? 0;
        }
      }
    } else if (discount.type === 'fixed') {
      totalDiscountMinor += Math.max(0, discount.value);
    }
  }
  const discountMinor = Math.min(totalDiscountMinor, subtotalMinor);
  bill.discountTotal = money(discountMinor, currency);

  // 3. Surcharges on net amount (subtotal - discountTotal)
  const netMinor = subtotalMinor - discountMinor;
  const netMoney = money(netMinor, currency);
  let totalSurchargeMinor = 0;
  for (const surcharge of bill.surcharges) {
    if (surcharge.ratePercent !== undefined && surcharge.ratePercent > 0) {
      if (netMinor > 0) {
        if (surcharge.ratePercent <= 100) {
          const [allocatedSurch] = allocate(netMoney, [surcharge.ratePercent, 100 - surcharge.ratePercent]);
          totalSurchargeMinor += allocatedSurch?.minor ?? 0;
        } else {
          totalSurchargeMinor += mulRational(netMoney, Math.round(surcharge.ratePercent * 100), 10000).minor;
        }
      }
    }
    if (surcharge.fixedAmount !== undefined) {
      totalSurchargeMinor += Math.max(0, surcharge.fixedAmount.minor);
    }
  }
  bill.surchargeTotal = money(totalSurchargeMinor, currency);

  // 4. Tax Calculation (Spec §13.5 & §5.2)
  if (bill.taxLines.length === 0) {
    bill.taxTotal = money(0, currency);
  } else if (bill.taxMode === 'inclusive') {
    // Inclusive VAT: taxAmount = subtotal - round(subtotal / (1 + rate / 100))
    // Does not increase total charged
    const baseMinor = subtotalMinor;
    const baseMoney = money(baseMinor, currency);

    if (bill.taxLines.length === 1) {
      const line = bill.taxLines[0]!;
      const preTax = Math.round((baseMinor * 100) / (100 + line.rate));
      const taxAmount = Math.max(0, baseMinor - preTax);
      line.base = baseMoney;
      line.amount = money(taxAmount, currency);
      bill.taxTotal = money(taxAmount, currency);
    } else {
      const weights = bill.taxLines.map((t) => (t.rate > 0 ? t.rate / (100 + t.rate) : 0));
      const sumRates = bill.taxLines.reduce((acc, t) => acc + t.rate, 0);
      const preTax = Math.round((baseMinor * 100) / (100 + sumRates));
      const targetTaxMinor = Math.max(0, baseMinor - preTax);

      const hasWeights = weights.some((w) => w > 0);
      const allocated =
        hasWeights && targetTaxMinor > 0
          ? allocate(money(targetTaxMinor, currency), weights)
          : bill.taxLines.map(() => money(0, currency));

      for (let i = 0; i < bill.taxLines.length; i++) {
        const line = bill.taxLines[i]!;
        line.base = baseMoney;
        line.amount = allocated[i] ?? money(0, currency);
      }
      bill.taxTotal = money(targetTaxMinor, currency);
    }
  } else {
    // Exclusive VAT: taxAmount = round((subtotal - discountTotal) * (rate / 100))
    // Adds to total
    const baseMinor = netMinor;
    const baseMoney = money(baseMinor, currency);

    if (bill.taxLines.length === 1) {
      const line = bill.taxLines[0]!;
      const taxAmount = Math.max(0, Math.round((baseMinor * line.rate) / 100));
      line.base = baseMoney;
      line.amount = money(taxAmount, currency);
      bill.taxTotal = money(taxAmount, currency);
    } else {
      const weights = bill.taxLines.map((t) => Math.max(0, t.rate));
      const sumRates = weights.reduce((acc, r) => acc + r, 0);
      const targetTaxMinor = Math.max(0, Math.round((baseMinor * sumRates) / 100));

      const hasWeights = weights.some((w) => w > 0);
      const allocated =
        hasWeights && targetTaxMinor > 0
          ? allocate(money(targetTaxMinor, currency), weights)
          : bill.taxLines.map(() => money(0, currency));

      for (let i = 0; i < bill.taxLines.length; i++) {
        const line = bill.taxLines[i]!;
        line.base = baseMoney;
        line.amount = allocated[i] ?? money(0, currency);
      }
      bill.taxTotal = money(targetTaxMinor, currency);
    }
  }

  // 5. Total
  const taxToAdd = bill.taxMode === 'exclusive' ? bill.taxTotal.minor : 0;
  const totalMinor = Math.max(0, subtotalMinor - discountMinor + bill.surchargeTotal.minor + taxToAdd);
  bill.total = money(totalMinor, currency);

  // 6. Balance Remaining
  const paidTotalMinor = bill.payments.reduce((acc, p) => acc + p.amount.minor, 0);
  const balanceMinor = Math.max(0, totalMinor - paidTotalMinor);
  bill.balanceRemaining = money(balanceMinor, currency);

  // 7. Status updates based on balance and payments
  if (bill.status !== 'voided') {
    if (balanceMinor === 0 && bill.payments.length > 0) {
      bill.status = 'paid';
      if (!bill.paidAt) {
        const lastPayment = bill.payments[bill.payments.length - 1];
        if (lastPayment?.createdAt) {
          bill.paidAt = lastPayment.createdAt;
        }
      }
    } else if (balanceMinor > 0 && bill.status === 'paid') {
      bill.status = 'placed';
      delete bill.paidAt;
    }
  }

  return bill;
}

/**
 * Creates the initial order aggregate state, ensuring all financial fields
 * are properly computed and deep cloned.
 */
export function createInitialOrderState(session: SessionDoc, bill: BillDoc): OrderAggregateState {
  const nextSession: SessionDoc = {
    ...session,
    tableIds: [...session.tableIds],
    billIds: [...session.billIds],
  };

  const clonedBill: BillDoc = {
    ...bill,
    lines: bill.lines ? bill.lines.map(cloneOrderLine) : [],
    discounts: bill.discounts ? bill.discounts.map((d) => ({ ...d })) : [],
    surcharges: bill.surcharges ? bill.surcharges.map((s) => ({ ...s })) : [],
    taxLines: bill.taxLines ? bill.taxLines.map((t) => ({ ...t })) : [],
    payments: bill.payments ? bill.payments.map((p) => ({ ...p })) : [],
  };

  const nextBill = recalculateBill(clonedBill);
  const tableStatus: TableStatus = nextBill.printedAt
    ? 'bill_printed'
    : nextSession.status === 'open'
      ? 'occupied'
      : 'empty';

  return {
    session: nextSession,
    bill: nextBill,
    tableStatus,
  };
}

/**
 * Applies a single order event immutably to the aggregate state, returning a new state.
 */
export function applyOrderEvent(state: OrderAggregateState, event: OrderEventDoc): OrderAggregateState {
  const nextSession: SessionDoc = {
    ...state.session,
    tableIds: [...state.session.tableIds],
    billIds: [...state.session.billIds],
  };

  const nextBill: BillDoc = {
    ...state.bill,
    lines: state.bill.lines.map(cloneOrderLine),
    discounts: state.bill.discounts.map((d) => ({ ...d })),
    surcharges: state.bill.surcharges.map((s) => ({ ...s })),
    taxLines: state.bill.taxLines.map((t) => ({ ...t })),
    payments: state.bill.payments.map((p) => ({ ...p })),
  };

  const payload = event.payload ?? {};

  switch (event.type) {
    case 'SESSION_OPENED': {
      nextSession.status = 'open';
      if (Array.isArray(payload.tableIds)) {
        nextSession.tableIds = [...payload.tableIds];
      }
      if (typeof payload.guestCount === 'number') {
        nextSession.guestCount = payload.guestCount;
      }
      if (typeof payload.openedBy === 'string') {
        nextSession.openedBy = payload.openedBy;
      }
      if (!nextSession.openedAt) {
        nextSession.openedAt = event.createdAt;
      }
      break;
    }

    case 'SESSION_CLOSED': {
      nextSession.status = 'closed';
      nextSession.closedAt = event.createdAt;
      break;
    }

    case 'ORDER_PLACED': {
      if (nextBill.status === 'draft') {
        nextBill.status = 'placed';
      }
      nextBill.updatedAt = event.createdAt;
      break;
    }

    case 'LINE_ADDED': {
      const newLine: OrderLineItem = {
        lineId: payload.lineId,
        productId: payload.productId,
        nameSnapshot: payload.nameSnapshot,
        unitPriceSnapshot: payload.unitPriceSnapshot,
        qty: payload.qty,
        modifiers: Array.isArray(payload.modifiers)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? payload.modifiers.map((m: any) => ({ ...m }))
          : [],
        status: 'placed',
        addedAt: payload.addedAt ?? event.createdAt,
      };
      if (payload.variantId !== undefined) {
        newLine.variantId = payload.variantId;
      }
      if (payload.variantNameSnapshot !== undefined) {
        newLine.variantNameSnapshot = payload.variantNameSnapshot;
      }
      if (Array.isArray(payload.comboSelections)) {
        newLine.comboSelections = [...payload.comboSelections];
      }
      if (payload.comboPriceDelta !== undefined) {
        newLine.comboPriceDelta = payload.comboPriceDelta;
      }
      if (payload.note !== undefined) {
        newLine.note = payload.note;
      }
      if (payload.seat !== undefined) {
        newLine.seat = payload.seat;
      }
      nextBill.lines.push(newLine);
      nextBill.updatedAt = event.createdAt;
      break;
    }

    case 'LINE_QTY_CHANGED': {
      const target = nextBill.lines.find((l) => l.lineId === payload.lineId);
      if (target) {
        const qty = payload.qty ?? payload.newQty;
        if (typeof qty === 'number') {
          target.qty = qty;
        }
      }
      nextBill.updatedAt = event.createdAt;
      break;
    }

    case 'LINE_NOTE_CHANGED': {
      const target = nextBill.lines.find((l) => l.lineId === payload.lineId);
      if (target) {
        if (payload.note !== undefined) {
          target.note = payload.note;
        } else {
          delete target.note;
        }
      }
      nextBill.updatedAt = event.createdAt;
      break;
    }

    case 'LINE_VOIDED': {
      const target = nextBill.lines.find((l) => l.lineId === payload.lineId);
      if (target) {
        target.status = 'voided';
        const voidReason = payload.reason ?? payload.voidReason;
        if (voidReason !== undefined) {
          target.voidReason = voidReason;
        }
      }
      nextBill.updatedAt = event.createdAt;
      break;
    }

    case 'DISCOUNT_APPLIED': {
      const discount: OrderDiscount = payload.discount ?? payload;
      nextBill.discounts.push({ ...discount });
      nextBill.updatedAt = event.createdAt;
      break;
    }

    case 'DISCOUNT_REMOVED': {
      if (typeof payload.index === 'number') {
        nextBill.discounts.splice(payload.index, 1);
      } else if (payload.reason) {
        nextBill.discounts = nextBill.discounts.filter((d) => d.reason !== payload.reason);
      } else if (payload.type) {
        nextBill.discounts = nextBill.discounts.filter((d) => d.type !== payload.type);
      } else {
        nextBill.discounts.pop();
      }
      nextBill.updatedAt = event.createdAt;
      break;
    }

    case 'SURCHARGE_APPLIED': {
      const surcharge: OrderSurcharge = payload.surcharge ?? payload;
      nextBill.surcharges.push({ ...surcharge });
      nextBill.updatedAt = event.createdAt;
      break;
    }

    case 'SURCHARGE_REMOVED': {
      if (typeof payload.index === 'number') {
        nextBill.surcharges.splice(payload.index, 1);
      } else if (payload.name) {
        nextBill.surcharges = nextBill.surcharges.filter((s) => s.name !== payload.name);
      } else {
        nextBill.surcharges.pop();
      }
      nextBill.updatedAt = event.createdAt;
      break;
    }

    case 'BILL_PRINTED': {
      nextBill.printedAt = payload.printedAt ?? event.createdAt;
      nextBill.updatedAt = event.createdAt;
      break;
    }

    case 'BILL_VOIDED': {
      nextBill.status = 'voided';
      nextBill.updatedAt = event.createdAt;
      break;
    }

    case 'PAYMENT_ADDED': {
      const payment: PaymentEntry = payload.payment ?? payload;
      nextBill.payments.push({ ...payment });
      if (nextBill.status === 'draft') {
        nextBill.status = 'placed';
      }
      nextBill.updatedAt = event.createdAt;
      break;
    }

    case 'PAYMENT_VOIDED': {
      nextBill.payments = nextBill.payments.filter((p) => p.paymentId !== payload.paymentId);
      nextBill.updatedAt = event.createdAt;
      break;
    }

    case 'BILL_CLOSED': {
      nextBill.updatedAt = event.createdAt;
      if (nextBill.balanceRemaining.minor === 0 && nextBill.status !== 'voided') {
        nextBill.status = 'paid';
        if (!nextBill.paidAt) {
          nextBill.paidAt = event.createdAt;
        }
      }
      nextSession.status = 'closed';
      nextSession.closedAt = event.createdAt;
      break;
    }

    case 'BILL_SPLIT': {
      // Void selected lines in the current bill
      const movedLineIds = new Set<string>(payload.movedLineIds ?? []);
      for (const line of nextBill.lines) {
        if (movedLineIds.has(line.lineId)) {
          line.status = 'voided';
          line.voidReason = 'split';
        }
      }
      nextBill.updatedAt = event.createdAt;
      break;
    }

    case 'BILL_MERGED': {
      // Mark the current bill as voided — it has been merged into another
      nextBill.status = 'voided';
      nextBill.updatedAt = event.createdAt;
      break;
    }

    case 'TABLE_TRANSFERRED': {
      const fromTableId = payload.fromTableId as string;
      const toTableId = payload.toTableId as string;
      nextSession.tableIds = nextSession.tableIds.filter((t) => t !== fromTableId);
      if (!nextSession.tableIds.includes(toTableId)) {
        nextSession.tableIds.push(toTableId);
      }
      break;
    }

    default:
      break;
  }

  // Recalculate bill financial fields
  recalculateBill(nextBill);

  // Update table status
  let tableStatus: TableStatus;
  if (event.type === 'BILL_PRINTED') {
    tableStatus = 'bill_printed';
  } else if (
    event.type === 'BILL_CLOSED' ||
    event.type === 'SESSION_CLOSED' ||
    event.type === 'BILL_VOIDED'
  ) {
    tableStatus = 'empty';
  } else {
    tableStatus = nextBill.printedAt
      ? 'bill_printed'
      : nextSession.status === 'open'
        ? 'occupied'
        : 'empty';
  }

  return {
    session: nextSession,
    bill: nextBill,
    tableStatus,
  };
}

/**
 * Replays an array of order events from an initial state.
 */
export function reduceOrderEvents(
  initial: OrderAggregateState,
  events: OrderEventDoc[]
): OrderAggregateState {
  return events.reduce((currentState, event) => applyOrderEvent(currentState, event), initial);
}
