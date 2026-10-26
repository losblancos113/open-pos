# M6c — Shifts, Reports & Hardening Design Document

**Date:** 2026-10-26  
**Status:** Approved  
**Module:** `src/core/shift/`, `src/core/reports/`, `src/core/audit/`, `src/core/maintenance/`, `src/features/shift/`, `src/features/reports/`, `src/i18n/`  
**Authority:** Follows `docs/superpowers/specs/2026-10-20-open-pos-design.md` (§4.6, §4.8, §5.4, §6.4, §8, §9.1)

---

## 1. Intent & The Why

Milestone 6c completes the official **v1.0** release of Open POS by bringing together operational accountability, business intelligence, security auditability, and data resilience:
1. **Cash Control & Shift Reconciliation (§4.6):** In hospitality and retail, cash handling is vulnerable to skimming, unrecorded payouts, and counting errors. M6c introduces an explicit shift lifecycle (`openingCash`, `cash_drop`, `cash_in`, `closingCash`, `countedCash`) that deterministically calculates cash variance (`countedCash − expectedCash`).
2. **Actionable Store Reporting & Z-Reports (§4.8):** Store managers and owners need comprehensive end-of-day reports (Z-reports), revenue by product category, hourly sales distributions (peak hour analysis), and payment method breakdowns (Cash, VietQR, Card).
3. **Immutable Audit Trail (§6.4):** Append-only audit records track security-sensitive actions (logins, shift open/close, line voids, custom discounts, cash drops) for compliance and theft prevention.
4. **Data Hardening & Recovery (§8, §10):** Offline POS databases require reliable backup/export and restore capabilities, as well as automatic maintenance jobs (purging expired guest session tokens).

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **G1 (Shift Lifecycle):** Model `ShiftDoc` (`shift:<branchId>:<shiftId>`) with status `open` / `closed`, opening cash, cash transactions, manual cash movements (`cash_in`, `cash_drop`), and closing cash count.
- **G2 (Deterministic Cash Reconciliation):** Compute expected cash:
  $$\text{expectedCash} = \text{openingCash} + \text{cashSales} - \text{cashRefunds} + \text{cashIn} - \text{cashDrops}$$
  $$\text{variance} = \text{countedCash} - \text{expectedCash}$$
- **G3 (Single Active Shift per Terminal):** Guard that a device/terminal cannot open multiple overlapping shifts.
- **G4 (Advanced Store Reports & Z-Report):**
  - End-of-shift Z-Report summarizing sales, taxes, discounts, surcharges, cash drawer movements, and payment breakdown.
  - Category sales breakdown (quantity, net revenue, share %).
  - Hourly sales distribution (00:00–23:00) identifying peak operational hours.
  - Payment method breakdown (Cash, VietQR bank transfer, Card, Other).
  - CSV / print-ready export of report data.
- **G5 (Audit Log Engine):** Append-only `AuditLogDoc` (`audit_log:<branchId>:<auditId>`) recording actor, role, action, target, device, reason, and timestamps.
- **G6 (Maintenance & Hardening):** Full database JSON snapshot backup export and restore utility with integrity validation, plus guest token expiration cleanup.
- **G7 (Vuetify0 Headless UI):**
  - `ShiftModal.vue`: Open shift, Cash In / Drop dialog, Close shift with cash denomination counting and variance display.
  - `StoreReportsModal.vue`: Interactive dashboard with date filtering, tabbed reports (Z-Report, Categories, Hourly, Payments), and CSV export.
  - Header integration in `App.vue` with shift status indicator.
- **G8 (i18n Parity):** 100% key parity across `vi.json` and `en.json`.

### Non-Goals
- **External Accounting Integration:** Direct integration with SAP, QuickBooks, or MISA is out of scope for v1.0 (CSV export covers manual import).
- **Automated Electronic Cash Drawers via USB/Serial:** Opening cash drawers via serial ESC/POS pulses is reserved for v2.0 hardware adapters.

### Anti-Goals
- **Mutable audit logs:** Audit entries must NEVER be editable or deletable.
- **Floating-point money in shifts or reports:** All cash balances, totals, and variances MUST use integer minor units via `Money` functions.

---

## 3. Constraints & Invariants

1. **Mandatory `branchId` (M0 Invariant 4.1):** All shift, audit, and report queries are strictly scoped to the active `branchId`.
2. **Integer Minor Units (M0 Invariant 4.2):** All cash figures, sales aggregates, and variances use `Money`.
3. **Append-Only Auditing:** Audit records are immutable once written.
4. **Idempotent Shift Operations:** Closing an already closed shift returns the existing closed record without recalculating or creating duplicate movements.
5. **Headless UI with Vuetify0 & UnoCSS (M0 Invariants 4.8 & 4.9):** Dialogs, data tables, and form inputs use `@vuetify/v0` primitives styled with token shortcuts (`panel-card`, `btn`, `field-input`).

---

## 4. Data Models & Document Schemas

### 4.1 Document ID Helpers (`src/core/db/ids.ts`)

```ts
shiftDocId(branchId: string, shiftId: string): string
// -> "shift:<branchId>:<shiftId>"

shiftCashMovementDocId(branchId: string, movementId: string): string
// -> "shift_cash:<branchId>:<movementId>"

auditLogDocId(branchId: string, auditId: string): string
// -> "audit_log:<branchId>:<auditId>"
```

