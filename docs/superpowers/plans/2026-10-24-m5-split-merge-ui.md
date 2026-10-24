# M5 — Split / Merge / Transfer UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build POS UI dialogs for split bill, merge bills, transfer table, and move lines operations — integrating with the M4 repository methods.

**Architecture:** Extends the existing `PosTerminal` component and `OrderTicket` component. Three new modal dialogs (Split Bill, Merge Bills, Transfer Table) plus inline bill selection. All UI is in `src/features/pos/` using Vuetify0 components (`Dialog`, `Select`, `Combobox`, `Button`, `Input`, `NumberField`). State management uses local `ref`/`computed` with `useI18n` for translations. The M4 `OrderRepository` methods handle all domain logic.

**Tech Stack:** Vue 3 + TypeScript strict, Vuetify0 `@vuetify/v0`, UnoCSS, vue-i18n, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-10-24-m4-split-merge-transfer-design.md`

## Prerequisites

- M4 core logic (split/merge/transfer functions, repository methods, reducer handlers) must be complete.
- i18n keys `pos.split.*`, `pos.merge.*`, `pos.transfer.*`, `pos.move.*` must exist in both `vi.json` and `en.json`.

---

## Global Constraints

- All UI code uses Vuetify0 components (`@vuetify/v0`), imported as `@vuetify/v0`.
- Vuetify0 is headless — use UnoCSS with design tokens for styling.
- TypeScript strict mode: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`.
- Money is `Money` type (minor units integer + currency) — never a float.
- All dialogs must be modal (Vuetify0 `Dialog.Root` with `Dialog.Content`).
- No hard-coded strings — use `t('...')` for all user-visible text.
- Follow existing patterns in `PosTerminal.vue`, `OrderTicket.vue`, `PaymentModal.vue`.

---

## Review Focus

1. **Split bill with all lines selected** — should show empty source bill with 0 total, target bill with all lines; verify "Split" button is disabled when no lines or all lines selected.
2. **Split by seat with unseated lines** — unseated lines go to an "Unassigned" bill; verify total money conservation.
3. **Merge bills with payments** — merged bill must carry forward all payments; balance calculation correct.
4. **Transfer table when table already occupied** — should either prevent transfer or show warning; verify tableIds updated correctly.
5. **Mobile responsiveness** — dialogs must render correctly on small screens (mobile POS devices).

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/features/pos/SplitBillDialog.vue` | Create | Modal for split by item / evenly / by seat |
| `src/features/pos/MergeBillsDialog.vue` | Create | Modal for merging 2+ bills into one |
| `src/features/pos/TransferTableDialog.vue` | Create | Modal for moving session to different table |
| `src/features/pos/BillMenuItem.vue` | Create | Inline action menu on bill (split, merge, transfer) |
| `src/features/pos/__tests__/SplitBillDialog.test.ts` | Create | Unit tests for split dialog |
| `src/features/pos/__tests__/MergeBillsDialog.test.ts` | Create | Unit tests for merge dialog |
| `src/features/pos/__tests__/TransferTableDialog.test.ts` | Create | Unit tests for transfer dialog |
| `src/features/pos/__tests__/BillMenuItem.test.ts` | Create | Unit tests for bill menu |

---

## Task 1: BillMenuItem component — inline actions on bill detail

**Files:**
- Create: `src/features/pos/BillMenuItem.vue`
- Test: `src/features/pos/__tests__/BillMenuItem.test.ts`

**Interfaces:**
- Consumes: `BillDoc`, emits `split`, `merge`, `transfer` events
- Produces: Three action buttons in a dropdown/menu layout

- [ ] **Step 1: Write the failing test**

```ts
// src/features/pos/__tests__/BillMenuItem.test.ts
import { mount } from '@vue/test-utils';
import BillMenuItem from '../BillMenuItem.vue';
import { createMemoryAdapter } from '@/core/db/adapter';

