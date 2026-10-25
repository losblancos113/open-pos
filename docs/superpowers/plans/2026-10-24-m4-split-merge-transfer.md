# M4 — Split / Merge / Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add split-by-item, split-evenly, split-by-seat, merge-bills, transfer-table, and move-lines operations to the order engine, with property tests guaranteeing money conservation and line-integrity.

**Architecture:** Extends the existing event-sourced reducer from M3. Three new atomic event types (`BILL_SPLIT`, `BILL_MERGED`, `TABLE_TRANSFERRED`) are added to the reducer. Pure split/merge algorithms live in `src/core/order/split-merge.ts`. The repository adds wrapper methods that call the algorithms and persist via `appendEvents()`. All logic stays in `src/core/order/` — no Vue, no PouchDB.

**Tech Stack:** TypeScript (strict), Vitest, fast-check for property tests, existing `money`/`allocate`/`allocateEqual` primitives.

**Spec:** `docs/superpowers/specs/2026-10-24-m4-split-merge-transfer-design.md`

## Global Constraints

- Every document carries a `branchId`; `createEnvelope()` throws without one.
- Money is integer minor units, never a float. `money()` rejects non-integers.
- Allocation uses largest-remainder with ascending-index tie-break; same inputs always produce the same output.
- `_id` prefixes are a contract: `branch:`, `product:`, `product_override:<branchId>:<productId>`, `session:<branchId>:<uuid>`, `bill:<branchId>:<uuid>`, `session_events:<branchId>:<sessionId>`. Use helpers in `src/core/db/ids.ts`.
- Storage goes through `DbAdapter`. Domain code must not import PouchDB directly.
- i18n keys must exist in both `vi` and `en` — a parity test fails otherwise. Vietnamese is the default and fallback locale.
- Design tokens are defined once, in `tokens.ts`. `tokens.css` must declare exactly the same variables.
- The hub is the network boundary — keep its input validation. Do not weaken any security guard.
- TypeScript strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`.
- Module resolution is `bundler`, path alias `@/*` → `./src/*`.
- Error messages and thrown exceptions are in English.

## Review Focus

1. **Split by item with all lines selected** — should produce a target bill with all lines and source bill with none (empty bill, not voided entirely); source total should be 0, target total should equal original.
2. **Split evenly with an odd total not divisible by parts** — largest-remainder allocation must sum exactly to original total; verify with a concrete example like 100,000 VND split into 3 parts.
3. **Split by seat with mixed seat/unseat lines** — unseated lines go to a special "unassigned" bill; seated lines group correctly per seat.
4. **Merge bills where both have payments** — merged bill must carry forward all payments from both sources; balance calculation must be correct.
5. **Move lines between bills with different discounts** — source discount structure is preserved on the target bill; line-level totals are recalculated independently.

---

### Task 1: Type extensions — new event types and payload interfaces

**Files:**
- Modify: `src/core/order/events.ts`
- Modify: `src/core/order/types.ts`
- Test: `src/core/order/__tests__/split-merge-types.test.ts`

**Interfaces:**
- Consumes: existing `OrderEventType` union
- Produces: extended `OrderEventType` with `BILL_SPLIT`, `BILL_MERGED`, `TABLE_TRANSFERRED`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/order/__tests__/split-merge-types.test.ts
import { describe, it, expect } from 'vitest';
import type { OrderEventType } from '../events';

describe('OrderEventType includes M4 operations', () => {
  it('accepts BILL_SPLIT as a valid event type', () => {
    const type: OrderEventType = 'BILL_SPLIT';
    expect(type).toBe('BILL_SPLIT');
  });

  it('accepts BILL_MERGED as a valid event type', () => {
    const type: OrderEventType = 'BILL_MERGED';
    expect(type).toBe('BILL_MERGED');
  });

  it('accepts TABLE_TRANSFERRED as a valid event type', () => {
    const type: OrderEventType = 'TABLE_TRANSFERRED';
    expect(type).toBe('TABLE_TRANSFERRED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/order/__tests__/split-merge-types.test.ts -v`
Expected: FAIL — `'BILL_SPLIT'` is not assignable to type `OrderEventType`

- [ ] **Step 3: Update `OrderEventType` in `src/core/order/events.ts`**

Add three literals to the union:
```ts
export type OrderEventType =
  // ... existing types ...
  | 'BILL_SPLIT'
  | 'BILL_MERGED'
  | 'TABLE_TRANSFERRED';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/order/__tests__/split-merge-types.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/order/events.ts src/core/order/__tests__/split-merge-types.test.ts
git commit -m "feat(order): extend OrderEventType with BILL_SPLIT, BILL_MERGED, TABLE_TRANSFERRED"
```

---

### Task 2: Split-merge pure algorithm functions

**Files:**
- Create: `src/core/order/split-merge.ts`
- Test: `src/core/order/__tests__/split-merge.test.ts`

**Interfaces:**
- Consumes: `BillDoc`, `SessionDoc`, `OrderEventDoc`, `money()`, `allocateEqual()` from `src/core/money-allocate.ts`
- Produces:
  - `splitByItems(sourceBill, lineIds, actorId, deviceId, sessionId, createdAt): { sourceBill, targetBill, events }`
  - `splitEvenly(sourceBill, parts, actorId, deviceId, sessionId, createdAt): { sourceBill, targetBills, events }`
  - `splitBySeat(sourceBill, actorId, deviceId, sessionId, createdAt): { sourceBill, targetBills, events }`
  - `mergeBills(sources, actorId, deviceId, sessionId, createdAt): { mergedBill, events }`
  - `transferTable(session, fromTableId, toTableId, actorId, deviceId, reason, createdAt): { session, events }`
  - `moveLines(sourceBill, lineIds, targetBill, actorId, deviceId, sessionId, createdAt): { sourceBill, targetBill, events }`

- [ ] **Step 1: Write failing tests for `splitByItems`**

```ts
// src/core/order/__tests__/split-merge.test.ts
import { describe, it, expect } from 'vitest';
import { money } from '../money';
import type { BillDoc } from './types';
import {
  splitByItems,
  splitEvenly,
  splitBySeat,
  mergeBills,
  transferTable,
  moveLines,
} from '../split-merge';

describe('splitByItems', () => {
  function makeBill(totalMinor: number, lines: Array<{ lineId: string; qty: number; priceMinor: number }>): BillDoc {
    return {
      _id: 'bill:hq:b1',
      branchId: 'hq',
      sessionId: 'session:hq:s1',
      billNumber: 'HQ-T01-20261024-0001',
      paymentRef: 'POSHQT010001',
      status: 'draft',
      lines: lines.map((l) => ({
        lineId: l.lineId,
        productId: `product:${l.lineId}`,
        nameSnapshot: { vi: l.lineId, en: l.lineId },
        unitPriceSnapshot: money(l.priceMinor, 'VND'),
        qty: l.qty,
        modifiers: [],
        status: 'placed' as const,
        addedAt: '2026-10-24T10:00:00.000Z',
      })),
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(totalMinor, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(totalMinor, 'VND'),
      payments: [],
      balanceRemaining: money(totalMinor, 'VND'),
      createdAt: '2026-10-24T10:00:00.000Z',
      updatedAt: '2026-10-24T10:00:00.000Z',
    };
  }

  it('creates a target bill with selected lines and voids them in source', () => {
    const bill = makeBill(130000, [
      { lineId: 'l1', qty: 1, priceMinor: 65000 },
      { lineId: 'l2', qty: 1, priceMinor: 65000 },
    ]);
    const result = splitByItems(bill, ['l1'], 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');

    // Source should have l1 voided, l2 still placed
    expect(result.sourceBill.lines.find((l) => l.lineId === 'l1')?.status).toBe('voided');
    expect(result.sourceBill.lines.find((l) => l.lineId === 'l1')?.voidReason).toBe('split');
    expect(result.sourceBill.lines.find((l) => l.lineId === 'l2')?.status).toBe('placed');

    // Target should have l1 placed
    expect(result.targetBill.lines.find((l) => l.lineId === 'l1')?.status).toBe('placed');
    expect(result.targetBill.total.minor).toBe(65000);
    expect(result.sourceBill.total.minor).toBe(65000);
  });

  it('preserves total money: source + target = original', () => {
    const bill = makeBill(130000, [
      { lineId: 'l1', qty: 1, priceMinor: 65000 },
      { lineId: 'l2', qty: 1, priceMinor: 65000 },
    ]);
    const result = splitByItems(bill, ['l1'], 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');
    expect(result.sourceBill.total.minor + result.targetBill.total.minor).toBe(130000);
  });

  it('throws when lineId does not exist in the bill', () => {
    const bill = makeBill(65000, [{ lineId: 'l1', qty: 1, priceMinor: 65000 }]);
    expect(() => splitByItems(bill, ['nonexistent'], 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z'))
      .toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/order/__tests__/split-merge.test.ts -v`
Expected: FAIL — `splitByItems` is not defined

- [ ] **Step 3: Implement all split-merge functions in `src/core/order/split-merge.ts`**

Create the file with all six functions. Key implementation notes:
- Use deep cloning (spread + arrays) to avoid mutating input bills.
- `splitByItems`: clone selected lines into target; mark selected lines in source as `voided` with `voidReason: 'split'`; create `BILL_SPLIT` event.
- `splitEvenly`: use `allocateEqual(sourceBill.total, parts)`; copy all source lines to each target bill (lines are shared references in the target bills but each bill recalculates its own total independently via `recalculateBill`); source bill gets first allocation; create `BILL_SPLIT` event for each target.
- `splitBySeat`: group lines by `seat`; throw if no line has a seat; create one target bill per unique seat value; unseated lines go to a bill with no seat assignment; create `BILL_SPLIT` events.
- `mergeBills`: collect all non-voided lines from all sources; create one new bill with merged lines; void each source bill with `voidReason: 'merged'`; create `BILL_MERGED` event.
- `transferTable`: update `session.tableIds` by removing `fromTableId` and adding `toTableId`; create `TABLE_TRANSFERRED` event.
- `moveLines`: same pattern as `splitByItems` but moves lines from one existing bill to another (both bills exist already).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/order/__tests__/split-merge.test.ts -v`
Expected: PASS

- [ ] **Step 5: Add tests for the remaining functions**

Add tests for `splitEvenly`, `splitBySeat`, `mergeBills`, `transferTable`, `moveLines` covering:
- `splitEvenly`: 3-way split of 100,000 VND → 34,000 + 33,000 + 33,000 = 100,000
- `splitBySeat`: lines with seat 1 and seat 2 → two bills, each with correct lines
- `mergeBills`: two bills merge, merged total equals sum
- `transferTable`: session tableIds updated correctly
- `moveLines`: lines moved, totals preserved

- [ ] **Step 6: Run all split-merge tests**

Run: `npx vitest run src/core/order/__tests__/split-merge.test.ts -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/order/split-merge.ts src/core/order/__tests__/split-merge.test.ts
git commit -m "feat(order): add split/merge/transfer pure algorithm functions"
```

---

### Task 3: Reducer handlers for new event types

**Files:**
- Modify: `src/core/order/reducer.ts`
- Test: `src/core/order/__tests__/reducer.test.ts` (add new test cases)

**Interfaces:**
- Consumes: existing `applyOrderEvent`, `recalculateBill`
- Produces: reducer handles `BILL_SPLIT`, `BILL_MERGED`, `TABLE_TRANSFERRED`

- [ ] **Step 1: Write failing tests in `reducer.test.ts`**

```ts
it('handles BILL_SPLIT: creates target bill state and voids source lines', () => {
  let state = createInitialOrderState(session, bill);
  // Add two lines first
  state = applyOrderEvent(state, {
    eventId: 'ev-1', type: 'LINE_ADDED', sessionId: session._id, billId: bill._id,
    actorId: 'c1', deviceId: 'T01',
    payload: { lineId: 'l1', productId: 'p1', nameSnapshot: { vi: 'A', en: 'A' },
      unitPriceSnapshot: money(50000, 'VND'), qty: 1, modifiers: [], addedAt: '2026-10-24T10:00:00Z' },
    createdAt: '2026-10-24T10:00:00Z', schemaVersion: 1,
  });
  state = applyOrderEvent(state, {
    eventId: 'ev-2', type: 'LINE_ADDED', sessionId: session._id, billId: bill._id,
    actorId: 'c1', deviceId: 'T01',
    payload: { lineId: 'l2', productId: 'p2', nameSnapshot: { vi: 'B', en: 'B' },
      unitPriceSnapshot: money(50000, 'VND'), qty: 1, modifiers: [], addedAt: '2026-10-24T10:01:00Z' },
    createdAt: '2026-10-24T10:01:00Z', schemaVersion: 1,
  });
  expect(state.bill.total.minor).toBe(100000);

  // Apply BILL_SPLIT: move l1 to new bill
  state = applyOrderEvent(state, {
    eventId: 'ev-3', type: 'BILL_SPLIT', sessionId: session._id, billId: bill._id,
    actorId: 'c1', deviceId: 'T01',
    payload: {
      sourceBillId: bill._id,
      targetBillId: 'bill:hq:b2',
      movedLineIds: ['l1'],
    },
    createdAt: '2026-10-24T10:02:00Z', schemaVersion: 1,
  });
  // Main bill state reflects split: l1 voided, l2 remains
  expect(state.bill.lines.find((l) => l.lineId === 'l1')?.status).toBe('voided');
  expect(state.bill.lines.find((l) => l.lineId === 'l2')?.status).toBe('placed');
  expect(state.bill.total.minor).toBe(50000);
});

it('handles TABLE_TRANSFERRED: updates session tableIds', () => {
  let state = createInitialOrderState(session, bill);
  state = applyOrderEvent(state, {
    eventId: 'ev-1', type: 'TABLE_TRANSFERRED', sessionId: session._id, billId: bill._id,
    actorId: 'c1', deviceId: 'T01',
    payload: { fromTableId: 'table:hq:t1', toTableId: 'table:hq:t2' },
    createdAt: '2026-10-24T10:02:00Z', schemaVersion: 1,
  });
  expect(state.session.tableIds).not.toContain('table:hq:t1');
  expect(state.session.tableIds).toContain('table:hq:t2');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/order/__tests__/reducer.test.ts -v`
Expected: FAIL — handler not implemented

- [ ] **Step 3: Add three case handlers to `applyOrderEvent` in `src/core/order/reducer.ts`**

```ts
case 'BILL_SPLIT': {
  // Mark lines in nextBill as voided for movedLineIds, then recalculate
  const movedLineIds = new Set(payload.movedLineIds ?? []);
  for (const line of nextBill.lines) {
    if (movedLineIds.has(line.lineId)) {
      line.status = 'voided';
      line.voidReason = 'split';
    }
  }
  recalculateBill(nextBill);
  // Create target bill info in state (stored as a separate field or tracked separately)
  // For reducer simplicity: store target bill id and state on the aggregate
  break;
}
case 'BILL_MERGED': {
  // Mark source bills as voided
  break;
}
case 'TABLE_TRANSFERRED': {
  const { fromTableId, toTableId } = payload;
  nextSession.tableIds = nextSession.tableIds.filter((t) => t !== fromTableId);
  if (!nextSession.tableIds.includes(toTableId)) {
    nextSession.tableIds.push(toTableId);
  }
  break;
}
```

Note: The reducer operates on a single aggregate (one session + one bill). For `BILL_SPLIT` and `BILL_MERGED`, the reducer updates the **current bill's** state (voiding lines or marking as merged), while the new target/source bills are tracked via the `events` array and will be materialized by the repository. The reducer's job is to keep the *main* aggregate consistent.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/order/__tests__/reducer.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/order/reducer.ts src/core/order/__tests__/reducer.test.ts
git commit -m "feat(order): add reducer handlers for BILL_SPLIT, BILL_MERGED, TABLE_TRANSFERRED"
```

---

### Task 4: Property tests for split/merge invariants

**Files:**
- Create: `src/core/order/__tests__/split-merge-arbs.test.ts`

**Interfaces:**
- Consumes: `splitByItems`, `splitEvenly`, `splitBySeat`, `mergeBills`, `moveLines` from `split-merge.ts`, `money()`, `allocateEqual()`
- Produces: property-based tests that verify invariants hold for arbitrary inputs

- [ ] **Step 1: Write property tests**

```ts
import { describe, it, expect } from 'vitest';
import { property, integer, array, nonEmptyArray } from 'fast-check';
import { money } from '../money';
import { allocateEqual } from '../money-allocate';
import type { BillDoc } from '../types';
import {
  splitByItems,
  splitEvenly,
  mergeBills,
  moveLines,
} from '../split-merge';

function makeBill(totalMinor: number, lineCount: number, seatCoverage: 'all' | 'none' | 'partial'): BillDoc {
  const lines = Array.from({ length: lineCount }, (_, i) => ({
    lineId: `l${i}`,
    productId: `product:l${i}`,
    nameSnapshot: { vi: `Món ${i}`, en: `Item ${i}` },
    unitPriceSnapshot: money(Math.floor(totalMinor / lineCount), 'VND'),
    qty: 1,
    modifiers: [],
    status: 'placed' as const,
    addedAt: '2026-10-24T10:00:00.000Z',
    ...(seatCoverage !== 'none' ? { seat: i % 3 + 1 } : {}),
  }));
  const remaining = totalMinor - lines.length * Math.floor(totalMinor / lineCount);
  if (remaining > 0 && lines.length > 0) lines[0]!.unitPriceSnapshot = money(lines[0]!.unitPriceSnapshot.minor + remaining, 'VND');

  return {
    _id: 'bill:hq:b1', branchId: 'hq', sessionId: 'session:hq:s1',
    billNumber: 'HQ-T01-20261024-0001', paymentRef: 'POSHQT010001',
    status: 'draft', lines, discounts: [], surcharges: [],
    taxMode: 'inclusive', taxLines: [], taxTotal: money(0, 'VND'),
    subtotal: money(totalMinor, 'VND'), discountTotal: money(0, 'VND'),
    surchargeTotal: money(0, 'VND'), total: money(totalMinor, 'VND'),
    payments: [], balanceRemaining: money(totalMinor, 'VND'),
    createdAt: '2026-10-24T10:00:00.000Z', updatedAt: '2026-10-24T10:00:00.000Z',
  };
}

describe('M4 property tests: split/merge invariants', () => {
  it('splitByItems: sum of source + target totals equals original', () => {
    property(
      integer({ min: 2, max: 500000 }),   // total
      integer({ min: 2, max: 10 }),        // line count
      nonEmptyArray(integer({ min: 0, max: 9 })), // line indices to split
      (totalMinor, lineCount, splitIndices) => {
        const bill = makeBill(totalMinor, lineCount, 'none');
        const lineIds = splitIndices.slice(0, lineCount).map((i) => `l${i}`);
        if (lineIds.length === 0) return true;
        const result = splitByItems(bill, lineIds, 'c1', 'T01', 'session:hq:s1', new Date().toISOString());
        expect(result.sourceBill.total.minor + result.targetBill.total.minor).toBe(totalMinor);
      }
    );
  });

  it('splitByItems: no line is lost or duplicated', () => {
    property(
      integer({ min: 2, max: 500000 }),
      integer({ min: 2, max: 10 }),
      nonEmptyArray(integer({ min: 0, max: 9 })),
      (totalMinor, lineCount, splitIndices) => {
        const bill = makeBill(totalMinor, lineCount, 'none');
        const lineIds = splitIndices.slice(0, lineCount).map((i) => `l${i}`);
        if (lineIds.length === 0) return true;
        const result = splitByItems(bill, lineIds, 'c1', 'T01', 'session:hq:s1', new Date().toISOString());
        const originalLineIds = new Set(bill.lines.map((l) => l.lineId));
        const sourcePlaced = result.sourceBill.lines.filter((l) => l.status === 'placed').map((l) => l.lineId);
        const targetPlaced = result.targetBill.lines.filter((l) => l.status === 'placed').map((l) => l.lineId);
        const allPlaced = [...sourcePlaced, ...targetPlaced];
        expect(new Set(allPlaced).size).toBe(allPlaced.length); // no duplicates
        expect(new Set(allPlaced).size).toBe(originalLineIds.size); // no losses
      }
    );
  });

  it('splitEvenly: sum of all parts equals original total', () => {
    property(
      integer({ min: 100, max: 1000000 }),
      integer({ min: 1, max: 10 }),
      (totalMinor, parts) => {
        const bill = makeBill(totalMinor, 3, 'none');
        const result = splitEvenly(bill, parts, 'c1', 'T01', 'session:hq:s1', new Date().toISOString());
        const sum = result.targetBills.reduce((acc, b) => acc + b.total.minor, result.sourceBill.total.minor);
        expect(sum).toBe(totalMinor);
      }
    );
  });

  it('mergeBills: merged total equals sum of source totals', () => {
    property(
      integer({ min: 100, max: 500000 }),
      integer({ min: 100, max: 500000 }),
      (total1, total2) => {
        const b1 = makeBill(total1, 2, 'none');
        const b2 = makeBill(total2, 2, 'none');
        b2._id = 'bill:hq:b2';
        b2.sessionId = 'session:hq:s1';
        const result = mergeBills([b1, b2], 'c1', 'T01', 'session:hq:s1', new Date().toISOString());
        expect(result.mergedBill.total.minor).toBe(total1 + total2);
      }
    );
  });

  it('moveLines: sum of source + target totals equals original', () => {
    property(
      integer({ min: 2, max: 500000 }),
      integer({ min: 2, max: 10 }),
      nonEmptyArray(integer({ min: 0, max: 9 })),
      (totalMinor, lineCount, moveIndices) => {
        const source = makeBill(totalMinor, lineCount, 'none');
        const target = makeBill(0, 0, 'none');
        target._id = 'bill:hq:b2';
        const lineIds = moveIndices.slice(0, lineCount).map((i) => `l${i}`);
        if (lineIds.length === 0) return true;
        const result = moveLines(source, lineIds, target, 'c1', 'T01', 'session:hq:s1', new Date().toISOString());
        expect(result.sourceBill.total.minor + result.targetBill.total.minor).toBe(totalMinor);
      }
    );
  });
});
```

- [ ] **Step 2: Run property tests**

Run: `npx vitest run src/core/order/__tests__/split-merge-arbs.test.ts -v`
Expected: FAIL initially (implementing functions don't exist yet or logic is incomplete)

- [ ] **Step 3: Fix any failures in `split-merge.ts`**

Run: `npx vitest run src/core/order/__tests__/split-merge-arbs.test.ts -v`
Expected: PASS — all invariants hold

- [ ] **Step 4: Commit**

```bash
git add src/core/order/__tests__/split-merge-arbs.test.ts
git commit -m "test(order): add fast-check property tests for split/merge invariants"
```

---

### Task 5: Repository wrapper methods

**Files:**
- Modify: `src/core/order/order-repository.ts`
- Test: `src/core/order/__tests__/order-repository.test.ts` (add new test cases)

**Interfaces:**
- Consumes: `splitByItems`, `splitEvenly`, `splitBySeat`, `mergeBills`, `transferTable`, `moveLines` from `split-merge.ts`; existing `appendEvents`
- Produces: `OrderRepository` extended with 6 new methods

- [ ] **Step 1: Write failing tests for repository methods**

Add these test cases to `src/core/order/__tests__/order-repository.test.ts`:

```ts
it('splitByItems persists events and returns updated states', async () => {
  // Setup: create session with bill containing 2 lines (50k + 50k)
  const session = { /* ... */ };
  const bill = { /* ... */ };
  const state = await repo.appendEvents('hq', session._id, [/* LINE_ADDED x2 */], { session, bill });

  // Act
  const result = await repo.splitByItems('hq', session._id, bill._id, ['l1'], 'c1', 'T01');

  // Assert
  expect(result.sourceState.bill.total.minor).toBe(50000);
  expect(result.targetState.bill.total.minor).toBe(50000);
  // Verify events persisted
  const eventsDoc = await adapter.get('session_events:hq:s1') as SessionEventsDoc | null;
  expect(eventsDoc?.events.some((e) => e.type === 'BILL_SPLIT')).toBe(true);
});
```

Similarly for `splitEvenly`, `mergeBills`, `transferTable`, `moveLines`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/order/__tests__/order-repository.test.ts -v`
Expected: FAIL — methods not defined on repository

