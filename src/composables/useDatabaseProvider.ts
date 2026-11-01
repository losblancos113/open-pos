import { ref } from 'vue';
import type { DbAdapter } from '@/core/db/adapter';
import {
  loadDatabaseConfig,
  saveDatabaseConfig,
  type DatabaseConfig,
  type CosmosDbConfig,
} from '@/core/db/config';
import { createCosmosAdapter } from '@/core/db/cosmos-adapter';
import { createPouchAdapter } from '@/core/db/pouch-adapter';
import {
  migrateAdapterData,
  type MigrationOptions,
  type MigrationProgress,
} from '@/core/db/migration';

export type ProviderStatus = 'connected' | 'connecting' | 'error' | 'local';

const activeConfig = ref<DatabaseConfig>(loadDatabaseConfig());
const providerStatus = ref<ProviderStatus>(
  activeConfig.value.provider === 'cosmos' ? 'connecting' : 'local',
);
const statusMessage = ref<string>('');

export function useDatabaseProvider() {
  async function initializeAdapter(fallbackPouchDb?: any): Promise<DbAdapter> {
    const config = activeConfig.value;

    if (config.provider === 'cosmos') {
      providerStatus.value = 'connecting';
      try {
        const adapter = await createCosmosAdapter(config);
        providerStatus.value = 'connected';
        statusMessage.value = '';
        return adapter;
      } catch (err) {
        providerStatus.value = 'error';
        const msg = err instanceof Error ? err.message : String(err);
        statusMessage.value = msg;
        throw err;
      }
    }

    // Default: local PouchDB adapter
    providerStatus.value = 'local';
    statusMessage.value = '';
    if (fallbackPouchDb) {
      return createPouchAdapter(fallbackPouchDb);
    }
    // Lazy import PouchDB if needed
    const PouchDB = (await import('pouchdb')).default;
    return createPouchAdapter(new PouchDB('openpos_local'));
  }

  async function switchProvider(
    newConfig: DatabaseConfig,
    fallbackPouchDb?: any,
  ): Promise<DbAdapter> {
    if (newConfig.provider === 'cosmos') {
      providerStatus.value = 'connecting';
      try {
        const adapter = await createCosmosAdapter(newConfig);
        activeConfig.value = newConfig;
        saveDatabaseConfig(newConfig);
        providerStatus.value = 'connected';
        statusMessage.value = '';
        return adapter;
      } catch (err) {
        providerStatus.value = 'error';
        const msg = err instanceof Error ? err.message : String(err);
        statusMessage.value = msg;
        throw err;
      }
    }

    // Local provider
    activeConfig.value = newConfig;
    saveDatabaseConfig(newConfig);
    providerStatus.value = 'local';
    statusMessage.value = '';

    if (fallbackPouchDb) {
      return createPouchAdapter(fallbackPouchDb);
    }
    const PouchDB = (await import('pouchdb')).default;
    return createPouchAdapter(new PouchDB('openpos_local'));
  }

  async function migrateToCloud(
    source: DbAdapter,
    target: DbAdapter,
    options?: MigrationOptions,
  ): Promise<MigrationProgress> {
    return migrateAdapterData(source, target, options);
  }

  return {
    activeConfig,
    providerStatus,
    statusMessage,
    initializeAdapter,
    switchProvider,
    migrateToCloud,
  };
}
