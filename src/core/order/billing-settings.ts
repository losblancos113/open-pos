/**
 * Billing Settings Configuration
 *
 * Defines branch-scoped configuration for Invoices/Bills:
 * - Khuyến mại / Chiết khấu (Discount)
 * - Phụ thu (Surcharge)
 * - Thuế GTGT (Tax / VAT)
 *
 * Invariant: Pure domain logic with zero external or framework dependencies.
 */

import type { DbAdapter } from '../db/adapter';
import type { DocEnvelope } from '../db/envelope';
import { SCHEMA_VERSION } from '../db/envelope';
import { billingSettingsDocId } from '../db/ids';

export { billingSettingsDocId };

export const BILLING_SETTINGS_DOC_TYPE = 'billing_settings';

export interface BillingSettingsDoc extends DocEnvelope<typeof BILLING_SETTINGS_DOC_TYPE> {
  _id: string; // billing_settings:<branchId>
  branchId: string;

  // --- Khuyến mại / Chiết khấu (Discount) ---
  discountEnabled: boolean;
  maxDiscountPercent: number; // Mức chiết khấu tối đa cho phép (ví dụ 100%)

  // --- Phụ thu / Phí dịch vụ (Surcharge) ---
  surchargeEnabled: boolean;
  defaultSurchargeName: string; // Tên phụ thu mặc định ("Phí dịch vụ", "Phụ thu lễ tết")
  defaultSurchargeRate: number; // Tỷ lệ phụ thu mặc định (% e.g. 5)
  defaultSurchargeType: 'percent' | 'fixed';
  defaultSurchargeAmountMinor: number; // Số tiền cố định nếu chọn fixed (minor units)
  autoApplySurcharge: boolean; // Tự động áp dụng khi tạo đơn mới

  // --- Thuế GTGT (Tax / VAT) ---
  taxEnabled: boolean;
  defaultTaxRate: number; // Thuế suất mặc định (% e.g. 8, 10)
  taxMode: 'inclusive' | 'exclusive'; // Giá đã gồm thuế (inclusive) hoặc Thuế cộng thêm (exclusive)
  taxCode: string; // e.g. 'VAT'
  taxName: string; // e.g. 'Thuế GTGT (VAT)'
  autoApplyTax: boolean; // Tự động tính thuế khi tạo đơn mới
  allowManualTaxToggle: boolean; // Cho phép thu ngân bật/tắt VAT trên từng hoá đơn

  updatedAt: string;
  updatedBy?: string | undefined;
}

export type BillingSettingsConfig = Omit<
  BillingSettingsDoc,
  '_id' | 'branchId' | 'docType' | 'schemaVersion' | 'createdAt' | 'updatedAt' | 'updatedBy'
>;

export const DEFAULT_BILLING_SETTINGS_CONFIG: BillingSettingsConfig = {
  discountEnabled: true,
  maxDiscountPercent: 100,

  surchargeEnabled: true,
  defaultSurchargeName: 'Phí dịch vụ',
  defaultSurchargeRate: 5,
  defaultSurchargeType: 'percent',
  defaultSurchargeAmountMinor: 0,
  autoApplySurcharge: false,

  taxEnabled: true,
  defaultTaxRate: 10,
  taxMode: 'inclusive',
  taxCode: 'VAT',
  taxName: 'Thuế GTGT (VAT)',
  autoApplyTax: false,
  allowManualTaxToggle: true,
};

/**
 * Creates a default BillingSettingsDoc instance for a branch.
 */
export function createDefaultBillingSettings(
  branchId: string,
  clock: () => string = () => new Date().toISOString(),
): BillingSettingsDoc {
  return {
    _id: billingSettingsDocId(branchId),
    branchId,
    docType: BILLING_SETTINGS_DOC_TYPE,
    schemaVersion: SCHEMA_VERSION,
    ...DEFAULT_BILLING_SETTINGS_CONFIG,
    createdAt: clock(),
    updatedAt: clock(),
  };
}

/**
 * Loads the billing settings for a given branch from database.
 * If not yet customized, returns the default settings.
 */
export async function getBillingSettings(
  adapter: DbAdapter,
  branchId: string,
): Promise<BillingSettingsDoc> {
  const docId = billingSettingsDocId(branchId);
  const existing = await adapter.get(docId);
  if (!existing || existing.deletedAt) {
    return createDefaultBillingSettings(branchId);
  }

  const raw = existing as unknown as Partial<BillingSettingsDoc>;
  return {
    ...createDefaultBillingSettings(branchId),
    ...raw,
    _id: docId,
    branchId,
    docType: BILLING_SETTINGS_DOC_TYPE,
    schemaVersion: SCHEMA_VERSION,
    ...(existing._rev ? { _rev: existing._rev } : {}),
  };
}

/**
 * Saves billing settings for a branch into database with retry on revision conflicts.
 */
export async function saveBillingSettings(
  adapter: DbAdapter,
  settings: BillingSettingsDoc,
  clock: () => string = () => new Date().toISOString(),
): Promise<BillingSettingsDoc> {
  if (!settings.branchId || typeof settings.branchId !== 'string' || settings.branchId.trim() === '') {
    throw new Error('saveBillingSettings(): branchId is required');
  }

  const docId = billingSettingsDocId(settings.branchId);
  const MAX_ATTEMPTS = 3;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const existing = await adapter.get(docId);
      const toSave: BillingSettingsDoc = {
        ...settings,
        _id: docId,
        docType: BILLING_SETTINGS_DOC_TYPE,
        schemaVersion: SCHEMA_VERSION,
        updatedAt: clock(),
        ...(existing?._rev ? { _rev: existing._rev } : {}),
      };

      await adapter.put(toSave as unknown as DocEnvelope);
      return toSave;
    } catch (err: unknown) {
      const isConflict =
        (typeof err === 'object' && err !== null && 'status' in err && (err as { status: number }).status === 409) ||
        (err instanceof Error && err.message.toLowerCase().includes('conflict'));

      if (isConflict && attempt < MAX_ATTEMPTS - 1) {
        continue;
      }
      throw err;
    }
  }

  throw new Error(`saveBillingSettings(): failed to save after ${MAX_ATTEMPTS} attempts`);
}
