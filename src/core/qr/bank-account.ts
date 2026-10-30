/**
 * VietQR Bank Account Configuration & Bank Presets
 *
 * Defines the schema for branch-level receiving bank accounts (bank_account:<branchId>)
 * and NAPAS Bank Identification Number (BIN) presets. The full bank registry comes from
 * `vietnam-qr-pay` (Spec §4.2, §5.4).
 *
 * Invariant: Pure domain logic with no framework or storage dependencies.
 */

import { Banks, type Bank } from 'vietnam-qr-pay';
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
 * Standard NAPAS 247 Bank BIN presets for Vietnam, shown first in the picker.
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
 * Full Vietnamese bank registry (60+ banks) from `vietnam-qr-pay`.
 */
export const ALL_BANKS: readonly Bank[] = Banks;

/**
 * Finds a bank by its 6-digit BIN, checking the common presets first and
 * falling back to the full registry from `vietnam-qr-pay`.
 */
export function findBankPresetByBin(bin: string): BankPreset | undefined {
  const preset = BANK_PRESETS.find((p) => p.bin === bin);
  if (preset) return preset;
  const bank = Banks.find((b) => b.bin === bin);
  if (bank) {
    return { bin: bank.bin, shortName: bank.shortName, name: bank.name };
  }
  return undefined;
}
