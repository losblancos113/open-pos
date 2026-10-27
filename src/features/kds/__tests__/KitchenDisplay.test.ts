// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import KitchenDisplay from '../KitchenDisplay.vue';
import { createMemoryAdapter } from '../../../core/db/memory-adapter';
import { createOrderRepository } from '../../../core/order/order-repository';
import { money } from '../../../core/money';
import type { BillDoc, SessionDoc } from '../../../core/order/types';
import { createI18n } from 'vue-i18n';
import vi from '../../../i18n/vi.json';

describe('KitchenDisplay.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi } });
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    localStorage.clear();
  });

  it('renders KDS dashboard with station filters, empty state when no orders, and stats', async () => {
    const adapter = await createMemoryAdapter();
    wrapper = mount(KitchenDisplay, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    await nextTick();
    await new Promise((r) => setTimeout(r, 20));
    await nextTick();

    expect(wrapper.find('[data-test="kds-screen"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="station-filters"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="kds-empty-state"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="kds-stats"]').text()).toContain('0');
  });

  it('displays active ticket cards with table name, aging badge, items, and note', async () => {
    const adapter = await createMemoryAdapter();
    const repo = createOrderRepository(adapter);

    await repo.saveArea({
      _id: 'area:hq:a1',
      branchId: 'hq',
      name: 'Tầng 1',
      sortOrder: 1,
      createdAt: '2026-10-24T00:00:00.000Z',
    });
    await repo.saveTable({
      _id: 'table:hq:t1',
      branchId: 'hq',
      areaId: 'area:hq:a1',
      code: 'B01',
      name: 'Bàn 1 VIP',
      capacity: 4,
      sortOrder: 1,
      createdAt: '2026-10-24T00:00:00.000Z',
    });

    const session: SessionDoc = {
      _id: 'session:hq:s1',
      branchId: 'hq',
      tableIds: ['table:hq:t1'],
      guestCount: 3,
      status: 'open',
      openedAt: new Date(Date.now() - 5 * 60000).toISOString(), // 5 mins ago
      openedBy: 'cashier1',
      billIds: ['bill:hq:b1'],
    };

    const bill: BillDoc = {
      _id: 'bill:hq:b1',
      branchId: 'hq',
      sessionId: session._id,
      billNumber: 'HQ-T01-0001',
      paymentRef: 'REF0001',
      status: 'placed',
      lines: [
        {
          lineId: 'l1',
          productId: 'p1',
          nameSnapshot: { vi: 'Phở đặc biệt', en: 'Special Pho' },
          unitPriceSnapshot: money(75000, 'VND'),
          qty: 2,
          modifiers: [],
          note: 'Không hành tây',
          status: 'placed',
          addedAt: new Date(Date.now() - 5 * 60000).toISOString(),
        },
        {
          lineId: 'l2',
          productId: 'p2',
          nameSnapshot: { vi: 'Trà đào cam sả', en: 'Peach Tea' },
          unitPriceSnapshot: money(35000, 'VND'),
          qty: 1,
          modifiers: [],
          status: 'placed',
          addedAt: new Date(Date.now() - 5 * 60000).toISOString(),
        },
      ],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(185000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(185000, 'VND'),
      payments: [],
      balanceRemaining: money(185000, 'VND'),
      createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await repo.appendEvents('hq', session._id, [
      {
        eventId: 'ev-1',
        type: 'LINE_ADDED',
        sessionId: session._id,
        billId: bill._id,
        actorId: 'c1',
        deviceId: 'T01',
        payload: bill.lines[0],
        createdAt: bill.lines[0]!.addedAt,
        schemaVersion: 1,
      },
      {
        eventId: 'ev-2',
        type: 'LINE_ADDED',
        sessionId: session._id,
        billId: bill._id,
        actorId: 'c1',
        deviceId: 'T01',
        payload: bill.lines[1],
        createdAt: bill.lines[1]!.addedAt,
        schemaVersion: 1,
      },
    ], { session, bill });

    wrapper = mount(KitchenDisplay, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    await nextTick();
    await new Promise((r) => setTimeout(r, 40));
    await nextTick();

    expect(wrapper.find('[data-test="kds-empty-state"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="ticket-grid"]').exists()).toBe(true);

    const ticketCard = wrapper.find('[data-test="kds-ticket-card"]');
    expect(ticketCard.exists()).toBe(true);
    expect(ticketCard.text()).toContain('Bàn 1 VIP');
    expect(ticketCard.text()).toContain('Phở đặc biệt');
    expect(ticketCard.text()).toContain('Trà đào cam sả');
    expect(ticketCard.text()).toContain('Không hành tây');

    // Aging badge
    expect(wrapper.find('[data-test="ticket-aging-badge"]').text()).toContain('5\'');
  });

  it('filters tickets by station (hot kitchen vs bar)', async () => {
    const adapter = await createMemoryAdapter();
    const repo = createOrderRepository(adapter);

    const session: SessionDoc = {
      _id: 'session:hq:s1',
      branchId: 'hq',
      tableIds: [],
      guestCount: 1,
      status: 'open',
      openedAt: new Date().toISOString(),
      openedBy: 'c1',
      billIds: ['bill:hq:b1'],
    };

    const bill: BillDoc = {
      _id: 'bill:hq:b1',
      branchId: 'hq',
      sessionId: session._id,
      billNumber: 'HQ-T01-0002',
      paymentRef: 'REF0002',
      status: 'placed',
      lines: [
        {
          lineId: 'l1',
          productId: 'p1',
          nameSnapshot: { vi: 'Bún chả', en: 'Bun cha' },
          unitPriceSnapshot: money(60000, 'VND'),
          qty: 1,
          modifiers: [],
          status: 'placed',
          addedAt: new Date().toISOString(),
        },
        {
          lineId: 'l2',
          productId: 'p2',
          nameSnapshot: { vi: 'Cà phê đen đá', en: 'Iced Black Coffee' },
          unitPriceSnapshot: money(25000, 'VND'),
          qty: 1,
          modifiers: [],
          status: 'placed',
          addedAt: new Date().toISOString(),
        },
      ],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(85000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(85000, 'VND'),
      payments: [],
      balanceRemaining: money(85000, 'VND'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await repo.appendEvents('hq', session._id, [
      {
        eventId: 'ev-1',
        type: 'LINE_ADDED',
        sessionId: session._id,
        billId: bill._id,
        actorId: 'c1',
        deviceId: 'T01',
        payload: bill.lines[0],
        createdAt: bill.lines[0]!.addedAt,
        schemaVersion: 1,
      },
      {
        eventId: 'ev-2',
        type: 'LINE_ADDED',
        sessionId: session._id,
        billId: bill._id,
        actorId: 'c1',
        deviceId: 'T01',
        payload: bill.lines[1],
        createdAt: bill.lines[1]!.addedAt,
        schemaVersion: 1,
      },
    ], { session, bill });

    wrapper = mount(KitchenDisplay, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    await nextTick();
    await new Promise((r) => setTimeout(r, 40));
    await nextTick();

    // 1. All station shows both items
    expect(wrapper.text()).toContain('Bún chả');
    expect(wrapper.text()).toContain('Cà phê đen đá');

    // 2. Click Bar station -> only coffee is shown
    await wrapper.find('[data-test="station-bar"]').trigger('click');
    await nextTick();
    expect(wrapper.text()).toContain('Cà phê đen đá');
    expect(wrapper.text()).not.toContain('Bún chả');

    // 3. Click Kitchen station -> only bun cha is shown
    await wrapper.find('[data-test="station-kitchen"]').trigger('click');
    await nextTick();
    expect(wrapper.text()).toContain('Bún chả');
    expect(wrapper.text()).not.toContain('Cà phê đen đá');
  });

  it('bumps line items, moves them to recall list, and recalls them', async () => {
    const adapter = await createMemoryAdapter();
    const repo = createOrderRepository(adapter);

    const session: SessionDoc = {
      _id: 'session:hq:s1',
      branchId: 'hq',
      tableIds: [],
      guestCount: 1,
      status: 'open',
      openedAt: new Date().toISOString(),
      openedBy: 'c1',
      billIds: ['bill:hq:b1'],
    };

    const bill: BillDoc = {
      _id: 'bill:hq:b1',
      branchId: 'hq',
      sessionId: session._id,
      billNumber: 'HQ-T01-0003',
      paymentRef: 'REF0003',
      status: 'placed',
      lines: [
        {
          lineId: 'l1',
          productId: 'p1',
          nameSnapshot: { vi: 'Mì Quảng', en: 'Quang Noodle' },
          unitPriceSnapshot: money(55000, 'VND'),
          qty: 1,
          modifiers: [],
          status: 'placed',
          addedAt: new Date().toISOString(),
        },
      ],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(55000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(55000, 'VND'),
      payments: [],
      balanceRemaining: money(55000, 'VND'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await repo.appendEvents('hq', session._id, [
      {
        eventId: 'ev-1',
        type: 'LINE_ADDED',
        sessionId: session._id,
        billId: bill._id,
        actorId: 'c1',
        deviceId: 'T01',
        payload: bill.lines[0],
        createdAt: bill.lines[0]!.addedAt,
        schemaVersion: 1,
      },
    ], { session, bill });

    wrapper = mount(KitchenDisplay, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    await nextTick();
    await new Promise((r) => setTimeout(r, 40));
    await nextTick();

    expect(wrapper.text()).toContain('Mì Quảng');

    // Bump the line item
    await wrapper.find('[data-test="bump-line-btn"]').trigger('click');
    await nextTick();
    await new Promise((r) => setTimeout(r, 30));
    await nextTick();

    // Since the only line was bumped, the ticket is now completed (empty state)
    expect(wrapper.find('[data-test="kds-empty-state"]').exists()).toBe(true);

    // Open recall modal
    await wrapper.find('[data-test="recall-modal-btn"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="recall-modal"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="recalled-row"]').text()).toContain('Mì Quảng');

    // Click recall button
    await wrapper.find('[data-test="recall-btn"]').trigger('click');
    await nextTick();
    await new Promise((r) => setTimeout(r, 30));
    await nextTick();

    // The item should be restored back to the board
    expect(wrapper.find('[data-test="kds-empty-state"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Mì Quảng');
  });
});
