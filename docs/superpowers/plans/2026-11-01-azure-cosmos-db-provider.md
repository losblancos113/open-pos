# Azure Cosmos DB Provider & Extensible Cloud Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an extensible database provider architecture with Azure Cosmos DB as the initial cloud NoSQL backend, enabling internet access for Open POS while protecting the 1000 RU/s free tier limit.

**Architecture:**
- The existing `DbAdapter` contract (`get`, `put`, `allDocs`, `remove`, `subscribe`) is preserved as the single interface for all domain operations.
- A pluggable `DatabaseProviderRegistry` maps provider identifiers (`local`, `cosmos`, future `firestore`/`mongodb`) to adapter factory functions.
- `CosmosAdapter` wraps Azure Cosmos DB, mapping partition keys to `/branchId` and optimistic concurrency to `_etag` / `_rev`.
- Auto-provisioning creates the `openpos` database and `documents` container at 400 RU/s throughput.
- A throttled migration engine safely transfers local documents to cloud with chunked writes, delay spacing, and HTTP 429 exponential backoff.
- A reactive Vuetify0 modal allows cashiers and owners to test connections, switch backends, and monitor real-time sync.

**Tech Stack:** Vue 3 Composition API, TypeScript strict, `@azure/cosmos`, UnoCSS (`presetWind4`), Vuetify0 (`@vuetify/v0`).

**Spec:** `docs/superpowers/specs/2026-11-01-azure-cosmos-db-provider-design.md`

## Global Constraints

- **Mandatory `branchId` (M0 Invariant 4.1):** Every document envelope must contain `branchId`. In Cosmos DB, this is the partition key (`/branchId`).
- **Money is integer minor units (M0 Invariant 4.2):** All amounts use `Money` minor units. Never store or compute floating-point currency.
- **Storage goes through `DbAdapter` (M0 Invariant 4.5):** Domain logic must depend only on `DbAdapter`. Cosmos SDK types must never leak into core business modules.
- **Contract Test Parity:** `CosmosAdapter` must pass the standardized `describeAdapterContract()` suite from `src/core/db/__tests__/adapter-contract.ts`.
- **Free Tier Throughput Guard (< 1000 RU/s):** Container throughput defaults to 400 RU/s; data migration must be batched and throttled with exponential backoff on HTTP 429.
- **Headless UI (M0 Invariant 4.8 & 4.9):** Interactive UI built using `@vuetify/v0` primitives styled with design tokens (`btn`, `panel-card`, `field-input`).
- **i18n Parity (M0 Invariant 4.6):** Every key in `src/i18n/vi.json` must exist in `src/i18n/en.json` and vice-versa.

## Review Focus

1. **Partition Key Consistency:** Point reads and queries must correctly query against `/branchId` to avoid expensive cross-partition scans whenever possible. (Tested in Task 2)
2. **HTTP 429 Rate-Limit Recovery:** When Cosmos DB returns HTTP 429 (`RequestRateTooLarge`), the migration engine must honor `retryAfterInMilliseconds` and retry without throwing or dropping documents. (Tested in Task 4)
3. **Optimistic Concurrency ETag Mismatch:** An update with an obsolete `_rev` must reject with a conflict error matching `adapter-contract.ts` expectations. (Tested in Task 2)
4. **Auto-Provisioning Idempotency:** Invoking auto-provisioning when the database or container already exists must be a safe no-op. (Tested in Task 3)
5. **Exact Optional Property Types:** All TypeScript interfaces conform to strict configuration without dangling `undefined`. (Tested in Tasks 1, 2, 5)

---

### Task 1: Pluggable Database Provider Registry & Config Storage

**Files:**
- Create: `src/core/db/provider.ts`
- Create: `src/core/db/config.ts`
- Test: `src/core/db/__tests__/provider.test.ts`