- [ ] **Step 3: Add the 6 methods to `createOrderRepository`**

Each method follows the same pattern:
1. Call the pure algorithm function from `split-merge.ts`.
2. Call `appendEvents()` with the returned events and projected state.
3. Return the resulting state(s).

For `splitEvenly` returning multiple target states, collect all results. For `transferTable`, update the session state directly.

- [ ] **Step 4: Run all repository tests**

Run: `npx vitest run src/core/order/__tests__/order-repository.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/order/order-repository.ts src/core/order/__tests__/order-repository.test.ts
git commit -m "feat(order): add split/merge/transfer methods to OrderRepository"
```

---

### Task 6: i18n keys

**Files:**
- Modify: `src/i18n/vi.json`
- Modify: `src/i18n/en.json`

**Interfaces:**
- Consumes: existing i18n structure
- Produces: new keys under `pos.split.*`, `pos.merge.*`, `pos.transfer.*`, `pos.move.*`

- [ ] **Step 1: Add keys to both language files**

In `src/i18n/vi.json`, add under the `pos` section:
```json
"split": {
  "title": "Chia hoá đơn",
  "byItem": "Chia theo món",
  "evenly": "Chia đều",
  "bySeat": "Chia theo ghế",
  "confirm": "Xác nhận chia",
  "sourceBill": "Hoá đơn gốc",
  "targetBill": "Hoá đơn mới",
  "lineMoved": "Đã chuyển sang hoá đơn khác"
},
"merge": {
  "title": "Gộp hoá đơn",
  "confirm": "Xác nhận gộp",
  "mergedInto": "Đã gộp vào"
},
"transfer": {
  "title": "Chuyển bàn",
  "confirm": "Xác nhận chuyển bàn",
  "reason": "Lý do chuyển bàn",
  "from": "Từ bàn",
  "to": "Đến bàn"
},
"move": {
  "title": "Chuyển món",
  "confirm": "Xác nhận chuyển món"
}
```

