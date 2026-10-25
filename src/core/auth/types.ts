import type { DocEnvelope } from '../db/envelope';
import type { GLOBAL_BRANCH_ID } from '../db/branch';

export const USER_DOC_TYPE = 'user';

export type UserRole = 'owner' | 'manager' | 'cashier' | 'staff';

export interface UserDoc extends DocEnvelope<typeof USER_DOC_TYPE> {
  branchId: typeof GLOBAL_BRANCH_ID; // User accounts are globally replicated ('*')
  username: string;
  displayName: string;
  pinHash: string; // Argon2id or secure hash of numeric PIN
  role: UserRole;
  branchIds: string[]; // Allowed branches for manager/cashier/staff
  isActive: boolean;
}

export interface AuthTokenClaims {
  sub: string; // userId / username
  username: string;
  role: UserRole;
  branchIds: string[];
  activeBranchId: string;
  exp: number; // Unix epoch seconds
  iat: number; // Unix epoch seconds
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  pin: string;
  role: UserRole;
  branchIds?: string[];
  isActive?: boolean;
}
