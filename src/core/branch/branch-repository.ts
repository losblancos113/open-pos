import type { DbAdapter } from '../db/adapter';
import { createEnvelope } from '../db/envelope';
import { GLOBAL_BRANCH_ID } from '../db/branch';
import { branchDocId } from '../db/ids';
import {
  BRANCH_DOC_TYPE,
  type BranchDoc,
  type CreateBranchInput,
  type UpdateBranchInput,
} from './types';

export interface BranchRepository {
  createBranch(input: CreateBranchInput): Promise<BranchDoc>;
  updateBranch(branchId: string, input: UpdateBranchInput): Promise<BranchDoc>;
  getBranch(branchId: string): Promise<BranchDoc | null>;
  listBranches(options?: { includeInactive?: boolean }): Promise<BranchDoc[]>;
  seedDefaultBranches(): Promise<BranchDoc[]>;
}

export function createBranchRepository(
  adapter: DbAdapter,
  clock: () => string = () => new Date().toISOString(),
): BranchRepository {
  return {
    async createBranch(input: CreateBranchInput): Promise<BranchDoc> {
      const code = input.code.trim().toUpperCase();
      if (!code) {
        throw new Error('createBranch(): code is required');
      }
      const name = input.name.trim();
      if (!name) {
        throw new Error('createBranch(): name is required');
      }

      const branchId = input.code.trim().toLowerCase();
      const docId = branchDocId(branchId);

      // Check if branchId already exists
      const existing = await adapter.get(docId);
      if (existing && existing.deletedAt === undefined) {
        throw new Error(`Branch code "${input.code}" already exists`);
      }

      // Check if another active branch shares the same normalized code
      const allBranches = await this.listBranches({ includeInactive: true });
      if (allBranches.some((b) => b.code === code)) {
        throw new Error(`Branch code "${input.code}" already exists`);
      }

      const envelope = createEnvelope({
        id: docId,
        docType: BRANCH_DOC_TYPE,
        branchId: GLOBAL_BRANCH_ID,
        now: clock(),
      });

      const doc: BranchDoc = {
        ...envelope,
        code,
        name,
        address: input.address?.trim() ?? '',
        phone: input.phone?.trim() ?? '',
        timezone: input.timezone?.trim() ?? 'Asia/Ho_Chi_Minh',
        isActive: input.isActive ?? true,
      };

      const res = await adapter.put(doc);
      return res as BranchDoc;
    },

    async updateBranch(branchId: string, input: UpdateBranchInput): Promise<BranchDoc> {
      const docId = branchDocId(branchId);
      const existing = (await adapter.get(docId)) as BranchDoc | null;
      if (!existing || existing.deletedAt !== undefined) {
        throw new Error(`updateBranch(): branch "${branchId}" not found`);
      }

      const updated: BranchDoc = {
        ...existing,
        name: input.name !== undefined ? input.name.trim() : existing.name,
        address: input.address !== undefined ? input.address.trim() : existing.address,
        phone: input.phone !== undefined ? input.phone.trim() : existing.phone,
        timezone: input.timezone !== undefined ? input.timezone.trim() : existing.timezone,
        isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
        updatedAt: clock(),
      };

      const res = await adapter.put(updated);
      return res as BranchDoc;
    },

    async getBranch(branchId: string): Promise<BranchDoc | null> {
      const docId = branchDocId(branchId);
      const doc = (await adapter.get(docId)) as BranchDoc | null;
      if (!doc || doc.deletedAt !== undefined) {
        return null;
      }
      return doc;
    },

    async listBranches(options?: { includeInactive?: boolean }): Promise<BranchDoc[]> {
      const allDocs = await adapter.allDocs({
        branchId: GLOBAL_BRANCH_ID,
        includeGlobal: true,
      });

      const branches = allDocs.filter(
        (doc): doc is BranchDoc =>
          doc.docType === BRANCH_DOC_TYPE && doc.deletedAt === undefined,
      );

      if (options?.includeInactive) {
        return branches;
      }

      return branches.filter((b) => b.isActive);
    },

    async seedDefaultBranches(): Promise<BranchDoc[]> {
      let hq = await this.getBranch('hq');
      if (!hq) {
        hq = await this.createBranch({
          code: 'HQ',
          name: 'Trụ sở chính',
          address: '123 Lê Lợi, Bến Nghé, Quận 1, TP. Hồ Chí Minh',
          phone: '02812345678',
        });
      }

      let dist1 = await this.getBranch('d1');
      if (!dist1) {
        dist1 = await this.createBranch({
          code: 'D1',
          name: 'Chi nhánh Quận 1',
          address: '456 Hai Bà Trưng, Tân Định, Quận 1, TP. Hồ Chí Minh',
          phone: '02898765432',
        });
      }

      return this.listBranches();
    },
  };
}
