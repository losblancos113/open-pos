import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import type { DbAdapter } from '../../db/adapter';
import { createSystemRepository, type SystemRepository } from '../system-repository';

describe('SystemRepository', () => {
  let adapter: DbAdapter;
  let repo: SystemRepository;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    repo = createSystemRepository(adapter);
  });

  it('detects first-run when no config exists', async () => {
    expect(await repo.isFirstRun()).toBe(true);
    expect(await repo.getConfig()).toBeNull();
  });

  it('initializes system config properly and marks first run as completed', async () => {
    const config = await repo.initializeSystem({
      storeName: 'Cà phê Phố',
      primaryBranchId: 'hq',
      defaultCurrency: 'VND',
      authProviderMode: 'both',
      logtoConfig: {
        endpoint: 'https://sample.logto.app',
        appId: 'pos-client-app',
      },
    });

    expect(config._id).toBe('system:config');
    expect(config.docType).toBe('system_config');
    expect(config.branchId).toBe('*');
    expect(config.isInitialized).toBe(true);
    expect(config.storeName).toBe('Cà phê Phố');
    expect(config.primaryBranchId).toBe('hq');
    expect(config.authProviderMode).toBe('both');
    expect(config.backendPort).toBe(8080);
    expect(config.logtoConfig?.endpoint).toBe('https://sample.logto.app');
    expect(config.initializedAt).toBeTruthy();

    expect(await repo.isFirstRun()).toBe(false);
  });

  it('initializes system with custom backend port', async () => {
    const config = await repo.initializeSystem({
      storeName: 'Cà phê 8088',
      primaryBranchId: 'hq',
      authProviderMode: 'local',
      backendPort: 8088,
    });

    expect(config.backendPort).toBe(8088);
  });

  it('updates existing system config including backend port', async () => {
    await repo.initializeSystem({
      storeName: 'Original Name',
      primaryBranchId: 'hq',
      authProviderMode: 'local',
      backendPort: 8080,
    });

    const updated = await repo.updateConfig({
      storeName: 'Updated Brand Name',
      authProviderMode: 'both',
      backendPort: 8090,
      logtoConfig: {
        endpoint: 'https://new.logto.app',
        appId: 'new-id',
      },
    });

    expect(updated.storeName).toBe('Updated Brand Name');
    expect(updated.authProviderMode).toBe('both');
    expect(updated.backendPort).toBe(8090);
    expect(updated.logtoConfig?.appId).toBe('new-id');
  });
});
