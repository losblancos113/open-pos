import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import {
  getBillingSettings,
  saveBillingSettings,
  createDefaultBillingSettings,
  BILLING_SETTINGS_DOC_TYPE,
  DEFAULT_BILLING_SETTINGS_CONFIG,
} from '../billing-settings';
import { canConfigureBilling } from '../../auth/permissions';
import { createOrderRepository } from '../order-repository';

describe('billing-settings core domain', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;
  const branchId = 'branch_d1';

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
  });

  it('returns default billing settings when no record exists for branch', async () => {
    const settings = await getBillingSettings(adapter, branchId);

    expect(settings._id).toBe(`billing_settings:${branchId}`);
    expect(settings.branchId).toBe(branchId);
    expect(settings.docType).toBe(BILLING_SETTINGS_DOC_TYPE);
    expect(settings.discountEnabled).toBe(true);
    expect(settings.surchargeEnabled).toBe(true);
    expect(settings.taxEnabled).toBe(true);
    expect(settings.defaultTaxRate).toBe(10);
    expect(settings.taxMode).toBe('inclusive');
    expect(settings.autoApplyTax).toBe(false);
    expect(settings.allowManualTaxToggle).toBe(true);
  });

  it('persists and retrieves updated billing settings', async () => {
    const defaults = createDefaultBillingSettings(branchId);
    const updated = {
      ...defaults,
      discountEnabled: false,
      surchargeEnabled: true,
      defaultSurchargeName: 'Phụ thu lễ',
      defaultSurchargeRate: 15,
      taxEnabled: true,
      defaultTaxRate: 8,
      taxMode: 'exclusive' as const,
      autoApplyTax: true,
      updatedBy: 'manager_01',
    };

    const saved = await saveBillingSettings(adapter, updated);
    expect(saved.discountEnabled).toBe(false);
    expect(saved.defaultTaxRate).toBe(8);
    expect(saved.taxMode).toBe('exclusive');

    const retrieved = await getBillingSettings(adapter, branchId);
    expect(retrieved.discountEnabled).toBe(false);
    expect(retrieved.defaultTaxRate).toBe(8);
    expect(retrieved.taxMode).toBe('exclusive');
    expect(retrieved.defaultSurchargeName).toBe('Phụ thu lễ');
    expect(retrieved.defaultSurchargeRate).toBe(15);
    expect(retrieved.updatedBy).toBe('manager_01');
  });

  it('maintains strict branch isolation between different branches', async () => {
    const branchA = 'branch_A';
    const branchB = 'branch_B';

    await saveBillingSettings(adapter, {
      ...createDefaultBillingSettings(branchA),
      taxEnabled: false,
      discountEnabled: true,
    });

    await saveBillingSettings(adapter, {
      ...createDefaultBillingSettings(branchB),
      taxEnabled: true,
      defaultTaxRate: 8,
      discountEnabled: false,
    });

    const settingsA = await getBillingSettings(adapter, branchA);
    const settingsB = await getBillingSettings(adapter, branchB);

    expect(settingsA.taxEnabled).toBe(false);
    expect(settingsA.discountEnabled).toBe(true);

    expect(settingsB.taxEnabled).toBe(true);
    expect(settingsB.defaultTaxRate).toBe(8);
    expect(settingsB.discountEnabled).toBe(false);
  });

  it('throws when saving with empty or missing branchId', async () => {
    const invalid = createDefaultBillingSettings(branchId);
    invalid.branchId = '';

    await expect(saveBillingSettings(adapter, invalid)).rejects.toThrow(
      'saveBillingSettings(): branchId is required',
    );
  });

  it('integrates with OrderRepository methods', async () => {
    const orderRepo = createOrderRepository(adapter);

    const initial = await orderRepo.getBillingSettings(branchId);
    expect(initial.taxEnabled).toBe(true);

    await orderRepo.saveBillingSettings({
      ...initial,
      taxEnabled: false,
      defaultSurchargeRate: 10,
    });

    const refreshed = await orderRepo.getBillingSettings(branchId);
    expect(refreshed.taxEnabled).toBe(false);
    expect(refreshed.defaultSurchargeRate).toBe(10);
  });

  it('checks permissions correctly for canConfigureBilling', () => {
    expect(canConfigureBilling('owner')).toBe(true);
    expect(canConfigureBilling('manager')).toBe(true);
    expect(canConfigureBilling('cashier')).toBe(false);
    expect(canConfigureBilling('waiter')).toBe(false);
    expect(canConfigureBilling('kitchen')).toBe(false);
    expect(canConfigureBilling('staff')).toBe(false);
    expect(canConfigureBilling(null)).toBe(false);
    expect(canConfigureBilling(undefined)).toBe(false);
  });
});
