# M3: Order Engine & POS Terminal — Technical Design Document

**Date:** 2026-10-23  
**Status:** In Review (Brainstorming Phase)  
**Parent Specification:** `docs/superpowers/specs/2026-10-20-open-pos-design.md` (v0.5, Requirements R2, R8, R9, §4.3, §4.4, §4.6, §5.3, §7.1)  
**Milestone:** M3 (Checkpoint: "Bán hàng thật được trên 1 máy" — Real-world sales ready on a single device)

---

## 1. Intent & Why

Open POS has completed:
- **M0 (Foundation & Skeleton):** Local hub sync, PouchDB adapter layer, integer money calculations, strict `branchId` envelope.
- **M1 (Type Registry):** Dynamic form definitions, field validator registry, formula engine, lazy migration.
- **M2 (Catalog & Menu):** Products, size variants, modifier groups, combos, multi-tier pricing resolution, CSV import/export, and Catalog Admin UI.

**Why M3 now:**  
Catalog and pricing models cannot generate revenue without an order lifecycle and payment settlement. M3 delivers the commercial core of Open POS:
1. Allowing floor staff and cashiers to manage tables and create orders.
2. Managing real-time line items with variants and toppings.
3. Handling bill totals with lossless discounts, surcharges, and split payments.
4. Generating offline VietQR codes according to EMVCo/NAPAS standards without depending on bank APIs.
5. Printing receipts (80mm/58mm format) to complete transactions offline.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Deterministic Event Sourcing:** Implement `order_events` append-only logs for order line additions, voiding, notes, discounts, and payments. Materialize `SessionDoc` and `BillDoc` state through pure TypeScript reducers (`src/core/order/`).
- **Offline Numbering Invariant:** Generate collision-free bill numbers (`{branchCode}-{terminalCode}-{YYYYMMDD}-{seq}`) and clean VietQR payment references (`POS{branchCode}{billSeq}`) without network coordination.
- **Pure Offline VietQR Generator:** Build an in-engine EMVCo/NAPAS TLV binary/hex string builder with CRC-16/CCITT-FALSE checksum and offline SVG QR code renderer. Zero bank API calls or cloud dependencies.
- **Lossless Split Payment & Financials:** Multi-method payments (Cash, VietQR bank transfer, Card, Other). Track tendered cash and change accurately using integer minor units. Preserve allocation invariants during partial splits.
- **Dual-Mode POS Terminal UI:** A single, responsive Vuetify0 + UnoCSS interface (`src/features/pos/`) supporting both:
  1. **Table Service Mode:** Interactive floor plan with area filtering, table statuses (empty, occupied, bill-printed), duration timers, and table sessions.
  2. **Fast Sale (Counter) Mode:** Direct-to-cart ordering and quick payment without requiring floor plan allocation.
- **Printable Bill Template:** Responsive 80mm/58mm thermal receipt layout with store details, itemized lines with toppings/notes, tax/service breakdowns, payment breakdown, and optional VietQR code, printable via standard browser/OS print triggers.

### Non-Goals (Reserved for Later Milestones)
- **Table Split/Merge Invariants (M4):** Splitting bills evenly across seats, moving lines between bills, merging sessions/tables. (M3 provides single-bill-per-session creation and payment; M4 expands to multi-bill seat splits).
- **Kitchen Display System (KDS) & Waiter Mobile Approval (M5):** Real-time WebSocket ticket dispatch to separate kitchen screens and customer QR ordering approval queues.
- **Bank Webhook Auto-Confirm (Post-v1):** Real-time automated transaction polling or bank notification webhooks. In M3 (per Spec §2 R9 and Decision 5), VietQR displays on-screen and staff manually verifies money in their banking app before clicking "Đã nhận tiền".
- **E-Invoice (Hóa đơn điện tử) Integration:** Explicitly out of scope for v1.

### Anti-Goals
- **No Direct Mutating of Order State:** Never execute `db.put(billDoc)` with arbitrary edits without an associated `OrderEventDoc`. The state must always be replayable and verifiable from the event log.
- **No Floating-Point Math:** Never use standard JavaScript numbers (`+`, `-`, `*`, `/`) for order subtotals, discounts, tax, or change. All calculations must use `Money` minor units.
- **No External CDN or Network Calls for QR/Receipts:** QR rendering and receipt templates must not fetch external scripts or web fonts, maintaining 100% offline functionality.

---

## 3. Constraints & Invariants

