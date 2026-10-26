# M6c — Shifts, Reports & Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build shift lifecycle & cash drawer reconciliation, advanced store analytics (Z-report, category sales, peak hour heatmap, payment breakdown), append-only audit logging, database backup/restore, and Vuetify0 operator dialogs for the v1.0 release.

**Architecture:**
- Shifts (`ShiftDoc`) and cash drawer movements (`ShiftCashMovementDoc`) are stored through `DbAdapter` scoped by `branchId`.
- Cash variance is calculated deterministically: $\text{expectedCash} = \text{openingCash} + \text{cashSales} - \text{cashRefunds} + \text{cashIn} - \text{cashDrops}$, $\text{variance} = \text{countedCash} - \text{expectedCash}$.
- Audit logs (`AuditLogDoc`) are immutable, append-only logs for security-critical operations.
- Advanced reports aggregate bills, category sales, payment methods, and hourly distributions with CSV export.
- Hardening provides portable database JSON snapshot backup/restore and expired guest token cleanup.
- Interactive dialogs are built with Vuetify0 headless primitives styled with UnoCSS design token shortcuts.

**Tech Stack:** Vue 3 Composition API, TypeScript strict, PouchDB via `DbAdapter`, UnoCSS (`presetWind4`), Vuetify0 (`@vuetify/v0`).

**Spec:** `docs/superpowers/specs/2026-10-26-m6c-shifts-reports-hardening-design.md`

## Global Constraints

- **Mandatory `branchId` (M0 Invariant 4.1):** Every document envelope must contain `branchId`. Global operations use `GLOBAL_BRANCH_ID = '*'`. Shifts and audit logs must carry the active branch's ID.
- **Integer minor units for money (M0 Invariant 4.2):** All cash figures, variances, sales totals, and taxes use `Money` minor units. Never use float arithmetic.
- **Append-only audit log:** Audit records are strictly append-only and cannot be modified or deleted.
- **Single active shift per device:** A terminal cannot open multiple concurrent shifts.
- **Headless UI:** Interactive UI built with `@vuetify/v0` primitives (`Dialog`, `DataTable`, `Button`, `Select`, `Input`) styled exclusively with design token shortcuts (`btn`, `panel-card`, `field-input`).
- **Pure domain logic in `src/core/`:** Domain files must not import Vue, PouchDB, or Tauri APIs.
- **i18n Parity:** Every key added to `src/i18n/vi.json` must have an exact counterpart in `src/i18n/en.json`.

## Review Focus

1. **Deterministic Cash Variance:** When physical counted cash differs from calculated expected cash, variance is calculated as signed `Money` without sign flipping. (Tested in Task 2)
2. **Shift Re-closing Idempotency:** Invoking close on an already closed shift returns the existing closed record without re-calculating or emitting duplicate movements. (Tested in Task 3)
3. **Hourly Distribution Range:** The peak hours heatmap covers all 24 hours ($0..23$) cleanly even for hours with 0 sales. (Tested in Task 5)
4. **Backup Integrity Validation:** Restoring an invalid JSON or empty backup throws a descriptive error and never corrupts existing adapter state. (Tested in Task 7)
5. **Exact Optional Property Types:** All TypeScript models and Vue components conform to `exactOptionalPropertyTypes: true` without dangling `undefined`. (Tested in Tasks 1, 8, 9, 10)

---

### Task 1: Document ID Helpers & Core Schemas

**Files:**
- Modify: `src/core/db/ids.ts`
- Create: `src/core/shift/types.ts`
- Create: `src/core/audit/types.ts`
- Test: `src/core/shift/__tests__/types.test.ts`

**Interfaces:**
- Produces:
  - `shiftDocId(branchId: string, shiftId: string): string` in `src/core/db/ids.ts`
  - `shiftCashMovementDocId(branchId: string, movementId: string): string` in `src/core/db/ids.ts`
  - `auditLogDocId(branchId: string, auditId: string): string` in `src/core/db/ids.ts`
  - Types in `src/core/shift/types.ts`: `ShiftDoc`, `ShiftCashMovementDoc`, `ShiftStatus`, `ShiftCashMovementType`, `OpenShiftInput`, `CloseShiftInput`
  - Types in `src/core/audit/types.ts`: `AuditLogDoc`, `AuditAction`, `CreateAuditLogInput`