describe('BillMenuItem.vue', () => {
  it('renders split, merge, transfer buttons', () => {
    const bill = {
      _id: 'bill:hq:b1',
      branchId: 'hq',
      sessionId: 'session:hq:s1',
      billNumber: 'HQ-T01-0001',
      status: 'placed',
      lines: [{ lineId: 'l1', productId: 'p1', nameSnapshot: { vi: 'A', en: 'A' }, unitPriceSnapshot: { minor: 50000, currency: 'VND' }, qty: 1, modifiers: [], status: 'placed', addedAt: '' }],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: { minor: 0, currency: 'VND' },
      subtotal: { minor: 50000, currency: 'VND' },
      discountTotal: { minor: 0, currency: 'VND' },
      surchargeTotal: { minor: 0, currency: 'VND' },
      total: { minor: 50000, currency: 'VND' },
      payments: [],
      balanceRemaining: { minor: 50000, currency: 'VND' },
      createdAt: '',
      updatedAt: '',
    };
    const wrapper = mount(BillMenuItem, {
      props: { bill, session: { _id: 's1', tableIds: ['t1'], guestCount: 2, status: 'open', openedAt: '', openedBy: '', billIds: [bill._id] } },
    });
    expect(wrapper.find('[data-test="split-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="merge-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="transfer-btn"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/pos/__tests__/BillMenuItem.test.ts -v`
Expected: FAIL — component not defined

- [ ] **Step 3: Create `BillMenuItem.vue`**

Create the component with:
- Three Vuetify0 `Button.Root` elements for Split, Merge, Transfer
- Use `Dialog.Root` for confirmation where needed
- Emit appropriate events: `split`, `merge-bills`, `transfer-table`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/pos/__tests__/BillMenuItem.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/pos/BillMenuItem.vue src/features/pos/__tests__/BillMenuItem.test.ts
git commit -m "feat(pos): add BillMenuItem component for split/merge/transfer actions"
```

---

### Task 2: SplitBillDialog component — split by item, evenly, or by seat

**Files:**
- Create: `src/features/pos/SplitBillDialog.vue`
- Test: `src/features/pos/__tests__/SplitBillDialog.test.ts`

**Interfaces:**
- Consumes: `BillDoc` with lines, `OrderRepository` for operations
- Produces: Three split mode tabs; line selection checkboxes; confirmation button

- [ ] **Step 1: Write the failing test**

```ts
// src/features/pos/__tests__/SplitBillDialog.test.ts
import { mount } from '@vue/test-utils';
import SplitBillDialog from '../SplitBillDialog.vue';

describe('SplitBillDialog.vue', () => {
  const bill = {
    _id: 'bill:hq:b1',
    branchId: 'hq',
    sessionId: 'session:hq:s1',
    billNumber: 'HQ-T01-0001',
    status: 'placed',
    lines: [
      { lineId: 'l1', productId: 'p1', nameSnapshot: { vi: 'Phở', en: 'Pho' }, unitPriceSnapshot: { minor: 50000, currency: 'VND' }, qty: 1, modifiers: [], status: 'placed', addedAt: '', seat: 1 },
      { lineId: 'l2', productId: 'p2', nameSnapshot: { vi: 'Cà phê', en: 'Coffee' }, unitPriceSnapshot: { minor: 20000, currency: 'VND' }, qty: 1, modifiers: [], status: 'placed', addedAt: '', seat: 2 },
    ],
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: { minor: 0, currency: 'VND' },
    subtotal: { minor: 70000, currency: 'VND' },
    discountTotal: { minor: 0, currency: 'VND' },
    surchargeTotal: { minor: 0, currency: 'VND' },
    total: { minor: 70000, currency: 'VND' },
    payments: [],
    balanceRemaining: { minor: 70000, currency: 'VND' },
    createdAt: '',
    updatedAt: '',
  };

  it('renders split mode tabs', () => {
    const wrapper = mount(SplitBillDialog, { props: { bill, open: true } });
    expect(wrapper.find('[data-test="split-by-item"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="split-evenly"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="split-by-seat"]').exists()).toBe(true);
  });

  it('shows line checkboxes in item split mode', () => {
    const wrapper = mount(SplitBillDialog, { props: { bill, open: true } });
    expect(wrapper.findAll('[data-test="line-checkbox"]')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/pos/__tests__/SplitBillDialog.test.ts -v`
Expected: FAIL — component not defined

- [ ] **Step 3: Create `SplitBillDialog.vue`**

Implementation details:
1. **Split by item tab**: Checkbox list of all placed lines; select which lines to move; show target bill preview; confirm button triggers `splitByItems()`
2. **Split evenly tab**: Input field for number of parts; preview allocation; confirm triggers `splitEvenly()`
3. **Split by seat tab**: Show seat groups; each group gets own bill; confirm triggers `splitBySeat()`
4. Use Vuetify0 `Dialog.Root`, `Select.Root`, `Button.Root`
5. Use `useI18n` for all labels and messages
6. Disable "Confirm" until selection/operation configured

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/pos/__tests__/SplitBillDialog.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/pos/SplitBillDialog.vue src/features/pos/__tests__/SplitBillDialog.test.ts
git commit -m "feat(pos): add SplitBillDialog for split-by-item/evenly/seat operations"
```

---

### Task 3: MergeBillsDialog component — merge multiple bills into one

**Files:**
- Create: `src/features/pos/MergeBillsDialog.vue`
- Test: `src/features/pos/__tests__/MergeBillsDialog.test.ts`

**Interfaces:**
- Consumes: Array of `BillDoc` with active status, `OrderRepository` for merge operation
- Produces: List of selectable bills; merge button; preview of merged total

- [ ] **Step 1: Write the failing test**

```ts
// src/features/pos/__tests__/MergeBillsDialog.test.ts
import { mount } from '@vue/test-utils';
import MergeBillsDialog from '../MergeBillsDialog.vue';

describe('MergeBillsDialog.vue', () => {
  const bills = [
    {
      _id: 'bill:hq:b1',
      branchId: 'hq',
      sessionId: 'session:hq:s1',
      billNumber: 'HQ-T01-0001',
      status: 'placed',
      lines: [{ lineId: 'l1', productId: 'p1', nameSnapshot: { vi: 'A', en: 'A' }, unitPriceSnapshot: { minor: 50000, currency: 'VND' }, qty: 1, modifiers: [], status: 'placed', addedAt: '' }],
      discounts: [], surcharges: [], taxMode: 'inclusive', taxLines: [],
      taxTotal: { minor: 0, currency: 'VND' }, subtotal: { minor: 50000, currency: 'VND' },
      discountTotal: { minor: 0, currency: 'VND' }, surchargeTotal: { minor: 0, currency: 'VND' },
      total: { minor: 50000, currency: 'VND' }, payments: [], balanceRemaining: { minor: 50000, currency: 'VND' },
      createdAt: '', updatedAt: '',
    },
    {
      _id: 'bill:hq:b2',
      branchId: 'hq',
      sessionId: 'session:hq:s1',
      billNumber: 'HQ-T01-0002',
      status: 'placed',
      lines: [{ lineId: 'l2', productId: 'p2', nameSnapshot: { vi: 'B', en: 'B' }, unitPriceSnapshot: { minor: 30000, currency: 'VND' }, qty: 1, modifiers: [], status: 'placed', addedAt: '' }],
      discounts: [], surcharges: [], taxMode: 'inclusive', taxLines: [],
      taxTotal: { minor: 0, currency: 'VND' }, subtotal: { minor: 30000, currency: 'VND' },
      discountTotal: { minor: 0, currency: 'VND' }, surchargeTotal: { minor: 0, currency: 'VND' },
      total: { minor: 30000, currency: 'VND' }, payments: [], balanceRemaining: { minor: 30000, currency: 'VND' },
      createdAt: '', updatedAt: '',
    },
  ];

  it('renders list of bills to merge', () => {
    const wrapper = mount(MergeBillsDialog, { props: { bills, open: true } });
    expect(wrapper.findAll('[data-test="bill-checkbox"]')).toHaveLength(2);
  });

  it('calculates merged total correctly', () => {
    const wrapper = mount(MergeBillsDialog, { props: { bills, open: true } });
    expect(wrapper.find('[data-test="merged-total"]').text()).toContain('80.000đ');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/pos/__tests__/MergeBillsDialog.test.ts -v`
Expected: FAIL — component not defined

- [ ] **Step 3: Create `MergeBillsDialog.vue`**

Implementation details:
1. Show list of bills with their totals
2. Checkboxes to select which bills to merge (minimum 2)
3. Calculate and show merged total preview
4. Confirm button triggers `mergeBills()` repository method
5. Disable if fewer than 2 bills selected

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/pos/__tests__/MergeBillsDialog.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/pos/MergeBillsDialog.vue src/features/pos/__tests__/MergeBillsDialog.test.ts
git commit -m "feat(pos): add MergeBillsDialog for merging multiple bills"
```

---

### Task 4: TransferTableDialog component — move session to different table

**Files:**
- Create: `src/features/pos/TransferTableDialog.vue`
- Test: `src/features/pos/__tests__/TransferTableDialog.test.ts`

**Interfaces:**
- Consumes: `SessionDoc` with `tableIds`, list of available `TableDoc`
- Produces: Dropdown of target tables; reason input; transfer button

- [ ] **Step 1: Write the failing test**

```ts
// src/features/pos/__tests__/TransferTableDialog.test.ts
import { mount } from '@vue/test-utils';
import TransferTableDialog from '../TransferTableDialog.vue';

describe('TransferTableDialog.vue', () => {
  const session = {
    _id: 'session:hq:s1',
    branchId: 'hq',
    tableIds: ['table:hq:t1'],
    guestCount: 2,
    status: 'open',
    openedAt: '',
    openedBy: '',
    billIds: [],
  };

  const tables = [
    { _id: 'table:hq:t1', branchId: 'hq', areaId: 'area:hq:a1', code: 'T1', name: 'Bàn 1', capacity: 4, sortOrder: 1, createdAt: '' },
    { _id: 'table:hq:t2', branchId: 'hq', areaId: 'area:hq:a1', code: 'T2', name: 'Bàn 2', capacity: 4, sortOrder: 2, createdAt: '' },
  ];

  it('renders table selection dropdown', () => {
    const wrapper = mount(TransferTableDialog, {
      props: { session, tables, open: true, currentTableId: 'table:hq:t1' },
    });
    expect(wrapper.find('[data-test="target-table-select"]').exists()).toBe(true);
  });

  it('excludes current table from options', () => {
    const wrapper = mount(TransferTableDialog, {
      props: { session, tables, open: true, currentTableId: 'table:hq:t1' },
    });
    const options = wrapper.findAll('[data-test="table-option"]');
    expect(options.length).toBe(1);
    expect(options[0]?.attributes('value')).toBe('table:hq:t2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/pos/__tests__/TransferTableDialog.test.ts -v`
Expected: FAIL — component not defined

- [ ] **Step 3: Create `TransferTableDialog.vue`**

Implementation details:
1. Show current table info
2. Dropdown to select target table (excludes current table)
3. Optional text input for reason
4. Confirm button triggers `transferTable()` repository method
5. Show warning if target table already has active session (or disable option)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/pos/__tests__/TransferTableDialog.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/pos/TransferTableDialog.vue src/features/pos/__tests__/TransferTableDialog.test.ts
git commit -m "feat(pos): add TransferTableDialog for moving session to different table"
```

---

### Task 5: Integrate actions into PosTerminal.vue

**Files:**
- Modify: `src/features/pos/PosTerminal.vue`
- Modify: `src/features/pos/__tests__/PosTerminal.test.ts`

**Interfaces:**
- Consumes: `BillMenuItem`, `SplitBillDialog`, `MergeBillsDialog`, `TransferTableDialog`
- Produces: Wire up events from `BillMenuItem` to open appropriate dialogs

- [ ] **Step 1: Write the failing test**

Add to `PosTerminal.test.ts`:
```ts
it('opens split bill dialog when split button clicked', async () => {
  const wrapper = mount(PosTerminal, { props: { bill, session, adapter } });
  await wrapper.find('[data-test="split-btn"]').trigger('click');
  expect(wrapper.findComponent(SplitBillDialog).props('open')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/pos/__tests__/PosTerminal.test.ts -v`
Expected: FAIL — dialogs not integrated

- [ ] **Step 3: Import and wire up dialog components**

1. Import `SplitBillDialog`, `MergeBillsDialog`, `TransferTableDialog`, `BillMenuItem`
2. Add `ref` state for each dialog's `open` property
3. Wire `BillMenuItem` events to open dialogs
4. Wire dialog confirm events to call repository methods

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/pos/__tests__/PosTerminal.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/pos/PosTerminal.vue src/features/pos/__tests__/PosTerminal.test.ts
git commit -m "feat(pos): integrate split/merge/transfer dialogs into PosTerminal"
```

---

### Task 6: Add move lines inline action on OrderTicket

**Files:**
- Modify: `src/features/pos/OrderTicket.vue`
- Modify: `src/features/pos/__tests__/OrderTicket.test.ts`

**Interfaces:**
- Consumes: `BillDoc` with multiple bills in session
- Produces: "Move to another bill" option on line action menu

- [ ] **Step 1: Write the failing test**

Add to `OrderTicket.test.ts`:
```ts
it('emits move-line event when move line button clicked', async () => {
  const wrapper = mount(OrderTicket, { props: { bill } });
  await wrapper.find('[data-test="line-move-btn"]').trigger('click');
  expect(wrapper.emitted('move-line')).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/pos/__tests__/OrderTicket.test.ts -v`
Expected: FAIL — move line button not implemented

- [ ] **Step 3: Add move line UI to OrderTicket.vue**

Implementation details:
1. Add "Move line" button to line action area (next to Note, Void buttons)
2. When clicked, open a selection of other bills in the session
3. User selects target bill, confirm moves lines via `moveLines()` repository method

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/pos/__tests__/OrderTicket.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/pos/OrderTicket.vue src/features/pos/__tests__/OrderTicket.test.ts
git commit -m "feat(pos): add move line action to OrderTicket"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: All 120+ tests pass (including new tests for M5 components)

- [ ] **Step 2: Run TypeScript type check**

Run: `npx vue-tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run linter**

Run: `npm run lint` (if exists) or equivalent
Expected: No linting errors

- [ ] **Step 4: Manual verification (optional)**

Run: `npm run dev` and test the split/merge/transfer flows manually

- [ ] **Step 5: Commit any fixes**

If any issues are found, fix and commit with `fix(pos): address M5 verification findings`.

---

## Post-Implementation Plan

After M5 completion:
1. Update `docs/superpowers/specs/` with UI interaction designs
2. Add integration tests that spawn hub and test end-to-end flows
3. Consider accessibility audit for dialog interactions
4. Plan M6 features (analytics dashboard, shift management)

---

## Implementation Notes

### Vuetify0 Components to Use

Per AGENTS.md 4.8, use these Vuetify0 headless primitives:

| Need | Use |
|------|-----|
| Modal dialog | `Dialog.Root` + `Dialog.Content` |
| Selection dropdown | `Select.Root` + `Select.Activator` + `Select.Content` |
| Searchable select | `Combobox.Root` |
| Buttons | `Button.Root` |
| Checkbox for line selection | `Checkbox.Root` |
| Text input | `Input.Root` + `Input.Control` |
| Number input | `NumberField.Root` |
| Tabs | `TabGroup` from Vuetify0 (or build custom with ` Tabs` component pattern) |

### State Management Pattern

Follow the existing pattern in `PosTerminal.vue`:
1. Local `ref` state for dialog open/close
2. Props pass bill/session data down
3. Events bubble up actions to parent
4. Repository methods called from parent, not in components

### Dialog Layout Pattern

Each dialog follows this structure:
```vue
<Dialog.Root v-model="isOpen">
  <Dialog.Content class="panel-card max-w-md w-full p-4">
    <Dialog.Title>{{ t('pos.split.title') }}</Dialog.Title>
    <!-- Dialog body: tabs, lists, forms -->
    <Dialog.Trigger as="template">
      <Button.Root type="button" class="btn btn-primary" :disabled="!canConfirm">
        {{ t('pos.split.confirm') }}
      </Button.Root>
    </Dialog.Trigger>
  </Dialog.Content>
</Dialog.Root>
```

---

*End of implementation plan.*