### 4.2 Shift Documents (`ShiftDoc`, `ShiftCashMovementDoc`)

```ts
export type ShiftStatus = 'open' | 'closed';

export interface ShiftDoc {
  _id: string; // shift:<branchId>:<shiftId>
  branchId: string;
  docType: 'shift';
  schemaVersion: 1;
  shiftId: string;
  deviceId: string;
  userId: string;
  userName: string;
  status: ShiftStatus;
  openingCash: Money;
  openedAt: string;
  closingCash?: Money;
  countedCash?: Money;
  variance?: Money;
  closedAt?: string;
  closedBy?: string;
  notes?: string;
  _rev?: string;
}

export type ShiftCashMovementType = 'cash_in' | 'cash_drop';

export interface ShiftCashMovementDoc {
  _id: string; // shift_cash:<branchId>:<movementId>
  branchId: string;
  docType: 'shift_cash_movement';
  schemaVersion: 1;
  movementId: string;
  shiftId: string;
  type: ShiftCashMovementType;
  amount: Money;
  reason: string;
  actorId: string;
  createdAt: string;
  _rev?: string;
}
```

### 4.3 Audit Log (`AuditLogDoc`)

```ts
export type AuditAction =
  | 'login_success'
  | 'login_failed'
  | 'shift_open'
  | 'shift_close'
  | 'cash_drop'
  | 'cash_in'
  | 'bill_void'
  | 'line_void'
  | 'discount_applied'
  | 'price_override'
  | 'bill_split'
  | 'bill_merged'
  | 'table_transferred'
  | 'data_backup'
  | 'data_restore';

export interface AuditLogDoc {
  _id: string; // audit_log:<branchId>:<auditId>
  branchId: string;
  docType: 'audit_log';
  schemaVersion: 1;
  auditId: string;
  actorId: string;
  role: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  reason?: string;
  deviceId: string;
  createdAt: string;
  _rev?: string;
}
```

### 4.4 Report Structures

```ts
export interface ZReportSummary {
  branchId: string;
  shiftId?: string;
  periodStart: string;
  periodEnd: string;
  totalBills: number;
  paidBills: number;
  voidedBills: number;
  grossSales: Money;
  discountTotal: Money;
  surchargeTotal: Money;
  taxTotal: Money;
  netSales: Money;
  paymentsByMethod: Record<string, Money>;
  openingCash: Money;
  cashSales: Money;
  cashIn: Money;
  cashDrops: Money;
  expectedCash: Money;
  countedCash?: Money;
  variance?: Money;
}

export interface CategorySalesReport {
  categoryId: string;
  categoryName: string;
  quantitySold: number;
  netRevenue: Money;
  percentageOfTotal: number;
}

export interface HourlySalesReport {
  hour: number; // 0..23
  orderCount: number;
  netRevenue: Money;
}
```

---

## 5. Core Algorithms & Architecture

### 5.1 Shift Reconciliation

When closing a shift, the expected cash in the drawer is calculated by:
1. Finding all paid bills whose payments occurred within $[\text{openedAt}, \text{closedAt}]$ for this branch and terminal.
2. Summing all `payments` with `method === 'cash'`.
3. Summing all manual `cash_in` movements for this `shiftId`.
4. Summing all manual `cash_drop` movements for this `shiftId`.
5. Calculating:
   $$\text{expectedCash} = \text{openingCash} + \text{cashSales} + \text{cashIn} - \text{cashDrops}$$
   $$\text{variance} = \text{countedCash} - \text{expectedCash}$$

### 5.2 Z-Report & Sales Aggregation

The Z-report aggregates all bills settled within a specific shift or date range:
- Classifies items by category to calculate category sales and revenue share.
- Groups paid bills by order creation hour (`0..23`) to produce the hourly peak distribution.
- Breaks down tenders across `cash`, `bank_transfer`, `card`, and other methods.

### 5.3 Backup & Restore

- **Export:** Serializes all documents from `adapter.allDocs()` into a portable JSON snapshot including timestamp, branch metadata, and schema version checksum.
- **Restore:** Validates snapshot structure, checks schema versions, and batch-puts documents back into the database adapter.

---

## 6. User Interface Specification

1. **Shift Management (`ShiftModal.vue`):**
   - Active shift status banner in POS header.
   - If no shift open: prompt for cashier name, device ID, and `openingCash`.
   - If shift open: display running summary (Opening Cash, Cash Sales, Cash Drops, Current Expected Cash).
   - "Cash In / Cash Drop" sub-form with amount and reason.
   - "Close Shift" dialog: prompt for physical `countedCash` count, instantly displays calculated `variance` with visual indicator (green for match/surplus, red for shortage), saves closed shift, and logs audit record.
2. **Advanced Reports (`StoreReportsModal.vue`):**
   - Date range selector (Today, Yesterday, Last 7 Days, Custom).
   - Tab 1: **Báo cáo Z (Z-Report)** with complete financial breakdown.
   - Tab 2: **Doanh thu theo nhóm món (Category Breakdown)** with tabular rankings.
   - Tab 3: **Biểu đồ khung giờ (Hourly Heatmap)** displaying peak rush hours.
   - Tab 4: **Phương thức thanh toán (Payment Methods)**.
   - CSV Export button for instant file download.
