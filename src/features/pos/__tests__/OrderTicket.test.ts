// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import OrderTicket from '../OrderTicket.vue';
import { money } from '../../../core/money';
import { createI18n } from 'vue-i18n';
import vi from '../../../i18n/vi.json';
import type { BillDoc, SessionDoc } from '../../../core/order/types';

describe('OrderTicket.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi } });

  const bill: BillDoc = {
    _id: 'bill:hq:b1',
    branchId: 'hq',
    sessionId: 'session:hq:s1',
    billNumber: 'HQ-T01-20261023-0001',
    paymentRef: 'POSHQT010001',
    status: 'draft',
    lines: [
      {
        lineId: 'l1',
        productId: 'p1',
        nameSnapshot: { vi: 'Phở bò', en: 'Pho' },
        unitPriceSnapshot: money(65000, 'VND'),
        qty: 2,
        modifiers: [],
        status: 'placed',
        addedAt: '2026-10-24T00:00:00.000Z',
      },
    ],
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: money(0, 'VND'),
    subtotal: money(130000, 'VND'),
    discountTotal: money(0, 'VND'),
    surchargeTotal: money(0, 'VND'),
    total: money(130000, 'VND'),
    payments: [],
    balanceRemaining: money(130000, 'VND'),
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
  };

  it('renders line items and total correctly', () => {
    const wrapper = mount(OrderTicket, {
      props: { bill, tableName: 'Bàn 1' },
      global: { plugins: [i18n] },
    });

    expect(wrapper.text()).toContain('Phở bò');
    expect(wrapper.text()).toContain('130.000');
  });

  it('emits checkout when clicking checkout button', async () => {
    const wrapper = mount(OrderTicket, {
      props: { bill, tableName: 'Bàn 1' },
      global: { plugins: [i18n] },
    });

    await wrapper.find('[data-test="checkout-btn"]').trigger('click');
    expect(wrapper.emitted('checkout')).toBeTruthy();
  });

  it('renders header with table name, session reference, and guest count badge', () => {
    const session: SessionDoc = {
      _id: 'session:hq:s1',
      branchId: 'hq',
      tableIds: ['table:hq:t1'],
      guestCount: 4,
      status: 'open',
      openedAt: '2026-10-24T00:00:00.000Z',
      openedBy: 'Thu ngân',
      billIds: ['bill:hq:b1'],
    };

    const wrapper = mount(OrderTicket, {
      props: { bill, session, tableName: 'Bàn 1 VIP' },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="table-name"]').text()).toContain('Bàn 1 VIP');
    expect(wrapper.find('[data-test="ticket-ref"]').text()).toContain('HQ-T01-20261023-0001');
    expect(wrapper.find('[data-test="guest-badge"]').text()).toContain('4');
  });

  it('renders fast sale label when tableName is omitted', () => {
    const wrapper = mount(OrderTicket, {
      props: { bill },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="table-name"]').text()).toContain('Bán nhanh');
  });

  it('renders variant, modifiers, and combo selections on line items', () => {
    const complexBill: BillDoc = {
      ...bill,
      lines: [
        {
          lineId: 'l1',
          productId: 'p1',
          nameSnapshot: { vi: 'Trà đào cam sả', en: 'Peach Tea' },
          unitPriceSnapshot: money(45000, 'VND'),
          variantId: 'var-l',
          variantNameSnapshot: 'Size L',
          modifiers: [
            {
              groupId: 'grp1',
              groupNameSnapshot: 'Topping',
              optionId: 'opt1',
              optionNameSnapshot: 'Trân châu trắng',
              priceDelta: money(10000, 'VND'),
            },
          ],
          comboSelections: [
            {
              groupKey: 'side_dish',
              optionIds: ['prod_snack1'],
            },
          ],
          qty: 1,
          status: 'placed',
          addedAt: '2026-10-24T00:00:00.000Z',
        },
      ],
      total: money(55000, 'VND'),
      subtotal: money(55000, 'VND'),
      balanceRemaining: money(55000, 'VND'),
    };

    const wrapper = mount(OrderTicket, {
      props: { bill: complexBill },
      global: { plugins: [i18n] },
    });

    expect(wrapper.text()).toContain('Trà đào cam sả');
    expect(wrapper.find('[data-test="line-variant"]').text()).toContain('Size L');
    expect(wrapper.find('[data-test="line-modifiers"]').text()).toContain('Topping');
    expect(wrapper.find('[data-test="line-modifiers"]').text()).toContain('Trân châu trắng');
    expect(wrapper.find('[data-test="line-modifiers"]').text()).toContain('10.000');
    expect(wrapper.find('[data-test="line-combos"]').exists()).toBe(true);
  });

  it('handles quantity increment and decrement steppers', async () => {
    const wrapper = mount(OrderTicket, {
      props: { bill },
      global: { plugins: [i18n] },
    });

    const incBtn = wrapper.find('[data-test="qty-increase-btn"]');
    await incBtn.trigger('click');
    expect(wrapper.emitted('update-qty')?.[0]).toEqual(['l1', 3]);

    const decBtn = wrapper.find('[data-test="qty-decrease-btn"]');
    await decBtn.trigger('click');
    expect(wrapper.emitted('update-qty')?.[1]).toEqual(['l1', 1]);
  });

  it('prevents quantity decrement below 1 and disables decrement button when qty is 1', async () => {
    const singleQtyBill: BillDoc = {
      ...bill,
      lines: [
        {
          ...bill.lines[0]!,
          qty: 1,
        },
      ],
    };

    const wrapper = mount(OrderTicket, {
      props: { bill: singleQtyBill },
      global: { plugins: [i18n] },
    });

    const decBtn = wrapper.find('[data-test="qty-decrease-btn"]');
    expect(decBtn.attributes('disabled')).toBeDefined();

    await decBtn.trigger('click');
    expect(wrapper.emitted('update-qty')).toBeFalsy();
  });

  it('allows setting line note via note prompt/dialog', async () => {
    const wrapper = mount(OrderTicket, {
      props: { bill },
      global: { plugins: [i18n] },
    });

    await wrapper.find('[data-test="line-note-btn"]').trigger('click');
    await nextTick();

    const noteInput = wrapper.find('[data-test="note-input"] input');
    expect(noteInput.exists()).toBe(true);
    await noteInput.setValue('Ít đường, nhiều đá');
    await nextTick();

    await wrapper.find('[data-test="save-note-btn"]').trigger('click');
    await nextTick();

    expect(wrapper.emitted('set-line-note')?.[0]).toEqual(['l1', 'Ít đường, nhiều đá']);
  });

  it('allows voiding line with reason via void prompt/dialog', async () => {
    const wrapper = mount(OrderTicket, {
      props: { bill },
      global: { plugins: [i18n] },
    });

    await wrapper.find('[data-test="line-void-btn"]').trigger('click');
    await nextTick();

    const reasonInput = wrapper.find('[data-test="void-reason-input"] input');
    expect(reasonInput.exists()).toBe(true);
    await reasonInput.setValue('Khách đổi ý');
    await nextTick();

    await wrapper.find('[data-test="confirm-void-btn"]').trigger('click');
    await nextTick();

    expect(wrapper.emitted('void-line')?.[0]).toEqual(['l1', 'Khách đổi ý']);
  });

  it('renders financial summary with discounts, surcharges, and tax lines', () => {
    const summaryBill: BillDoc = {
      ...bill,
      subtotal: money(200000, 'VND'),
      discounts: [{ type: 'percent', value: 10, reason: 'Khai trương' }],
      discountTotal: money(20000, 'VND'),
      surcharges: [{ type: 'service_charge', name: 'Phí phục vụ 5%', ratePercent: 5 }],
      surchargeTotal: money(9000, 'VND'),
      taxMode: 'exclusive',
      taxLines: [
        {
          rateId: 'vat10',
          label: { vi: 'VAT', en: 'VAT' },
          rate: 10,
          base: money(189000, 'VND'),
          amount: money(18900, 'VND'),
        },
      ],
      taxTotal: money(18900, 'VND'),
      total: money(207900, 'VND'),
      balanceRemaining: money(207900, 'VND'),
    };

    const wrapper = mount(OrderTicket, {
      props: { bill: summaryBill },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="ticket-subtotal"]').text()).toContain('200.000');
    expect(wrapper.find('[data-test="ticket-discount"]').text()).toContain('20.000');
    expect(wrapper.text()).toContain('Khai trương');
    expect(wrapper.find('[data-test="ticket-surcharge"]').text()).toContain('9.000');
    expect(wrapper.text()).toContain('Phí phục vụ 5%');
    expect(wrapper.find('[data-test="ticket-tax"]').text()).toContain('18.900');
    expect(wrapper.find('[data-test="ticket-total"]').text()).toContain('207.900');
    expect(wrapper.find('[data-test="ticket-balance"]').text()).toContain('207.900');
  });

  it('emits print-draft when print draft button is clicked', async () => {
    const wrapper = mount(OrderTicket, {
      props: { bill },
      global: { plugins: [i18n] },
    });

    await wrapper.find('[data-test="print-draft-btn"]').trigger('click');
    expect(wrapper.emitted('print-draft')).toBeTruthy();
  });

  it('renders empty state when bill has no lines', () => {
    const emptyBill: BillDoc = {
      ...bill,
      lines: [],
      subtotal: money(0, 'VND'),
      total: money(0, 'VND'),
      balanceRemaining: money(0, 'VND'),
    };

    const wrapper = mount(OrderTicket, {
      props: { bill: emptyBill },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="empty-ticket"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="checkout-btn"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="print-draft-btn"]').attributes('disabled')).toBeDefined();
  });

  it('renders voided line with voided badge and strikes it out', () => {
    const billWithVoided: BillDoc = {
      ...bill,
      lines: [
        {
          lineId: 'l1',
          productId: 'p1',
          nameSnapshot: { vi: 'Bún bò Huế', en: 'Bun bo Hue' },
          unitPriceSnapshot: money(60000, 'VND'),
          qty: 1,
          modifiers: [],
          status: 'voided',
          voidReason: 'Hết nguyên liệu',
          addedAt: '2026-10-24T00:00:00.000Z',
        },
      ],
    };

    const wrapper = mount(OrderTicket, {
      props: { bill: billWithVoided },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="voided-badge"]').text()).toContain('Hết nguyên liệu');
    // Steppers and action buttons for voided lines should be disabled
    expect(wrapper.find('[data-test="qty-increase-btn"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="qty-decrease-btn"]').attributes('disabled')).toBeDefined();
  });

  it('emits move-line event when move-line button clicked and target selected', async () => {
    const otherBill: BillDoc = {
      _id: 'bill:hq:b2',
      branchId: 'hq',
      sessionId: 'session:hq:s1',
      billNumber: 'HQ-T01-20261023-0002',
      paymentRef: 'POSHQT010002',
      status: 'draft',
      lines: [],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(40000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(40000, 'VND'),
      payments: [],
      balanceRemaining: money(40000, 'VND'),
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:00.000Z',
    };

    const wrapper = mount(OrderTicket, {
      props: { bill, session: { _id: 'session:hq:s1', branchId: 'hq', tableIds: ['table:hq:t1'], guestCount: 2, status: 'open', openedAt: '', openedBy: '', billIds: [] }, otherBills: [otherBill] },
      global: { plugins: [i18n] },
    });

    await wrapper.find('[data-test="line-move-btn"]').trigger('click');
    // Select the only target bill
    await wrapper.find('[data-test="move-line-target"]').trigger('click');
    await wrapper.find('[data-test="confirm-move-btn"]').trigger('click');

    expect(wrapper.emitted('move-line')).toBeTruthy();
    expect(wrapper.emitted('move-line')?.[0]).toEqual(['l1', 'bill:hq:b2']);
  });

  it('renders confirm-order-btn when bill has unconfirmed lines and emits confirm-order', async () => {
    const billWithUnconfirmed: BillDoc = {
      ...bill,
      lines: [
        {
          lineId: 'l1',
          productId: 'p1',
          nameSnapshot: { vi: 'Phở tái', en: 'Beef Pho' },
          unitPriceSnapshot: money(65000, 'VND'),
          qty: 2,
          modifiers: [],
          status: 'placed',
          kdsStatus: 'unconfirmed',
          addedAt: '2026-10-24T00:00:00.000Z',
        },
      ],
    };

    const wrapper = mount(OrderTicket, {
      props: { bill: billWithUnconfirmed },
      global: { plugins: [i18n] },
    });

    const confirmBtn = wrapper.find('[data-test="confirm-order-btn"]');
    expect(confirmBtn.exists()).toBe(true);
    expect(confirmBtn.text()).toContain('2');

    await confirmBtn.trigger('click');
    expect(wrapper.emitted('confirm-order')).toBeTruthy();
  });

  it('hides confirm-order-btn when all active lines are already confirmed', () => {
    const billAllConfirmed: BillDoc = {
      ...bill,
      lines: [
        {
          lineId: 'l1',
          productId: 'p1',
          nameSnapshot: { vi: 'Phở chín', en: 'Well-done Pho' },
          unitPriceSnapshot: money(65000, 'VND'),
          qty: 1,
          modifiers: [],
          status: 'placed',
          kdsStatus: 'pending',
          addedAt: '2026-10-24T00:00:00.000Z',
        },
      ],
    };

    const wrapper = mount(OrderTicket, {
      props: { bill: billAllConfirmed },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="confirm-order-btn"]').exists()).toBe(false);
  });

  it('renders line status badges for unconfirmed, pending, preparing, and ready', () => {
    const multiStatusBill: BillDoc = {
      ...bill,
      lines: [
        {
          lineId: 'l1',
          productId: 'p1',
          nameSnapshot: { vi: 'Món 1', en: 'Dish 1' },
          unitPriceSnapshot: money(50000, 'VND'),
          qty: 1,
          modifiers: [],
          status: 'placed',
          kdsStatus: 'unconfirmed',
          addedAt: '2026-10-24T00:00:00.000Z',
        },
        {
          lineId: 'l2',
          productId: 'p2',
          nameSnapshot: { vi: 'Món 2', en: 'Dish 2' },
          unitPriceSnapshot: money(50000, 'VND'),
          qty: 1,
          modifiers: [],
          status: 'placed',
          kdsStatus: 'pending',
          addedAt: '2026-10-24T00:00:00.000Z',
        },
        {
          lineId: 'l3',
          productId: 'p3',
          nameSnapshot: { vi: 'Món 3', en: 'Dish 3' },
          unitPriceSnapshot: money(50000, 'VND'),
          qty: 1,
          modifiers: [],
          status: 'placed',
          kdsStatus: 'preparing',
          addedAt: '2026-10-24T00:00:00.000Z',
        },
        {
          lineId: 'l4',
          productId: 'p4',
          nameSnapshot: { vi: 'Món 4', en: 'Dish 4' },
          unitPriceSnapshot: money(50000, 'VND'),
          qty: 1,
          modifiers: [],
          status: 'placed',
          kdsStatus: 'ready',
          addedAt: '2026-10-24T00:00:00.000Z',
        },
      ],
    };

    const wrapper = mount(OrderTicket, {
      props: { bill: multiStatusBill },
      global: { plugins: [i18n] },
    });

    const badges = wrapper.findAll('[data-test="line-status-badge"]');
    expect(badges.length).toBe(4);
    expect(badges[0]?.text()).toContain('Chờ gửi bếp');
    expect(badges[1]?.text()).toContain('Chờ làm');
    expect(badges[2]?.text()).toContain('Đang nấu');
    expect(badges[3]?.text()).toContain('Đã xong');
  });

  it('allows removing unconfirmed line without void dialog', async () => {
    const unconfirmedBill: BillDoc = {
      ...bill,
      lines: [
        {
          lineId: 'l1',
          productId: 'p1',
          nameSnapshot: { vi: 'Món nháp', en: 'Draft dish' },
          unitPriceSnapshot: money(40000, 'VND'),
          qty: 1,
          modifiers: [],
          status: 'placed',
          kdsStatus: 'unconfirmed',
          addedAt: '2026-10-24T00:00:00.000Z',
        },
      ],
    };

    const wrapper = mount(OrderTicket, {
      props: { bill: unconfirmedBill },
      global: { plugins: [i18n] },
    });

    const removeBtn = wrapper.find('[data-test="line-remove-draft-btn"]');
    expect(removeBtn.exists()).toBe(true);
    await removeBtn.trigger('click');
    expect(wrapper.emitted('remove-line')?.[0]).toEqual(['l1']);
  });
});