From `AGENTS.md` and master design specification:
1. **Domain Logic Isolation (`AGENTS.md` §2, §4.5):** All order reduction, pricing calculations, numbering generation, and VietQR EMVCo serialization must live in `src/core/order/`, `src/core/qr/`, and `src/core/payment/` with **zero imports from Vue or PouchDB**.
2. **Mandatory `branchId` (`AGENTS.md` §4.1):** Every document (`area`, `table`, `session`, `bill`, `order_event`, `payment`) must carry a valid `branchId`.
3. **Integer Minor Units (`AGENTS.md` §4.2):** Money is strictly represented as integer minor units (`VND` exponent 0, `USD` exponent 2).
4. **Deterministic Allocation (`AGENTS.md` §4.3):** Split bills and percentage-based discounts must use largest-remainder allocation so that parts sum exactly to the total with no lost units.
5. **ID Conventions (`AGENTS.md` §4.4):**
   - Area: `area:<branchId>:<uuid>`
   - Table: `table:<branchId>:<uuid>`
   - Session: `session:<branchId>:<uuid>`
   - Bill: `bill:<branchId>:<uuid>`
   - Order Event: `event:<branchId>:<uuid>`
6. **UI Primitives (`AGENTS.md` §4.8, §4.9):** Headless `@vuetify/v0` components styled with UnoCSS design token utilities (`bg-primary`, `field-input`, `btn`, `btn-primary`, `panel-card`).
7. **i18n Parity (`AGENTS.md` §4.6):** All user-facing strings must be added simultaneously to both `src/i18n/vi.json` and `src/i18n/en.json`.

---

## 4. Approaches Considered

### Approach A: Integrated Delivery — Pure Event Engine + Unified POS Terminal (Selected)
Build the pure TypeScript reducer engine, VietQR payload generator, and financial math first with exhaustive unit and property tests, followed immediately by the Vuetify0 + UnoCSS POS Terminal UI (Floor Plan, Catalog Grid, Ticket Panel, Payment Modal, and Bill Print).
- **Why chosen:** Aligns with M1 and M2 project conventions. Delivers a complete, demonstrable milestone ready for cashier validation. Ensures state projections map directly to actual UI interaction needs.

### Approach B: Two-Phase Delivery (M3a Headless Engine, M3b UI)
Split M3 into two distinct implementation plans: first headless core logic, then UI screens in a later milestone.
- **Why rejected:** Leaves the sales workflow unprovable until M3b is finished. Testing POS workflows against headless stubs without seeing layout constraints risks premature abstractions that must be reworked once UI requirements surface.

---

## 5. Technical Specifications

### 5.1 Data Model & Schemas

#### 1. Areas and Tables (`src/core/order/table.ts`)
```ts
export interface AreaDoc {
  _id: string; // area:<branchId>:<slug>
  branchId: string;
  name: string; // e.g. "Tầng 1", "Sân vườn"
  sortOrder: number;
  createdAt: string;
}

export interface TableDoc {
  _id: string; // table:<branchId>:<slug>
  branchId: string;
  areaId: string;
  code: string; // e.g. "B01", "T02"
  name: string; // e.g. "Bàn 1"
  capacity: number;
  shape?: 'round' | 'square' | 'rectangle';
  sortOrder: number;
  createdAt: string;
}
```

#### 2. Table Sessions & Bills (`src/core/order/types.ts`)
```ts
export type TableStatus = 'empty' | 'occupied' | 'bill_printed';

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
```

#### 3. Append-Only Order Events & Session Event Log (`src/core/order/events.ts`)
```ts
export type OrderEventType =
  | 'SESSION_OPENED'
  | 'SESSION_CLOSED'
  | 'ORDER_PLACED'
  | 'LINE_ADDED'
  | 'LINE_QTY_CHANGED'
  | 'LINE_NOTE_CHANGED'
  | 'LINE_VOIDED'
  | 'DISCOUNT_APPLIED'
  | 'DISCOUNT_REMOVED'
  | 'SURCHARGE_APPLIED'
  | 'SURCHARGE_REMOVED'
  | 'BILL_PRINTED'
  | 'BILL_VOIDED'
  | 'PAYMENT_ADDED'
  | 'PAYMENT_VOIDED'
  | 'BILL_CLOSED';

export interface OrderEventDoc<T = any> {
  eventId: string; // uuid
  type: OrderEventType;
  sessionId: string;
  billId: string;
  actorId: string;
  deviceId: string;
  payload: T;
  createdAt: string;
  schemaVersion: 1;
}

/**
 * Spec §13.3: Events are partitioned per session into a single doc
 * to reduce document count ~8x and avoid replication explosion.
 */
export interface SessionEventsDoc {
  _id: string; // session_events:<branchId>:<sessionId>
  branchId: string;
  sessionId: string;
  events: OrderEventDoc[];
  snapshot?: {
    session: SessionDoc;
    bill: BillDoc;
  };
  closedAt?: string;
  updatedAt: string;
}

#### 4. VietQR Bank Account Configuration (`src/core/qr/bank-account.ts`)
```ts
export interface BankAccountDoc {
  _id: string; // bank_account:<branchId>
  branchId: string;
  bankBin: string; // e.g. "970422" (MB), "970436" (VCB), "970415" (VietinBank)
  bankName: string; // e.g. "MBBank", "Vietcombank"
  accountNumber: string;
  accountName: string; // e.g. "NGUYEN VAN A" (uppercase, unaccented)
  updatedAt: string;
}
```
```

