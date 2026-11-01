export interface LocalDbConfig {
  provider: 'local';
}

export interface CosmosDbConfig {
  provider: 'cosmos';
  endpoint: string;
  key: string;
  databaseId: string;
  containerId: string;
  partitionKeyPath?: string;
}

export interface FirestoreDbConfig {
  provider: 'firestore';
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  collectionName?: string;
}

export type DatabaseConfig = LocalDbConfig | CosmosDbConfig | FirestoreDbConfig;

export const DEFAULT_LOCAL_CONFIG: LocalDbConfig = {
  provider: 'local',
};

const DATABASE_CONFIG_STORAGE_KEY = 'openpos_database_config';

export function loadDatabaseConfig(): DatabaseConfig {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_LOCAL_CONFIG;
  }
  const raw = localStorage.getItem(DATABASE_CONFIG_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_LOCAL_CONFIG;
  }
  try {
    const parsed = JSON.parse(raw) as DatabaseConfig;
    if (parsed && typeof parsed === 'object' && typeof parsed.provider === 'string') {
      return parsed;
    }
    return DEFAULT_LOCAL_CONFIG;
  } catch {
    return DEFAULT_LOCAL_CONFIG;
  }
}

export function saveDatabaseConfig(config: DatabaseConfig): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DATABASE_CONFIG_STORAGE_KEY, JSON.stringify(config));
  }
}
