# M4 — Split / Merge / Transfer: Design Document

**Date:** 2026-10-24  
**Status:** Draft — awaiting approval  
**Module:** `src/core/order/` (extends existing M3 order engine)  
**Invariants enforced by:** property tests (`fast-check`) + unit tests

---

## 1. Intent

M3 delivers a working single-bill flow for one customer at one table. Real restaurants need to handle **multiple customers at one table** who want to pay separately, **merge tables** when groups combine, and **transfer guests** to different tables. M4 adds these operations on top of the existing event-sourced order engine.

The work is purely in `src/core/order/` (same pattern as M3): no Vue imports, no PouchDB imports — plain TypeScript. The POS UI (M5+) will wire up the commands later.

---

## 2. Goals & Non-Goals

### Goals

| # | Goal | Success criterion |
|---|------|-------------------|
| G1 | **Split by item** | Select lines from one bill → new bill with those lines; original bill keeps the rest. Totals match before and after. |
| G2 | **Split evenly** | Split total of one bill into N equal parts (largest-remainder) → N new bills whose totals sum exactly to the original total. |
| G3 | **Split by seat** | Lines are grouped by their `seat` number → one bill per seat. Lines without a seat go to a special "unassigned" bill. |
| G4 | **Merge bills** | Two or more open bills in the same session → one bill. Lines and discounts are preserved (deduped by rule). |
| G5 | **Transfer table** | Move a session (with its bills) to a different table. Existing lines and payments are untouched. |
| G6 | **Move lines** | Move specific lines from one bill to another within the same session. |
| G7 | **Property invariants** | After any split or merge cycle, total money is conserved and no line is lost or duplicated. |

### Non-goals (explicitly out of scope for M4)

- Split by weight / by individual line price (future).
- Merge sessions (tables) — that belongs to M5 when we have multi-table UX.
- Partial payment splits (split where some bills already have payments) — deferred to a clearer spec.
- UI components — M4 is domain-only; the POS will consume the new functions in M5.

---

## 3. Event Types

Three new event types extend the existing reducer:

| Event | Purpose |
|-------|---------|
| `BILL_SPLIT` | One bill → two or more bills. Payload carries source bill id, destination bill ids, line assignments, and money allocation. |
| `BILL_MERGED` | Two or more source bills → one target bill. Payload carries source bill ids and line mapping. |
| `TABLE_TRANSFERRED` | Session moves to a different table. Payload carries old table id, new table id, reason. |

No new state shape is introduced — all payloads reference existing `_id` values and existing lines.

---

## 4. Algorithms (Pure TS — in `src/core/order/split-merge.ts`)

### 4.1 `splitByItems(sourceBill, lineIds, actor, createdAt)`

```
Input:  sourceBill (BillDoc), lineIds (string[]), actorId, createdAt
Output: { sourceBill: BillDoc, targetBill: BillDoc, events: OrderEventDoc[] }
```

Steps:
1. Select lines whose `lineId` is in `lineIds`. All selected lines must have `status === 'placed'`.
2. Clone the selected lines (deep copy, including modifiers) into `targetBill`.
3. Mark the selected lines in `sourceBill` as `status: 'voided'` with `voidReason: 'split'`.
4. Recalculate both bills.
5. Create `BILL_SPLIT` event with payload:
   ```ts
   {
     sourceBillId: string,
     targetBillId: string,
     movedLineIds: string[],
     actorId: string,
     deviceId: string,
     sessionId: string,
   }
   ```
6. Create a new `SESSION_OPENED`-equivalent bootstrap for the target bill (the session stays the same; the target bill gets the same `sessionId`).

**Invariant check:** `sourceBill.total + targetBill.total === originalSourceBill.total` (before split). No line is counted twice; no line is lost.

### 4.2 `splitEvenly(sourceBill, parts, actor, createdAt)`