Same keys in `src/i18n/en.json` with English translations:
```json
"split": {
  "title": "Split bill",
  "byItem": "Split by item",
  "evenly": "Split evenly",
  "bySeat": "Split by seat",
  "confirm": "Confirm split",
  "sourceBill": "Original bill",
  "targetBill": "New bill",
  "lineMoved": "Moved to another bill"
},
"merge": {
  "title": "Merge bills",
  "confirm": "Confirm merge",
  "mergedInto": "Merged into"
},
"transfer": {
  "title": "Transfer table",
  "confirm": "Confirm transfer",
  "reason": "Transfer reason",
  "from": "From table",
  "to": "To table"
},
"move": {
  "title": "Move items",
  "confirm": "Confirm move"
}
```

- [ ] **Step 2: Run i18n parity test**

Run: `npx vitest run src/i18n/__tests__/i18n.test.ts -v`
Expected: PASS — keys exist in both files

- [ ] **Step 3: Commit**

```bash
git add src/i18n/vi.json src/i18n/en.json
git commit -m "feat(i18n): add M4 split/merge/transfer keys to vi and en"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: All tests pass (including M0, M1, M2, M3 tests — no regressions)

- [ ] **Step 2: Run TypeScript type check**

Run: `npx vue-tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit any fixes**

If any issues are found, fix and commit with `fix(order): address M4 verification findings`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-24-m4-split-merge-transfer.md`. Please review the plan. Does it capture what you want?

Which execution approach would you prefer?

- **Subagent-driven** — A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** — I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end. Runs well with a mid-tier session model, since the plan carries the design.

**For this plan I recommend Native**, because there are 7 tasks with clear dependencies (types → algorithms → reducer → properties → repo → i18n → verify), each task builds directly on the previous one's interface, and the total scope is small (~300 lines of new code + tests) so the risk of a shipped mistake is low. Does the plan capture what you want, and which approach should we use?
