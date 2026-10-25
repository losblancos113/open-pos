// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import CrossBranchReportModal from '../CrossBranchReportModal.vue';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { createBranchRepository } from '@/core/branch/branch-repository';
import { money } from '@/core/money';
import type { BillDoc } from '@/core/order/types';
import { createI18n } from 'vue-i18n';
import viMessages from '@/i18n/vi.json';

describe('CrossBranchReportModal.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi: viMessages } });
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders report metrics when opened with adapter and repo', async () => {
    const adapter = await createMemoryAdapter();
    const branchRepo = createBranchRepository(adapter);
    await branchRepo.createBranch({ code: 'HQ', name: 'Trụ sở chính' });

    const bill: BillDoc = {
      _id: 'bill:hq:b1',
      branchId: 'hq',
      sessionId: 'session:hq:s1',
      billNumber: 'HQ-001',
      paymentRef: 'P1',
      status: 'paid',
      lines: [],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(150000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(150000, 'VND'),
      payments: [],
      balanceRemaining: money(0, 'VND'),
      createdAt: '2026-10-25T10:00:00.000Z',
      updatedAt: '2026-10-25T10:00:00.000Z',
      paidAt: '2026-10-25T10:00:00.000Z',
    };
    await adapter.put(bill);

    wrapper = mount(CrossBranchReportModal, {
      props: { open: true, adapter, branchRepo },
      global: { plugins: [i18n] },
    });

    await new Promise((r) => setTimeout(r, 30));

    expect(wrapper.find('[data-test="close-report-btn"]').exists()).toBe(true);
    expect(wrapper.html()).toContain('150.000');
  });
});