---

### 5.2 Deterministic Order Reducer (`src/core/order/reducer.ts`)

State projection must be pure and reproducible:
```ts
export interface OrderAggregateState {
  session: SessionDoc;
  bill: BillDoc;
}

export function reduceOrderEvents(
  initial: OrderAggregateState | null,
  events: OrderEventDoc[]
): OrderAggregateState;
```
1. **Total & Tax Calculation Rules:**
   - Active lines: lines with `status !== 'voided'`.
   - Line Total: `(unitPriceSnapshot + sum(modifier.priceDelta) + (comboPriceDelta ?? 0)) * qty`.
   - `subtotal = sum(activeLineTotals)`.
   - `discountTotal`: If percent, `allocate(subtotal, [discount.value, 100 - discount.value])[0]`; if fixed, `min(fixedAmount, subtotal)`.
   - `surchargeTotal`: Percentage of `(subtotal - discountTotal)` or fixed amount.
   - **Tax Calculation (Spec §13.5):**
     - If `taxMode === 'inclusive'` (default): `taxAmount = subtotal - round(subtotal / (1 + rate / 100))`. The tax is itemized for reporting but does not increase `total`.
     - If `taxMode === 'exclusive'`: `taxAmount = round((subtotal - discountTotal) * (rate / 100))`. The tax is added to `total`.
     - Rounding across tax lines preserves integer minor units via largest-remainder allocation.
   - `total = subtotal - discountTotal + surchargeTotal + (taxMode === 'exclusive' ? taxTotal : 0)`.
   - `paidTotal = sum(payments.map(p => p.amount))`.
   - `balanceRemaining = max(0, total - paidTotal)`.
2. **Event Sourcing Partitioning & Compaction (Spec §13.3):**
   - Events are stored within a `SessionEventsDoc` (`session_events:<branchId>:<sessionId>`) with an `events[]` array. On concurrent writes, 409 conflict resolution unions the arrays by `eventId`.
   - When a bill is paid and closed (`BILL_CLOSED`), the projected `BillDoc` and `SessionDoc` are persisted as materialized documents in PouchDB, and a `snapshot` is attached to `SessionEventsDoc`.

---

### 5.3 Offline Numbering Generator (`src/core/order/numbering.ts`)

Per Spec §5.3:
- **Bill Number:** `{branchCode}-{terminalCode}-{YYYYMMDD}-{seq}`  
  Example: `HQ-T01-20261023-0042`
- **Payment Ref (`paymentRef`):** `POS{branchCode}{terminalCode}{seq}`  
  Example: `POSHQT010042`  
  *Rule:* Must be alphanumeric only, uppercase, no accents or special symbols, max 20 chars (e.g. `POSHQT010042` is 12 chars). Adding `terminalCode` prevents cross-terminal reference collisions when multiple devices operate offline.
- **Sequence Storage:** Stored in a local device checkpoint document `counter:<branchId>:<deviceId>:<YYYYMMDD>`.

---

### 5.4 VietQR Engine (`src/core/qr/vietqr.ts`)

Builds EMVCo / NAPAS 247 dynamic payment payload offline:
- **NAPAS Service Code:** `QRIBFTTA`
- **Merchant GUID:** `A000000727`
- **Tag 38 (NAPAS Account Info):**
  - Subtag 00: GUID (`A000000727`)
  - Subtag 01: Beneficiary info (Subtag 00: Bank BIN, Subtag 01: Account Number)
  - Subtag 02: `QRIBFTTA`