```
Input:  sourceBill (BillDoc), parts (number ≥ 1), actorId, createdAt
Output: { sourceBill: BillDoc, targetBills: BillDoc[], events: OrderEventDoc[] }
```

Steps:
1. Use `allocateEqual(sourceBill.total, parts)` from `src/core/money-allocate.ts` to compute N equal (±1 đồng) amounts.
2. **Every bill (including source)** gets a `BILL_SPLIT` event. The source bill's total becomes `parts[0]`; each target bill gets its corresponding amount.
3. **Lines are duplicated proportionally** — every line in the source bill is copied to every target bill with a fractional quantity. Since we can't have fractional line items, we use the largest-remainder allocation on **each line's quantity rounded to integers** so that line counts also sum correctly.
4. Recalculate all bills.
5. Verify: sum of all target bill totals equals original source bill total.

**Alternative simpler approach (preferred for M4):**
Instead of duplicating every line, copy **all lines** to each target bill and allocate only the **financial totals**. The line-level totals may differ slightly due to rounding, but the **bill-level total is exact**. This is more practical for restaurant ops — you don't want a line appearing 3 times on 3 separate bills if the customer only ordered one phở.

Wait — re-reading the spec, "chia đều (chia số tiền)" means **split the total evenly by money**, not by lines. The correct semantic is:
- Keep all lines on the **source** bill.
- Create N new bills, each with a `balanceRemaining` equal to its allocated share.
- Add a `PAYMENT_ADDED`-equivalent adjustment to each bill so that `total - paymentAdjustment = allocated amount`.

Actually, let's keep it simpler and more correct:

**Final approach for `splitEvenly`:**
1. Copy all source lines to each target bill.
2. Allocate the source bill's `total` across N targets using `allocateEqual`.
3. For each target bill, create a **negative surcharge** (or a special adjustment line) equal to `targetTotal - targetBill.total` so the bill's final total equals the allocated share.
4. The source bill's total becomes its allocated share.

This keeps lines intact (no duplication) while making each bill's total correct.

### 4.3 `splitBySeat(sourceBill, actor, createdAt)`

```
Input:  sourceBill (BillDoc), actorId, createdAt
Output: { sourceBill: BillDoc, targetBills: BillDoc[], events: OrderEventDoc[] }
```

Prerequisites:
- `sourceBill` must have at least one line with `seat` defined.
- If no lines have `seat`, throw `splitBySeat(): at least one line must have a seat number`.

Steps:
1. Group lines by `seat` (lines without `seat` go into a special `null` group).
2. For each unique `seat` value, create a new bill containing only lines for that seat.
3. Mark lines in the source bill as `status: 'voided'` with `voidReason: 'split-seat:<seat>'`.
4. Recalculate source and all target bills.
5. Create one `BILL_SPLIT` event per target bill (or one event with an array of targets — see §5).

**Grouping invariant:** every line in the source bill appears in exactly one target bill. Sum of target totals = original source total.

### 4.4 `mergeBills(sources: BillDoc[], actor, createdAt)`

```
Input:  sources (BillDoc[]), actorId, createdAt
Output: { mergedBill: BillDoc, events: OrderEventDoc[] }
```

Steps:
1. Collect all non-voided lines from all source bills.
2. Deduplicate lines: if two lines have the same `productId`, same `variantId`, same modifier set, same `note`, same `seat` → merge their quantities.
3. Merge discounts: keep all discounts from source bills, deduplicating by `reason` (first occurrence wins).
4. Merge surcharges similarly.
5. Create a new bill with all merged lines, discounts, surcharges.
6. For each source bill, create a `BILL_VOIDED`-equivalent event (mark source as voided with reason `merged-into:<targetBillId>`).
7. Create one `BILL_MERGED` event with payload:
   ```ts
   {
     sourceBillIds: string[],
     targetBillId: string,
     mergedLineCount: number,
     actorId: string,
     deviceId: string,
     sessionId: string,
   }
   ```

### 4.5 `transferTable(session, oldTableId, newTableId, actor, reason, createdAt)`

