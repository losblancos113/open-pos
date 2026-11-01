// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerDatabaseProvider,
  getDatabaseProvider,
  listDatabaseProviders,
  clearDatabaseProviders,
} from '../provider';
import { loadDatabaseConfig, saveDatabaseConfig, DEFAULT_LOCAL_CONFIG } from '../config';

describe('Database Provider Registry', () => {
  beforeEach(() => {
    clearDatabaseProviders();
  });

  it('registers and retrieves a provider factory', () => {
    const mockFactory = async () => ({} as any);
    registerDatabaseProvider('test-db', mockFactory);
    expect(getDatabaseProvider('test-db')).toBe(mockFactory);
    expect(listDatabaseProviders()).toContain('test-db');
  });

  it('returns undefined for unregistered provider', () => {
    expect(getDatabaseProvider('unknown')).toBeUndefined();
  });
});

describe('Database Config Storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns default local config when storage is empty', () => {
    expect(loadDatabaseConfig()).toEqual(DEFAULT_LOCAL_CONFIG);
  });

  it('persists and loads cosmos configuration', () => {
    const cosmosConfig = {
      provider: 'cosmos' as const,
      endpoint: 'https://test.documents.azure.com:443/',
      key: 'fakeKey123==',
      databaseId: 'openpos',
      containerId: 'documents',
    };
    saveDatabaseConfig(cosmosConfig);
    expect(loadDatabaseConfig()).toEqual(cosmosConfig);
  });
});