- [ ] **Step 1: Write failing tests for ID helpers and schemas**

```ts
// src/core/shift/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import { shiftDocId, shiftCashMovementDocId, auditLogDocId } from '../../db/ids';

describe('Shift and Audit ID helpers', () => {
  it('formats shiftDocId and cashMovementDocId correctly', () => {
    expect(shiftDocId('hq', 'sh_01')).toBe('shift:hq:sh_01');
    expect(shiftCashMovementDocId('dist1', 'csh_01')).toBe('shift_cash:dist1:csh_01');
    expect(auditLogDocId('hq', 'aud_01')).toBe('audit_log:hq:aud_01');
  });

  it('rejects empty strings or segments with colons', () => {
    expect(() => shiftDocId('', 's1')).toThrow('branchId must be a non-empty string');
    expect(() => shiftDocId('hq:1', 's1')).toThrow('branchId must not contain ":"');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/core/shift/__tests__/types.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement ID helpers and types**

Add helpers in `src/core/db/ids.ts` and define full interfaces in `src/core/shift/types.ts` and `src/core/audit/types.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/core/shift/__tests__/types.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/db/ids.ts src/core/shift/types.ts src/core/audit/types.ts src/core/shift/__tests__/types.test.ts
git commit -m "feat(shift): add ID helpers and types for shifts and audit log"
```

---

### Task 2: Shift Domain Logic & Variance Engine

**Files:**
- Create: `src/core/shift/shift-engine.ts`
- Test: `src/core/shift/__tests__/shift-engine.test.ts`

**Interfaces:**
- Consumes: `ShiftDoc`, `ShiftCashMovementDoc`, `Money` from `src/core/money.ts`
- Produces:
  - `calculateShiftVariance(openingCash: Money, cashSales: Money, cashRefunds: Money, cashIn: Money, cashDrops: Money, countedCash: Money): { expectedCash: Money; variance: Money }`
  - `createShiftDoc(input: OpenShiftInput): ShiftDoc`
  - `createCashMovementDoc(input: CreateCashMovementInput): ShiftCashMovementDoc`

- [ ] **Step 1: Write failing tests for shift variance engine**

```ts
// src/core/shift/__tests__/shift-engine.test.ts
import { describe, it, expect } from 'vitest';
import { calculateShiftVariance, createShiftDoc, createCashMovementDoc } from '../shift-engine';
import { money } from '../../money';