```
Input:  session (SessionDoc), oldTableId (string), newTableId (string), actorId, reason?, createdAt
Output: { session: SessionDoc, events: OrderEventDoc[] }
```

Steps:
1. Validate: both tables exist in the same area/branch (checked via repo).
2. Update `session.tableIds`: remove `oldTableId`, add `newTableId`.
3. Create `TABLE_TRANSFERRED` event with payload:
   ```ts
   {
     sessionId: string,
     fromTableId: string,
     toTableId: string,
     reason?: string,
     actorId: string,
     deviceId: string,
   }
   ```

### 4.6 `moveLines(sourceBill, lineIds, targetBillId, actor, createdAt)`

```
Input:  sourceBill (BillDoc), lineIds (string[]), targetBillId (string), actorId, createdAt
Output: { sourceBill: BillDoc, targetBill: BillDoc, events: OrderEventDoc[] }
```

Steps:
1. Find lines in source bill matching `lineIds`.
2. Clone them into target bill (deep copy).
3. Mark source lines as `voided` with `voidReason: 'moved-to:<targetBillId>'`.
4. Recalculate both bills.
5. Create one `BILL_SPLIT` event (reuse the same event type since the semantic is the same: moving lines from one bill to another).

---

## 5. Reducer Changes (`src/core/order/reducer.ts`)

The reducer gains three new case handlers:

```ts
case 'BILL_SPLIT': {
  // Creates a new bill, voids selected lines in the source, recalculates both
  break;
}
case 'BILL_MERGED': {
  // Creates a new merged bill, voids source bills, recalculates
  break;
}
case 'TABLE_TRANSFERRED': {
  // Updates session tableIds
  break;
}
```

Each handler follows the same pattern as existing events: clone state → mutate → recalculate → return new state.

---

## 6. Repository Changes (`src/core/order/order-repository.ts`)

Add methods:

```ts
interface SplitMergeRepository extends OrderRepository {
  /** Split one bill into two by selected line IDs */
  splitByItems(
    branchId: string,
    sourceSessionId: string,
    sourceBillId: string,
    lineIds: string[],
    actorId: string,
    deviceId: string
  ): Promise<{ sourceState: OrderAggregateState; targetState: OrderAggregateState }>;

  /** Split one bill into N equal-share bills */
  splitEvenly(
    branchId: string,
    sessionId: string,
    billId: string,
    parts: number,
    actorId: string,
    deviceId: string
  ): Promise<{ sourceState: OrderAggregateState; targetStates: OrderAggregateState[] }>;

  /** Split one bill into per-seat bills */
  splitBySeat(
    branchId: string,
    sessionId: string,
    billId: string,
    actorId: string,
    deviceId: string
  ): Promise<{ sourceState: OrderAggregateState; targetStates: OrderAggregateState[] }>;

  /** Merge multiple bills into one */
  mergeBills(
    branchId: string,
    sessionId: string,
    sourceBillIds: string[],
    actorId: string,
    deviceId: string
  ): Promise<{ mergedState: OrderAggregateState }>;

  /** Transfer a session to a different table */
  transferTable(
    branchId: string,
    sessionId: string,
    fromTableId: string,
    toTableId: string,
    actorId: string,
    reason?: string,
    deviceId: string
  ): Promise<OrderAggregateState>;

  /** Move specific lines from one bill to another */
  moveLines(
    branchId: string,
    sessionId: string,
    sourceBillId: string,
    lineIds: string[],
    targetBillId: string,
    actorId: string,
    deviceId: string
  ): Promise<{ sourceState: OrderAggregateState; targetState: OrderAggregateState }>;
}
```

Each method:
1. Computes the algorithmic result (pure functions from §4).
2. Calls `appendEvents()` with the new events.
3. Returns the resulting state(s).

---

## 7. Property Tests

Using `fast-check`, the following invariants are property-tested:

