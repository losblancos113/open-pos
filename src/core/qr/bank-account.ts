/**
 * VietQR Bank Account Configuration & Bank Presets
 *
 * Defines the schema for branch-level receiving bank accounts (bank_account:<branchId>)
 * and standard NAPAS Bank Identification Numbers (BIN) presets (Spec §4.2, §5.4).
 *
 * Invariant: Pure domain logic with zero external or framework dependencies.
 */

import { bankAccountDocId } from '../db/ids';

export { bankAccountDocId };

export interface BankAccountDoc {
  _id: string; // bank_account:<branchId>
  branchId: string;
  bankBin: string; // e.g. "970422" (MB), "970436" (VCB), "970415" (VietinBank)
  bankName: string; // e.g. "MBBank", "Vietcombank"
  accountNumber: string;
  accountName: string; // e.g. "NGUYEN VAN A" (uppercase, unaccented)
  updatedAt: string;
}

export interface BankPreset {
  readonly bin: string;
  readonly shortName: string;
  readonly name: string;
}

/**
 * Standard NAPAS 247 Bank BIN presets for Vietnam.
 */
export const BANK_PRESETS: readonly BankPreset[] = [
  { bin: '970436', shortName: 'VCB', name: 'Vietcombank' },
  { bin: '970422', shortName: 'MB', name: 'MBBank' },
  { bin: '970407', shortName: 'TCB', name: 'Techcombank' },
  { bin: '970418', shortName: 'BIDV', name: 'BIDV' },
  { bin: '970432', shortName: 'VPBank', name: 'VPBank' },
  { bin: '970416', shortName: 'ACB', name: 'ACB' },
  { bin: '970415', shortName: 'VietinBank', name: 'VietinBank' },
] as const;

/**
 * Finds a standard bank preset by its 6-digit BIN.
 */
export function findBankPresetByBin(bin: string): BankPreset | undefined {
  return BANK_PRESETS.find((preset) => preset.bin === bin);
}