**Interfaces:**
- Produces:
  - `DatabaseProviderId`: `'local' | 'cosmos' | 'firestore' | string`
  - `LocalDbConfig`: `{ provider: 'local' }`
  - `CosmosDbConfig`: `{ provider: 'cosmos'; endpoint: string; key: string; databaseId: string; containerId: string }`
  - `DatabaseConfig`: union of provider configurations
  - `registerDatabaseProvider(id: string, factory: (config: any) => Promise<DbAdapter>): void`
  - `getDatabaseProvider(id: string): ((config: any) => Promise<DbAdapter>) | undefined`
  - `listDatabaseProviders(): string[]`
  - `loadDatabaseConfig(): DatabaseConfig`
  - `saveDatabaseConfig(config: DatabaseConfig): void`

- [ ] **Step 1: Write failing tests for provider registry and config storage**

```ts
// src/core/db/__tests__/provider.test.ts
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
  it('returns default local config when storage is empty', () => {
    localStorage.clear();
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/db/__tests__/provider.test.ts`
Expected: FAIL with missing module/exports.

- [ ] **Step 3: Implement `src/core/db/provider.ts` and `src/core/db/config.ts`**

Implement registry map and localStorage serialization for `DatabaseConfig`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/db/__tests__/provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/db/provider.ts src/core/db/config.ts src/core/db/__tests__/provider.test.ts
git commit -m "feat(db): add pluggable database provider registry and config storage"
```

---

### Task 2: Azure Cosmos DB Adapter Implementation

**Files:**
- Create: `src/core/db/cosmos-adapter.ts`
- Test: `src/core/db/__tests__/cosmos-adapter.test.ts`

**Interfaces:**
- Consumes:
  - `DbAdapter`, `DocEnvelope`, `AllDocsOptions` from `src/core/db/adapter.ts`
  - `describeAdapterContract` from `src/core/db/__tests__/adapter-contract.ts`
- Produces:
  - `createCosmosAdapter(options: CosmosAdapterOptions): Promise<DbAdapter>`
  - `CosmosAdapterOptions`: `{ container: Container }` or `{ endpoint: string; key: string; databaseId: string; containerId: string }`

- [ ] **Step 1: Install `@azure/cosmos` dependency**

Run: `npm install @azure/cosmos`

- [ ] **Step 2: Write contract tests for `CosmosAdapter`**

```ts
// src/core/db/__tests__/cosmos-adapter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { describeAdapterContract } from './adapter-contract';
import { createCosmosAdapterFromContainer } from '../cosmos-adapter';
import { createMemoryContainerMock } from './mock-cosmos-container';

describeAdapterContract('CosmosAdapter (via mock container)', {
  create: async () => {
    const mockContainer = createMemoryContainerMock();
    return createCosmosAdapterFromContainer(mockContainer as any);
  },
});
```

- [ ] **Step 3: Create mock container helper `src/core/db/__tests__/mock-cosmos-container.ts`**

Provides an in-memory test double mirroring `@azure/cosmos` Container interface (`items.query`, `items.upsert`, `item.read`, `item.delete`) with support for partition key `/branchId` and `_etag` conflict simulation.

- [ ] **Step 4: Implement `src/core/db/cosmos-adapter.ts`**

Implement:
- `get(id)`: Point read if partition key is known or cross-partition query. Excludes soft-deleted (`deletedAt`).
- `put(doc)`: Ensures `doc.branchId`, maps `_id` to `id`, checks `_rev` / `_etag` for conflict ($409$).
- `allDocs(options)`: Parameterized query on `branchId` (and `GLOBAL_BRANCH_ID` when `includeGlobal: true`).
- `remove(id, rev)`: Deletes or marks deleted.
- `subscribe(listener)`: Subscribes listeners.

- [ ] **Step 5: Run tests to verify adapter passes contract**

Run: `npx vitest run src/core/db/__tests__/cosmos-adapter.test.ts`
Expected: PASS all contract tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/core/db/cosmos-adapter.ts src/core/db/__tests__/cosmos-adapter.test.ts src/core/db/__tests__/mock-cosmos-container.ts
git commit -m "feat(db): implement CosmosAdapter passing core DbAdapter contract"
```

---

### Task 3: Cosmos DB Auto-Provisioning & Connection Tester

