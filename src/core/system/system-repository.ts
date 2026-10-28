import type { DbAdapter } from '../db/adapter';
import { createEnvelope } from '../db/envelope';
import { GLOBAL_BRANCH_ID } from '../db/branch';
import { systemConfigDocId } from '../db/ids';
import {
  SYSTEM_CONFIG_DOC_TYPE,
  type SystemConfigDoc,
  type InitializeSystemInput,
  type UpdateSystemConfigInput,
} from './types';

export interface SystemRepository {
  getConfig(): Promise<SystemConfigDoc | null>;
  isFirstRun(): Promise<boolean>;
  initializeSystem(input: InitializeSystemInput): Promise<SystemConfigDoc>;
  updateConfig(patch: UpdateSystemConfigInput): Promise<SystemConfigDoc>;
}

export function createSystemRepository(
  adapter: DbAdapter,
  clock: () => string = () => new Date().toISOString(),
): SystemRepository {
  return {
    async getConfig(): Promise<SystemConfigDoc | null> {
      const doc = (await adapter.get(systemConfigDocId())) as SystemConfigDoc | null;
      if (!doc || doc.docType !== SYSTEM_CONFIG_DOC_TYPE || doc.deletedAt !== undefined) {
        return null;
      }
      return doc;
    },

    async isFirstRun(): Promise<boolean> {
      const config = await this.getConfig();
      if (!config) return true;
      return !config.isInitialized;
    },

    async initializeSystem(input: InitializeSystemInput): Promise<SystemConfigDoc> {
      const docId = systemConfigDocId();
      const existing = await this.getConfig();
      if (existing && existing.isInitialized) {
        throw new Error('System is already initialized');
      }

      const now = clock();
      const envelope = createEnvelope({
        id: docId,
        docType: SYSTEM_CONFIG_DOC_TYPE,
        branchId: GLOBAL_BRANCH_ID,
        now,
      });

      const doc: SystemConfigDoc = {
        ...envelope,
        branchId: GLOBAL_BRANCH_ID,
        isInitialized: true,
        storeName: input.storeName.trim(),
        defaultCurrency: input.defaultCurrency?.trim() || 'VND',
        primaryBranchId: input.primaryBranchId.trim(),
        authProviderMode: input.authProviderMode,
        backendPort: input.backendPort ?? 8080,
        ...(input.logtoConfig ? { logtoConfig: input.logtoConfig } : {}),
        initializedAt: now,
      };

      await adapter.put(doc);
      return doc;
    },

    async updateConfig(patch: UpdateSystemConfigInput): Promise<SystemConfigDoc> {
      const docId = systemConfigDocId();
      const existing = await this.getConfig();
      if (!existing) {
        throw new Error('Cannot update system config: system is not initialized');
      }

      const updated: SystemConfigDoc = {
        ...existing,
        updatedAt: clock(),
        storeName: patch.storeName !== undefined ? patch.storeName.trim() : existing.storeName,
        defaultCurrency: patch.defaultCurrency !== undefined ? patch.defaultCurrency.trim() : existing.defaultCurrency,
        authProviderMode: patch.authProviderMode !== undefined ? patch.authProviderMode : existing.authProviderMode,
        backendPort: patch.backendPort !== undefined ? patch.backendPort : existing.backendPort,
        logtoConfig: patch.logtoConfig !== undefined ? patch.logtoConfig : existing.logtoConfig,
      };

      await adapter.put(updated);
      return updated;
    },
  };
}
