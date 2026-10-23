import type { Money } from '../money';
import type { AreaDoc, TableDoc, TableStatus } from './table';
import type { OrderEventDoc, OrderEventType, SessionEventsDoc } from './events';

export type { AreaDoc, TableDoc, TableStatus };
export type { OrderEventDoc, OrderEventType, SessionEventsDoc };

export interface SessionDoc {
  _id: string; // session:<branchId>:<uuid>
  branchId: string;
  tableIds: string[]; // empty array for Fast Sale / takeaway
  guestCount: number;
  status: 'open' | 'closed' | 'merged';
  openedAt: string;
  openedBy: string; // userId or cashier name
  closedAt?: string;
  billIds: string[];
}

export interface OrderLineModifier {
  groupId: string;
  groupNameSnapshot: string;
  optionId: string;
  optionNameSnapshot: string;
  priceDelta: Money; // integer minor units
}

export interface ComboSelection {
  groupKey: string;
  optionIds: string[]; // selected option IDs
}

export interface OrderLineItem {
  lineId: string; // uuid
  productId: string;
  nameSnapshot: { vi: string; en: string };
  unitPriceSnapshot: Money;
  variantId?: string;
  variantNameSnapshot?: string;
  comboSelections?: ComboSelection[];
  comboPriceDelta?: Money;
  qty: number;
  modifiers: OrderLineModifier[];
  note?: string;
  seat?: number;
  status: 'placed' | 'voided';
  voidReason?: string;
  addedAt: string;
}

export interface OrderDiscount {
  type: 'percent' | 'fixed';
  value: number; // e.g. 10 for 10% or minor units for fixed
  reason?: string;
  appliedBy?: string;
}

export interface OrderSurcharge {
  type: 'service_charge' | 'custom';
  name: string;
  ratePercent?: number; // e.g. 5%
  fixedAmount?: Money;
}

export interface TaxLine {
  rateId: string;
  label: { vi: string; en: string };
  rate: number; // percentage, e.g. 10
  base: Money;
  amount: Money;
}

export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'other';

export interface PaymentEntry {
  paymentId: string;
  method: PaymentMethod;
  amount: Money; // amount credited toward bill
  tendered?: Money; // cash tendered by customer
  change?: Money; // change returned
  ref?: string; // VietQR payment ref (e.g. POSHQT010042) or card transaction ref
  createdAt: string;
}

export interface BillDoc {
  _id: string; // bill:<branchId>:<uuid>
  branchId: string;
  sessionId: string;
  billNumber: string; // e.g. "HQ-T01-20261023-0042"
  paymentRef: string; // e.g. "POSHQT010042" (includes terminal code to prevent collisions)
  status: 'draft' | 'placed' | 'paid' | 'voided';
  lines: OrderLineItem[];
  discounts: OrderDiscount[];
  surcharges: OrderSurcharge[];
  taxMode: 'inclusive' | 'exclusive';
  taxLines: TaxLine[];
  taxTotal: Money;
  subtotal: Money;
  discountTotal: Money;
  surchargeTotal: Money;
  total: Money;
  payments: PaymentEntry[];
  balanceRemaining: Money;
  createdAt: string;
  updatedAt: string;
  printedAt?: string;
  paidAt?: string;
}

export interface OrderAggregateState {
  session: SessionDoc;
  bill: BillDoc;
  tableStatus?: TableStatus;
}