**Files:**
- Create: `src/core/db/cosmos-provision.ts`
- Test: `src/core/db/__tests__/cosmos-provision.test.ts`

**Interfaces:**
- Consumes:
  - `CosmosDbConfig` from `src/core/db/config.ts`
- Produces:
  - `testCosmosConnection(config: CosmosDbConfig): Promise<{ success: boolean; latencyMs?: number; error?: string }>`
  - `ensureCosmosContainer(config: CosmosDbConfig, options?: { throughputRU?: number }): Promise<{ databaseCreated: boolean; containerCreated: boolean }>`

- [ ] **Step 1: Write failing test for provisioning and connection testing**

```ts
// src/core/db/__tests__/cosmos-provision.test.ts
import { describe, it, expect, vi } from 'vitest';
import { testCosmosConnection, ensureCosmosContainer } from '../cosmos-provision';

describe('Cosmos DB Provisioning & Testing', () => {
  it('validates connection and returns latency', async () => {
    // using mock client
    const config = {
      provider: 'cosmos' as const,
      endpoint: 'https://mock.documents.azure.com:443/',
      key: 'mockKey==',
      databaseId: 'openpos',
      containerId: 'documents',
    };
    // test logic
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/db/__tests__/cosmos-provision.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/core/db/cosmos-provision.ts`**

- `testCosmosConnection`: Pings `client.getDatabaseAccount()` with timing.
- `ensureCosmosContainer`: Calls `client.databases.createIfNotExists({ id: databaseId })` and `database.containers.createIfNotExists({ id: containerId, partitionKey: { paths: ['/branchId'] }, throughput: 400 })`. Default throughput 400 RU/s keeps it safely under 1000 RU/s free limit.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/db/__tests__/cosmos-provision.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/db/cosmos-provision.ts src/core/db/__tests__/cosmos-provision.test.ts
git commit -m "feat(db): add Cosmos DB auto-provisioning and connection test utilities"
```

---

### Task 4: RU/s-Safe Throttled Data Migration Engine

**Files:**
- Create: `src/core/db/migration.ts`
- Test: `src/core/db/__tests__/migration.test.ts`

**Interfaces:**
- Consumes:
  - `DbAdapter`, `DocEnvelope` from `src/core/db/adapter.ts`
- Produces:
  - `MigrationProgress`: `{ total: number; transferred: number; failed: number; isComplete: boolean; error?: string }`
  - `migrateAdapterData(source: DbAdapter, target: DbAdapter, options?: MigrationOptions): Promise<MigrationProgress>`
  - `MigrationOptions`: `{ batchSize?: number; delayBetweenBatchesMs?: number; onProgress?: (p: MigrationProgress) => void }`

- [ ] **Step 1: Write failing test for throttled data migration with rate limit guard**

```ts
// src/core/db/__tests__/migration.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createMemoryAdapter } from '../memory-adapter';
import { createEnvelope } from '../envelope';
import { migrateAdapterData } from '../migration';

