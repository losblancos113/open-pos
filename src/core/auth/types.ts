import type { DocEnvelope } from '../db/envelope';
import type { GLOBAL_BRANCH_ID } from '../db/branch';

export const USER_DOC_TYPE = 'user';

export type UserRole = 'owner' | 'manager' | 'cashier' | 'waiter' | 'kitchen' | 'staff';

export interface UserDoc extends DocEnvelope<typeof USER_DOC_TYPE> {
  branchId: typeof GLOBAL_BRANCH_ID; // User accounts are globally replicated ('*')
  username: string;
  displayName: string;
  passwordHash?: string | undefined; // Salted HMAC-SHA256 hash for local username/password auth
  pinHash?: string | undefined; // Hash of numeric PIN (optional / cashier quick switch)
  role: UserRole;
  branchIds: string[]; // Allowed branches for manager/cashier/staff
  isActive: boolean;
  authProvider?: 'local' | 'logto' | undefined;
  logtoSub?: string | undefined;
  email?: string | undefined;
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
  password?: string | undefined;
  pin?: string | undefined;
  role: UserRole;
  branchIds?: string[] | undefined;
  isActive?: boolean | undefined;
  authProvider?: 'local' | 'logto' | undefined;
  logtoSub?: string | undefined;
  email?: string | undefined;
}

export interface UpdateUserInput {
  displayName?: string | undefined;
  password?: string | undefined;
  pin?: string | undefined;
  role?: UserRole | undefined;
  branchIds?: string[] | undefined;
  isActive?: boolean | undefined;
  email?: string | undefined;
}
