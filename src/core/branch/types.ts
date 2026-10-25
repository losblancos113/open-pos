import type { DocEnvelope } from '../db/envelope';
import type { GLOBAL_BRANCH_ID } from '../db/branch';

export const BRANCH_DOC_TYPE = 'branch';

export interface BranchDoc extends DocEnvelope<typeof BRANCH_DOC_TYPE> {
  branchId: typeof GLOBAL_BRANCH_ID; // Branches themselves are global records ('*')
  code: string; // e.g. "HQ", "D1", "BT"
  name: string; // e.g. "Chi nhánh Quận 1"
  address?: string;
  phone?: string;
  timezone?: string; // e.g. "Asia/Ho_Chi_Minh"
  isActive: boolean;
}

export interface CreateBranchInput {
  code: string;
  name: string;
  address?: string;
  phone?: string;
  timezone?: string;
  isActive?: boolean;
}

export interface UpdateBranchInput {
  name?: string;
  address?: string;
  phone?: string;
  timezone?: string;
  isActive?: boolean;
}