### TC1: `splitByItems` preserves total money
For any valid bill with ≥ 1 line: after `splitByItems(bill, nonEmptyLineSubset)`, `sourceBill.total + targetBill.total === originalBill.total`.

### TC2: `splitByItems` never loses or duplicates lines
For any valid bill: every line in the original bill is either `voided` (in source) or `placed` (in target). Count of `placed` lines across both bills equals original line count.

### TC3: `splitEvenly` preserves total money
For any valid bill with total > 0 and N ≥ 1: sum of all N bills' totals equals original total.

### TC4: `splitBySeat` preserves total money and seat coverage
For any bill where every line has a seat: sum of target bill totals = original total. Each target bill contains only lines for its seat.

### TC5: `mergeBills` preserves total money
For any two valid bills in the same session: merged bill total = sum of source totals.

### TC6: `mergeBills` then `splitByItems` round-trip
Merge two bills, then split by the original line IDs → recover original bills exactly.

### TC7: `moveLines` preserves total money
For any bill with ≥ 2 lines: after `moveLines(bill, subsetOfLines, targetBill)`, `sourceBill.total + targetBill.total === originalBill.total`.

---

## 8. File Plan

| File | Action |
|------|--------|
| `src/core/order/types.ts` | Add `BILL_SPLIT`, `BILL_MERGED`, `TABLE_TRANSFERRED` to `OrderEventType` |
| `src/core/order/events.ts` | Add TypeScript interfaces for new event payloads |
| `src/core/order/split-merge.ts` | **New file** — pure functions from §4 |
| `src/core/order/reducer.ts` | Add 3 new `case` handlers |
| `src/core/order/order-repository.ts` | Add 6 new methods to the interface and implementation |
| `src/core/order/__tests__/split-merge.test.ts` | **New file** — unit tests for each operation |
| `src/core/order/__tests__/split-merge-arbs.test.ts` | **New file** — fast-check property tests (TC1–TC7) |
| `src/i18n/vi.json`, `src/i18n/en.json` | Add M4 keys (see §9) |

---

## 9. i18n Keys

```json
// vi.json additions
{
  "pos.split": "Chia hoá đơn",
  "pos.split.byItem": "Chia theo món",
  "pos.split.evenly": "Chia đều",
  "pos.split.bySeat": "Chia theo ghế",
  "pos.merge.bills": "Gộp hoá đơn",
  "pos.transfer.table": "Chuyển bàn",
  "pos.move.lines": "Chuyển món",
  "pos.split.confirm": "Xác nhận chia",
  "pos.merge.confirm": "Xác nhận gộp",
  "pos.transfer.confirm": "Xác nhận chuyển bàn",
  "pos.split.lineMoved": "Đã chuyển sang hoá đơn khác",
  "pos.split.sourceBill": "Hoá đơn gốc",
  "pos.split.targetBill": "Hoá đơn mới",
  "pos.transfer.reason": "Lý do chuyển bàn"
}
```

Same keys added to `en.json`.

---

## 10. Constraints

- All new code is in `src/core/order/` — no Vue, no PouchDB, no Pinia.
- New event types follow the same append-only pattern as M3 events.
- `allocateEqual()` from `src/core/money-allocate.ts` is reused (already property-tested).
- The M3 acceptance test (`acceptance-m3.test.ts`) must still pass — no regressions.
- i18n parity test must still pass.

---

## 11. Approach Considered

**Single-event atomic operations (chosen):** Each split/merge/transfer is one `BILL_SPLIT` or `BILL_MERGED` or `TABLE_TRANSFERRED` event. The event payload contains all information needed to reconstruct both source and target states. This matches the existing event-sourcing pattern and avoids compounding conflicts across multiple events.

**Alternative (rejected):** Multiple events per operation (e.g., `LINE_MOVED` for each line, then `BILL_SPLIT` as a marker). Rejected because it increases the chance of partial-application conflicts during replication and makes state reconstruction more complex.

---

*End of design document.*