- **Tag 53:** `704` (VND currency)
- **Tag 54:** Amount in integer VND minor units (e.g. `135000`)
- **Tag 58:** `VN`
- **Tag 59:** Beneficiary Account Name from `BankAccountDoc.accountName` (e.g. `NGUYEN VAN A`, uppercase, unaccented)
- **Tag 62:** Additional Data (Subtag 08: Bill Reference, e.g. `POSHQT010042`)
- **Tag 63:** CRC16-CCITT checksum (polynomial 0x1021, init 0xFFFF) over all preceding characters.
- **Offline QR Matrix Renderer:** Pure TypeScript matrix builder emitting an SVG string. Zero network requests, 100% offline.
- **Bank Data Resolution:** Reads `bank_account:<branchId>` from the local database. If not yet configured, the payment modal guides staff to open Bank Settings before accepting VietQR payments.

---

### 5.5 POS Terminal UI Architecture (`src/features/pos/`)

#### Runtime Device & Cashier Context
To enable offline sales without requiring M5's full PIN/server login:
- Local device profile stored in `localStorage` (`branchId: 'hq'`, `branchCode: 'HQ'`, `terminalCode: 'T01'`, `deviceId: 'dev-t01'`, `cashierName: 'Thu ngân 1'`).
- A quick dropdown in the POS top header allows switching active terminal code or cashier name on the fly.
- A quick settings button in the POS header opens `BankSettingsModal.vue` to configure the branch receiving bank account.

```
+-------------------------------------------------------------------------+
| [Branch: HQ] [Term: T01] [Mode: Floor | Fast Sale] [Bank Settings] [14:30]|
+------------------------------------+------------------------------------+
|  LEFT PANEL (60%):                 |  RIGHT PANEL (40%): Ticket / Cart  |
|                                    |                                    |
|  [Mode: Floor Plan]                |  Table: B01 (Session #0042)        |
|  [Tầng 1] [Sân vườn]               |  Guests: [ - 2 + ]                 |
|  +-------+ +-------+ +-------+     |  --------------------------------- |
|  | B01   | | B02   | | B03   |     |  1x Phở bò (Tô lớn, +Trứng) 79.000 |
|  | 79.000| | Trống | | Đã in |     |     note: "ít hành"                |
|  +-------+ +-------+ +-------+     |  1x Trà đá                   5.000 |
|                                    |  --------------------------------- |
|  [Mode: Fast Sale / Catalog Picker]|  Tạm tính:                  84.000 |
|  [Phở] [Cơm] [Nước giải khát]      |  Giảm giá (Voucher):       -10.000 |
|  +---------------+ +-------------+ |  Tổng cộng:                 74.000 |
|  | Phở bò 65.000 | | Trà đá 5.000| |  --------------------------------- |
|  +---------------+ +-------------+ |  [In tạm tính]      [Thanh toán]   |
+------------------------------------+------------------------------------+
```

#### Modals & Drawers:
1. **Modifier & Variant Dialog (`ModifierPickerModal.vue`):** Triggered when clicking a product with options. Radio group for sizes, checkboxes for toppings with maxSelect constraints (validated via M2 logic).
2. **Combo Picker Dialog (`ComboPickerModal.vue`):** Triggered when clicking a combo item. Allows selecting 1-of-N items for each combo group, computing deltas in real-time matching M2 `combo.ts` constraints.
3. **VietQR Bank Settings Modal (`BankSettingsModal.vue`):**
   - Quick selector for top Vietnamese banks (VCB, MB, Techcombank, BIDV, VPBank, ACB) with automatic BIN mapping, plus custom BIN input.
   - Account number and unaccented account name inputs.
   - Saves to `bank_account:<branchId>`.
4. **Payment Modal (`PaymentModal.vue`):**
   - Quick Cash keypad with common denominations (50k, 100k, 200k, 500k, Exact).
   - VietQR tab with full-screen QR display, copyable account info, and "Đã nhận tiền" confirmation.
   - Split Payment capability (records partial payment, updates remaining balance).
5. **Bill Receipt Print (`ReceiptModal.vue` / `@media print`):** Formatted for 80mm thermal receipt printer.

---

## 6. What's Left to the Builder

The builder (plan creator and implementer) has discretion over:
- Concrete component file naming within `src/features/pos/` (e.g. `FloorPlanGrid.vue`, `PosCatalogPicker.vue`, `TicketSummary.vue`).
- SVG QR rendering implementation details (e.g., using a lightweight, zero-dependency offline QR matrix helper vs canvas).
- Sample test fixture data for areas and tables in initial demo seed.
- Visual token choices within the established `uno-theme.ts` utilities.