describe('Shift Engine & Variance Calculation', () => {
  it('calculates expected cash and exact variance (surplus and shortage)', () => {
    const opening = money(1000000, 'VND');
    const sales = money(3500000, 'VND');
    const refunds = money(200000, 'VND');
    const cashIn = money(500000, 'VND');
    const cashDrops = money(2000000, 'VND');
    // expected = 1,000,000 + 3,500,000 - 200,000 + 500,000 - 2,000,000 = 2,800,000

    // Exact match
    const exact = calculateShiftVariance(opening, sales, refunds, cashIn, cashDrops, money(2800000, 'VND'));
    expect(exact.expectedCash.minor).toBe(2800000);
    expect(exact.variance.minor).toBe(0);

    // Shortage of 50,000
    const shortage = calculateShiftVariance(opening, sales, refunds, cashIn, cashDrops, money(2750000, 'VND'));
    expect(shortage.variance.minor).toBe(-50000);

    // Surplus of 100,000
    const surplus = calculateShiftVariance(opening, sales, refunds, cashIn, cashDrops, money(2900000, 'VND'));
    expect(surplus.variance.minor).toBe(100000);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/core/shift/__tests__/shift-engine.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `shift-engine.ts`**

Use `add` and `sub` from `src/core/money.ts` to compute expected cash and variance deterministically.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/core/shift/__tests__/shift-engine.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/shift/shift-engine.ts src/core/shift/__tests__/shift-engine.test.ts
git commit -m "feat(shift): implement shift engine and deterministic cash variance calculation"
```

---

### Task 3: Shift Repository & Persistence via DbAdapter

**Files:**
- Create: `src/core/shift/shift-repository.ts`
- Test: `src/core/shift/__tests__/shift-repository.test.ts`

**Interfaces:**
- Consumes: `DbAdapter`, `ShiftDoc`, `ShiftCashMovementDoc`, `BillDoc`
- Produces: `createShiftRepository(adapter: DbAdapter)` with:
  - `openShift(input: OpenShiftInput): Promise<ShiftDoc>`
  - `getActiveShift(branchId: string, deviceId: string): Promise<ShiftDoc | null>`
  - `recordCashMovement(input: CreateCashMovementInput): Promise<ShiftCashMovementDoc>`
  - `getCashMovements(branchId: string, shiftId: string): Promise<ShiftCashMovementDoc[]>`
  - `closeShift(input: CloseShiftInput): Promise<ShiftDoc>`
  - `getShifts(branchId: string): Promise<ShiftDoc[]>`

- [ ] **Step 1: Write failing tests for shift repository**

```ts
// src/core/shift/__tests__/shift-repository.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createShiftRepository } from '../shift-repository';
import { money } from '../../money';

describe('Shift Repository', () => {
  let repo: ReturnType<typeof createShiftRepository>;

  beforeEach(async () => {
    const adapter = await createMemoryAdapter();
    repo = createShiftRepository(adapter);
  });

  it('opens a shift, guards against overlapping active shifts, and records cash movements', async () => {
    const shift = await repo.openShift({
      branchId: 'hq',
      deviceId: 'term_01',
      userId: 'usr_01',
      userName: 'Cashier Alice',
      openingCash: money(500000, 'VND'),
    });

    expect(shift.status).toBe('open');

    // Duplicate active shift should throw
    await expect(
      repo.openShift({
        branchId: 'hq',
        deviceId: 'term_01',
        userId: 'usr_02',
        userName: 'Bob',
        openingCash: money(500000, 'VND'),
      })
    ).rejects.toThrow('An active shift is already open on this device');

    await repo.recordCashMovement({
      branchId: 'hq',
      shiftId: shift.shiftId,
      type: 'cash_drop',
      amount: money(200000, 'VND'),
      reason: 'Gửi bớt tiền mặt vào két sắt',
      actorId: 'usr_01',
    });

    const movements = await repo.getCashMovements('hq', shift.shiftId);
    expect(movements).toHaveLength(1);
    expect(movements[0]?.type).toBe('cash_drop');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- src/core/shift/__tests__/shift-repository.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `src/core/shift/shift-repository.ts`**

Implement CRUD operations, active shift retrieval, cash movement querying, and `closeShift` calculating actual cash sales from settled bills during the shift.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/core/shift/__tests__/shift-repository.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/shift/shift-repository.ts src/core/shift/__tests__/shift-repository.test.ts
git commit -m "feat(shift): implement shift repository with active shift guards and persistence"
```

---

### Task 4: Audit Logger Domain Service

**Files:**
- Create: `src/core/audit/audit-logger.ts`
- Test: `src/core/audit/__tests__/audit-logger.test.ts`

**Interfaces:**
- Consumes: `DbAdapter`, `AuditLogDoc`, `CreateAuditLogInput`
- Produces: `createAuditLogger(adapter: DbAdapter)` with:
  - `log(input: CreateAuditLogInput): Promise<AuditLogDoc>`
  - `getLogs(branchId: string, filter?: { action?: AuditAction; actorId?: string }): Promise<AuditLogDoc[]>`

- [ ] **Step 1: Write failing tests for audit logger**

```ts
// src/core/audit/__tests__/audit-logger.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createAuditLogger } from '../audit-logger';

describe('Audit Logger', () => {
  let logger: ReturnType<typeof createAuditLogger>;

  beforeEach(async () => {
    const adapter = await createMemoryAdapter();
    logger = createAuditLogger(adapter);
  });

  it('records append-only immutable audit logs', async () => {
    const entry = await logger.log({
      branchId: 'hq',
      actorId: 'usr_01',
      role: 'cashier',
      action: 'shift_open',
      targetType: 'shift',
      targetId: 'sh_01',
      deviceId: 'term_01',
    });

    expect(entry.docType).toBe('audit_log');
    expect(entry._id).toMatch(/^audit_log:hq:/);

    const logs = await logger.getLogs('hq');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.action).toBe('shift_open');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/core/audit/__tests__/audit-logger.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `src/core/audit/audit-logger.ts`**

Enforce required fields, chronological ordering, and branch scoping.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/core/audit/__tests__/audit-logger.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/audit/audit-logger.ts src/core/audit/__tests__/audit-logger.test.ts
git commit -m "feat(audit): implement append-only audit logger domain service"
```

---

### Task 5: Advanced Store Reports Engine (Z-Report, Category & Hourly Sales)

**Files:**
- Create: `src/core/reports/store-reports.ts`
- Test: `src/core/reports/__tests__/store-reports.test.ts`

**Interfaces:**
- Consumes: `DbAdapter`, `BillDoc`, `ShiftDoc`, `ShiftCashMovementDoc`, `Money`
- Produces:
  - `generateZReport(adapter: DbAdapter, branchId: string, options: { shiftId?: string; startDate?: string; endDate?: string }): Promise<ZReportSummary>`
  - `generateCategorySalesReport(adapter: DbAdapter, branchId: string, options?: { startDate?: string; endDate?: string }): Promise<CategorySalesReport[]>`
  - `generateHourlySalesReport(adapter: DbAdapter, branchId: string, options?: { startDate?: string; endDate?: string }): Promise<HourlySalesReport[]>`

- [ ] **Step 1: Write failing tests for store reports engine**

```ts
// src/core/reports/__tests__/store-reports.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { generateZReport, generateCategorySalesReport, generateHourlySalesReport } from '../store-reports';
import { money } from '../../money';
import type { BillDoc } from '../../order/types';

describe('Store Reports Engine', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
  });

  it('generates Z-Report with sales, payment breakdowns and cash movements', async () => {
    // Seed sample bills
    const bill: BillDoc = {
      _id: 'bill:hq:b01',
      branchId: 'hq',
      sessionId: 's01',
      billNumber: 'B01',
      paymentRef: 'P01',
      status: 'paid',
      lines: [
        {
          lineId: 'l1',
          productId: 'p_coffee',
          nameSnapshot: { vi: 'Cà phê', en: 'Coffee' },
          unitPriceSnapshot: money(30000, 'VND'),
          qty: 2,
          status: 'placed',
          addedAt: '2026-10-26T10:00:00.000Z',
          modifiers: [],
        },
      ],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(60000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(60000, 'VND'),
      payments: [
        {
          paymentId: 'pay1',
          method: 'cash',
          amount: money(60000, 'VND'),
          tendered: money(100000, 'VND'),
          change: money(40000, 'VND'),
          createdAt: '2026-10-26T10:05:00.000Z',
        },
      ],
      balanceRemaining: money(0, 'VND'),
      createdAt: '2026-10-26T10:00:00.000Z',
      updatedAt: '2026-10-26T10:05:00.000Z',
    };
    await adapter.put(bill as unknown as any);

    const report = await generateZReport(adapter, 'hq', {
      startDate: '2026-10-26T00:00:00.000Z',
      endDate: '2026-10-26T23:59:59.000Z',
    });

    expect(report.totalBills).toBe(1);
    expect(report.paidBills).toBe(1);
    expect(report.netSales.minor).toBe(60000);
    expect(report.paymentsByMethod['cash']?.minor).toBe(60000);
  });

  it('generates hourly sales report spanning all 24 hours', async () => {
    const hourly = await generateHourlySalesReport(adapter, 'hq', {
      startDate: '2026-10-26T00:00:00.000Z',
      endDate: '2026-10-26T23:59:59.000Z',
    });
    expect(hourly).toHaveLength(24);
    expect(hourly[0]?.hour).toBe(0);
    expect(hourly[23]?.hour).toBe(23);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/core/reports/__tests__/store-reports.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `src/core/reports/store-reports.ts`**

Aggregate sales, discounts, taxes, and group by category and hour.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/core/reports/__tests__/store-reports.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/reports/store-reports.ts src/core/reports/__tests__/store-reports.test.ts
git commit -m "feat(reports): implement store reports engine for Z-report, categories, and hourly heatmap"
```

---

### Task 6: CSV Export & Print-Friendly Report Utilities

**Files:**
- Create: `src/core/reports/export.ts`
- Test: `src/core/reports/__tests__/export.test.ts`

**Interfaces:**
- Produces:
  - `exportZReportToCsv(report: ZReportSummary): string`
  - `exportCategoryReportToCsv(categories: readonly CategorySalesReport[]): string`
  - `exportHourlyReportToCsv(hourly: readonly HourlySalesReport[]): string`

- [ ] **Step 1: Write failing tests for CSV exports**

```ts
// src/core/reports/__tests__/export.test.ts
import { describe, it, expect } from 'vitest';
import { exportZReportToCsv, exportCategoryReportToCsv, exportHourlyReportToCsv } from '../export';
import { money } from '../../money';

describe('Report CSV Export', () => {
  it('formats Z-Report to CSV with headers and financial rows', () => {
    const csv = exportZReportToCsv({
      branchId: 'hq',
      periodStart: '2026-10-26T00:00:00.000Z',
      periodEnd: '2026-10-26T23:59:59.000Z',
      totalBills: 10,
      paidBills: 9,
      voidedBills: 1,
      grossSales: money(1000000, 'VND'),
      discountTotal: money(50000, 'VND'),
      surchargeTotal: money(0, 'VND'),
      taxTotal: money(0, 'VND'),
      netSales: money(950000, 'VND'),
      paymentsByMethod: { cash: money(600000, 'VND'), bank_transfer: money(350000, 'VND') },
      openingCash: money(500000, 'VND'),
      cashSales: money(600000, 'VND'),
      cashIn: money(0, 'VND'),
      cashDrops: money(200000, 'VND'),
      expectedCash: money(900000, 'VND'),
      countedCash: money(900000, 'VND'),
      variance: money(0, 'VND'),
    });

    expect(csv).toContain('Metric,Value');
    expect(csv).toContain('Gross Sales,1000000');
    expect(csv).toContain('Net Sales,950000');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/core/reports/__tests__/export.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `export.ts`**

Format structured report objects into clean RFC-4180 CSV text.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/core/reports/__tests__/export.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/reports/export.ts src/core/reports/__tests__/export.test.ts
git commit -m "feat(reports): add CSV export utilities for store reports"
```

---

### Task 7: Database Backup/Restore & Maintenance Utilities

**Files:**
- Create: `src/core/maintenance/backup-restore.ts`
- Create: `src/core/maintenance/token-cleanup.ts`
- Test: `src/core/maintenance/__tests__/backup-restore.test.ts`
- Test: `src/core/maintenance/__tests__/token-cleanup.test.ts`

**Interfaces:**
- Produces:
  - `exportDatabaseBackup(adapter: DbAdapter): Promise<DatabaseBackupSnapshot>`
  - `restoreDatabaseBackup(adapter: DbAdapter, snapshot: DatabaseBackupSnapshot): Promise<{ restoredCount: number }>`
  - `purgeExpiredGuestTokens(adapter: DbAdapter, now?: string): Promise<number>`

- [ ] **Step 1: Write failing tests for backup, restore, and cleanup**

```ts
// src/core/maintenance/__tests__/backup-restore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { exportDatabaseBackup, restoreDatabaseBackup } from '../backup-restore';

describe('Database Backup & Restore', () => {
  it('exports entire database to portable snapshot and restores it to fresh adapter', async () => {
    const sourceAdapter = await createMemoryAdapter();
    await sourceAdapter.put({ _id: 'doc:1', branchId: 'hq', data: 'hello' } as any);

    const snapshot = await exportDatabaseBackup(sourceAdapter);
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.docs).toHaveLength(1);

    const targetAdapter = await createMemoryAdapter();
    const result = await restoreDatabaseBackup(targetAdapter, snapshot);
    expect(result.restoredCount).toBe(1);

    const restored = await targetAdapter.get('doc:1');
    expect((restored as any).data).toBe('hello');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/core/maintenance/__tests__/backup-restore.test.ts src/core/maintenance/__tests__/token-cleanup.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement backup, restore, and cleanup**

Serialize and validate documents; purge expired session tokens.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/core/maintenance/__tests__/backup-restore.test.ts src/core/maintenance/__tests__/token-cleanup.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/maintenance/backup-restore.ts src/core/maintenance/token-cleanup.ts src/core/maintenance/__tests__/backup-restore.test.ts src/core/maintenance/__tests__/token-cleanup.test.ts
git commit -m "feat(maintenance): implement database backup/restore and token cleanup utilities"
```

---

### Task 8: UI Composable (`useShift.ts`) & i18n Localization Parity

**Files:**
- Create: `src/features/shift/useShift.ts`
- Modify: `src/i18n/vi.json`
- Modify: `src/i18n/en.json`
- Test: `src/features/shift/__tests__/useShift.test.ts`
- Test: `src/i18n/__tests__/i18n.test.ts`

**Interfaces:**
- Produces: `useShift(repo: ShiftRepository, branchId: Ref<string>, deviceId: Ref<string>)` returning reactive `activeShift`, `isOpen`, `openShift()`, `closeShift()`, `recordCashMovement()`.

- [ ] **Step 1: Write failing tests for `useShift` and verify i18n parity**

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/features/shift/__tests__/useShift.test.ts src/i18n/__tests__/i18n.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `useShift.ts` and add full Vietnamese & English keys**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/shift/__tests__/useShift.test.ts src/i18n/__tests__/i18n.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/shift/useShift.ts src/features/shift/__tests__/useShift.test.ts src/i18n/vi.json src/i18n/en.json
git commit -m "feat(shift): add useShift composable and localization keys with key parity"
```

---

### Task 9: Vuetify0 Shift Management Dialog (`ShiftModal.vue`)

**Files:**
- Create: `src/features/shift/ShiftModal.vue`
- Test: `src/features/shift/__tests__/ShiftModal.test.ts`

**Interfaces:**
- Consumes: `useShift`, Vuetify0 headless components (`Dialog`, `Button`, `Input`)
- Produces: `ShiftModal.vue` supporting Open Shift, Cash In, Cash Drop, and Close Shift with live variance indicator.

- [ ] **Step 1: Write component test for `ShiftModal.vue`**

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/features/shift/__tests__/ShiftModal.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `ShiftModal.vue`**

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/shift/__tests__/ShiftModal.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/shift/ShiftModal.vue src/features/shift/__tests__/ShiftModal.test.ts
git commit -m "feat(ui): add ShiftModal component for cash drawer reconciliation"
```

---

### Task 10: Vuetify0 Advanced Store Reports Dialog (`StoreReportsModal.vue`)

**Files:**
- Create: `src/features/reports/StoreReportsModal.vue`
- Test: `src/features/reports/__tests__/StoreReportsModal.test.ts`

**Interfaces:**
- Consumes: `generateZReport`, `generateCategorySalesReport`, `generateHourlySalesReport`, `exportZReportToCsv`
- Produces: `StoreReportsModal.vue` with tabbed views and 1-click CSV download.

- [ ] **Step 1: Write component test for `StoreReportsModal.vue`**

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/features/reports/__tests__/StoreReportsModal.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `StoreReportsModal.vue`**

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/reports/__tests__/StoreReportsModal.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reports/StoreReportsModal.vue src/features/reports/__tests__/StoreReportsModal.test.ts
git commit -m "feat(ui): add StoreReportsModal for Z-report, categories, hourly heatmap, and CSV export"
```

---

### Task 11: Header & App Integration in `App.vue`

**Files:**
- Modify: `src/App.vue`
- Test: `src/features/shift/__tests__/app-shift-integration.test.ts`

**Interfaces:**
- Mounts `ShiftModal.vue` and `StoreReportsModal.vue` in `src/App.vue`.
- Displays shift status pill in POS header (e.g. "🟢 Ca đang mở" or "⚪ Chưa mở ca").

- [ ] **Step 1: Write integration test for header shift indicators and modal triggers**

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/features/shift/__tests__/app-shift-integration.test.ts`  
Expected: FAIL

- [ ] **Step 3: Update `src/App.vue`**

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/shift/__tests__/app-shift-integration.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.vue src/features/shift/__tests__/app-shift-integration.test.ts
git commit -m "feat(app): wire ShiftModal and StoreReportsModal into App header"
```

---

### Task 12: End-to-End Acceptance Test & Final Verification

**Files:**
- Create: `tests/m6c-shifts-reports-hardening-acceptance.test.ts`

**Interfaces:**
- Exercises the complete shift lifecycle, audit logging, Z-report generation, and backup/restore.

- [ ] **Step 1: Write end-to-end acceptance test**

- [ ] **Step 2: Run full verification suite**

Run:
```bash
npm run test
npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add tests/m6c-shifts-reports-hardening-acceptance.test.ts
git commit -m "test(acceptance): add M6c end-to-end acceptance test suite"
```