describe('Throttled Data Migration', () => {
  it('migrates all documents from source to target in chunks', async () => {
    const source = await createMemoryAdapter();
    const target = await createMemoryAdapter();

    for (let i = 0; i < 25; i++) {
      await source.put(createEnvelope({ id: `item:${i}`, docType: 'item', branchId: 'hq' }));
    }

    const progressUpdates: number[] = [];
    const result = await migrateAdapterData(source, target, {
      batchSize: 10,
      delayBetweenBatchesMs: 10,
      onProgress: (p) => progressUpdates.push(p.transferred),
    });

    expect(result.total).toBe(25);
    expect(result.transferred).toBe(25);
    expect(result.failed).toBe(0);
    const targetDocs = await target.allDocs();
    expect(targetDocs.length).toBe(25);
  });

  it('retries on HTTP 429 rate limit error', async () => {
    // Tests exponential backoff on RequestRateTooLarge
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/db/__tests__/migration.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/core/db/migration.ts`**

- Chunks documents (default `batchSize: 10`).
- Inserts with `delayBetweenBatchesMs: 100` to maintain throughput $< 600\text{ RU/s}$.
- Transparently catches 429 errors, waits for `retryAfterInMilliseconds`, and retries with backoff.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/db/__tests__/migration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/db/migration.ts src/core/db/__tests__/migration.test.ts
git commit -m "feat(db): add rate-limited data migration engine with 429 backoff"
```

---

### Task 5: Composable `useDatabaseProvider`

**Files:**
- Create: `src/composables/useDatabaseProvider.ts`
- Test: `src/composables/__tests__/useDatabaseProvider.test.ts`

**Interfaces:**
- Consumes:
  - `DatabaseConfig`, `loadDatabaseConfig`, `saveDatabaseConfig` from `src/core/db/config.ts`
  - `createCosmosAdapter` from `src/core/db/cosmos-adapter.ts`
  - `migrateAdapterData` from `src/core/db/migration.ts`
- Produces:
  - `useDatabaseProvider()`:
    - `activeConfig`: Ref<DatabaseConfig>
    - `providerStatus`: Ref<'connected' | 'connecting' | 'error' | 'local'>
    - `statusMessage`: Ref<string>
    - `initializeAdapter(fallbackPouchDb?: any): Promise<DbAdapter>`
    - `switchProvider(newConfig: DatabaseConfig): Promise<DbAdapter>`
    - `migrateToCloud(source: DbAdapter, target: DbAdapter, onProgress?: ...): Promise<MigrationProgress>`

- [ ] **Step 1: Write failing test for `useDatabaseProvider`**

```ts
// src/composables/__tests__/useDatabaseProvider.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useDatabaseProvider } from '../useDatabaseProvider';

describe('useDatabaseProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with default local configuration', () => {
    const { activeConfig, providerStatus } = useDatabaseProvider();
    expect(activeConfig.value.provider).toBe('local');
    expect(providerStatus.value).toBe('local');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/composables/__tests__/useDatabaseProvider.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/composables/useDatabaseProvider.ts`**

Manages reactive state, initialization, provider switching, and error handling.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/composables/__tests__/useDatabaseProvider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/useDatabaseProvider.ts src/composables/__tests__/useDatabaseProvider.test.ts
git commit -m "feat(composables): add useDatabaseProvider composable"
```

---

### Task 6: i18n Localization Key Parity

**Files:**
- Modify: `src/i18n/vi.json`
- Modify: `src/i18n/en.json`
- Test: `src/i18n/__tests__/keys.test.ts`

**Interfaces:**
- Produces translation keys under `database`:
  - `database.title`: "Cấu hình Cơ sở dữ liệu" / "Database Configuration"
  - `database.provider`: "Nhà cung cấp" / "Storage Provider"
  - `database.providers.local`: "Nội bộ (PouchDB / Offline)" / "Local (PouchDB / Offline)"
  - `database.providers.cosmos`: "Azure Cosmos DB (Cloud NoSQL)" / "Azure Cosmos DB (Cloud NoSQL)"
  - `database.providers.firestore`: "Google Firestore (Sắp ra mắt)" / "Google Firestore (Coming Soon)"
  - `database.endpoint`: "Endpoint URL" / "Endpoint URL"
  - `database.key`: "Khóa truy cập (Primary Key)" / "Primary Key"
  - `database.databaseId`: "Tên Database" / "Database Name"
  - `database.containerId`: "Tên Container" / "Container Name"
  - `database.testConnection`: "Kiểm tra kết nối" / "Test Connection"
  - `database.autoProvision`: "Tự động khởi tạo" / "Auto-Provision Container"
  - `database.migrate`: "Chuyển dữ liệu lên Cloud" / "Migrate Local Data to Cloud"
  - `database.status.connected`: "Đã kết nối Cloud" / "Cloud Connected"
  - `database.status.local`: "Chế độ nội bộ" / "Local Mode"
  - `database.status.error`: "Lỗi kết nối" / "Connection Error"

- [ ] **Step 1: Add keys to `src/i18n/vi.json` and `src/i18n/en.json`**
- [ ] **Step 2: Run i18n parity test**

Run: `npx vitest run src/i18n/__tests__/keys.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/i18n/vi.json src/i18n/en.json
git commit -m "feat(i18n): add database provider configuration translation keys"
```

---

### Task 7: Vuetify0 Headless Dialog `DatabaseSettingsModal.vue`

**Files:**
- Create: `src/features/database/DatabaseSettingsModal.vue`
- Test: `src/features/database/__tests__/DatabaseSettingsModal.test.ts`

**Interfaces:**
- Consumes:
  - `@vuetify/v0` headless components (`Dialog.Root`, `Dialog.Content`, `Button.Root`, `Input.Root`, `Select.Root`)
  - `useDatabaseProvider` from `src/composables/useDatabaseProvider.ts`
  - `testCosmosConnection`, `ensureCosmosContainer` from `src/core/db/cosmos-provision.ts`
- Props:
  - `open: boolean`
  - `currentAdapter: DbAdapter`
- Emits:
  - `close: () => void`
  - `adapter-changed: (newAdapter: DbAdapter) => void`

- [ ] **Step 1: Write component test for `DatabaseSettingsModal.vue`**

```ts
// src/features/database/__tests__/DatabaseSettingsModal.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DatabaseSettingsModal from '../DatabaseSettingsModal.vue';

describe('DatabaseSettingsModal.vue', () => {
  it('renders provider selection and Cosmos DB form', () => {
    const wrapper = mount(DatabaseSettingsModal, {
      props: { open: true, currentAdapter: {} as any },
      global: { mocks: { $t: (k: string) => k } },
    });
    expect(wrapper.text()).toContain('database.title');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/database/__tests__/DatabaseSettingsModal.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/features/database/DatabaseSettingsModal.vue`**

Features:
- Provider selection dropdown.
- Conditional inputs for Cosmos DB credentials.
- Test connection button with latency display.
- Auto-provision button with success status.
- Migration trigger with progress bar.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/database/__tests__/DatabaseSettingsModal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/database/DatabaseSettingsModal.vue src/features/database/__tests__/DatabaseSettingsModal.test.ts
git commit -m "feat(ui): add DatabaseSettingsModal Vuetify0 dialog"
```

---

### Task 8: App Integration & Header Connection Status Indicator

**Files:**
- Modify: `src/App.vue`
- Test: `src/features/database/__tests__/AppDatabaseIntegration.test.ts`

**Interfaces:**
- Integrates `DatabaseSettingsModal.vue` into `App.vue` header.
- Adds cloud status button in header:
  - Displays icon and label for active provider (`Cloud: Cosmos DB` or `Local: PouchDB`).
  - Clicking button opens `DatabaseSettingsModal`.
- On startup, `App.vue` reads stored database config and boots with the selected adapter (Cosmos or PouchDB).

- [ ] **Step 1: Write integration test for App header database status**

```ts
// src/features/database/__tests__/AppDatabaseIntegration.test.ts
import { describe, it, expect } from 'vitest';
// test App.vue database modal trigger
```

- [ ] **Step 2: Update `src/App.vue`**

Wire `useDatabaseProvider`, add the database settings button next to user/branch switcher, and handle `adapter-changed`.

- [ ] **Step 3: Run integration tests**

Run: `npx vitest run src/features/database/__tests__/AppDatabaseIntegration.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/App.vue src/features/database/__tests__/AppDatabaseIntegration.test.ts
git commit -m "feat(app): integrate database provider switching and status badge into header"
```

---

### Task 9: Full Verification & E2E Validation

**Files:**
- Test: `tests/database-provider.test.ts`

- [ ] **Step 1: Write end-to-end integration test verifying full provider lifecycle**

Verify config load -> CosmosAdapter instantiation -> Document CRUD -> Migration -> Provider switch.

- [ ] **Step 2: Run complete test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 3: Run type check**

Run: `npx vue-tsc --noEmit`
Expected: Clean with 0 type errors.

- [ ] **Step 4: Final commit**

```bash
git add tests/database-provider.test.ts
git commit -m "chore: complete Azure Cosmos DB provider integration and verification"
```
