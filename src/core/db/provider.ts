import type { DbAdapter } from './adapter';

export type DatabaseProviderId = 'local' | 'cosmos' | 'firestore' | string;

export type DatabaseProviderFactory<TConfig = unknown> = (
  config: TConfig,
) => Promise<DbAdapter>;

const registry = new Map<string, DatabaseProviderFactory<any>>();

export function registerDatabaseProvider<TConfig = unknown>(
  id: string,
  factory: DatabaseProviderFactory<TConfig>,
): void {
  registry.set(id, factory);
}

export function getDatabaseProvider<TConfig = unknown>(
  id: string,
): DatabaseProviderFactory<TConfig> | undefined {
  return registry.get(id);
}

export function listDatabaseProviders(): string[] {
  return Array.from(registry.keys());
}

export function clearDatabaseProviders(): void {
  registry.clear();
}
