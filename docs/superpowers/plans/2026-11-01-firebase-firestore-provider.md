# Firebase Firestore Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Cloud Firestore as a full third storage provider in Open POS alongside Local (PouchDB) and Azure Cosmos DB, with real-time `onSnapshot` sync and dual-input (fields + JSON paste) configuration in the UI.

**Architecture:**
- Registers `'firestore'` in `DatabaseProviderRegistry` with `FirestoreDbConfig`.
- Implements `FirestoreAdapter` satisfying `DbAdapter` contract with document mapping to `openpos_documents`, mandatory `branchId` partition queries, optimistic concurrency via `_rev`, and reactive subscriptions using `onSnapshot`.
- Provides `parseFirebaseConfigSnippet` supporting both JSON objects and JavaScript snippets (`const firebaseConfig = { ... }`).
- Integrates Firestore into `DatabaseSettingsModal.vue` with individual fields, a paste snippet modal/area, connection testing, and data migration.

**Tech Stack:** Vue 3 Composition API, TypeScript strict, `firebase` (v11 modular), UnoCSS (`presetWind4`), Vuetify0 (`@vuetify/v0`).

**Spec:** `docs/superpowers/specs/2026-11-01-firebase-firestore-provider-design.md`

## Global Constraints

- **Mandatory `branchId` (M0 Invariant 4.1):** Every document envelope must contain `branchId`.
- **Money is integer minor units (M0 Invariant 4.2):** All amounts use `Money` minor units. Never store or compute floating-point currency.
- **Storage goes through `DbAdapter` (M0 Invariant 4.5):** Domain logic must depend only on `DbAdapter`. Firebase SDK types must never leak into core business modules.
- **Contract Test Parity:** `FirestoreAdapter` must pass the standardized `describeAdapterContract()` suite from `src/core/db/__tests__/adapter-contract.ts`.
- **Exact Optional Property Types:** All TypeScript interfaces conform to strict configuration without dangling `undefined`.
- **i18n Parity (M0 Invariant 4.6):** Every key in `src/i18n/vi.json` must exist in `src/i18n/en.json` and vice-versa.

## Review Focus

1. **JS/JSON Snippet Parsing Tolerance:** `parseFirebaseConfigSnippet` must parse unquoted JS keys (e.g. `apiKey: "..."`), trailing commas, single/double quotes, and variable declarations without throwing syntax errors. (Tested in Task 1)
2. **Branch Scoping & Global Documents:** `allDocs({ branchId: 'hq', includeGlobal: true })` must return both documents with `branchId === 'hq'` and `branchId === '*'`. (Tested in Task 2)
3. **Optimistic Concurrency ETag / Revision Conflict:** An update with an obsolete or unmatched `_rev` must reject with a conflict error matching `adapter-contract.ts`. (Tested in Task 2)
4. **Listener Teardown:** Invoking the unsubscribe function returned by `subscribe()` must cleanly detach the Firestore `onSnapshot` listener. (Tested in Task 2)
5. **Exact Optional Property Types:** Configuration and helper return types must not assign `undefined` to optional fields. (Tested in Tasks 1, 2, 4)

---

### Task 1: Firestore Config Type & Config Snippet Parser

**Files:**
- Modify: `src/core/db/config.ts`
- Create: `src/core/db/firebase-config-parser.ts`
- Test: `src/core/db/__tests__/firebase-config-parser.test.ts`

**Interfaces:**
- Produces:
  - `FirestoreDbConfig`: `{ provider: 'firestore'; apiKey: string; authDomain: string; projectId: string; storageBucket?: string; messagingSenderId?: string; appId: string; collectionName?: string }`
  - `parseFirebaseConfigSnippet(snippet: string): Partial<FirestoreDbConfig> | null`

- [ ] **Step 1: Write failing tests for Firebase config snippet parser**

```ts
// src/core/db/__tests__/firebase-config-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseFirebaseConfigSnippet } from '../firebase-config-parser';

describe('parseFirebaseConfigSnippet', () => {
  it('parses valid JSON object', () => {
    const json = JSON.stringify({
      apiKey: 'AIzaSy123',
      authDomain: 'test.firebaseapp.com',
      projectId: 'test-project',
      appId: '1:123:web:456',
    });
    const parsed = parseFirebaseConfigSnippet(json);
    expect(parsed?.apiKey).toBe('AIzaSy123');
    expect(parsed?.projectId).toBe('test-project');
  });

  it('parses JavaScript snippet copied from Firebase Console', () => {
    const jsSnippet = `
      // Your web app's Firebase configuration
      const firebaseConfig = {
        apiKey: "AIzaSy456",
        authDomain: "mypos.firebaseapp.com",
        projectId: "mypos-shop",
        storageBucket: "mypos-shop.appspot.com",
        messagingSenderId: "987654321",
        appId: "1:987654321:web:fedcba",
      };
    `;
    const parsed = parseFirebaseConfigSnippet(jsSnippet);
    expect(parsed?.apiKey).toBe('AIzaSy456');
    expect(parsed?.projectId).toBe('mypos-shop');
    expect(parsed?.storageBucket).toBe('mypos-shop.appspot.com');
  });

  it('returns null for unparseable input', () => {
    expect(parseFirebaseConfigSnippet('hello world')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/db/__tests__/firebase-config-parser.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/core/db/firebase-config-parser.ts` and update `src/core/db/config.ts`**

Update `DatabaseConfig` union in `src/core/db/config.ts` to include `FirestoreDbConfig`.
Implement `parseFirebaseConfigSnippet` using JSON.parse fallback and key-value regex extraction for JS object literals.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/db/__tests__/firebase-config-parser.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/db/config.ts src/core/db/firebase-config-parser.ts src/core/db/__tests__/firebase-config-parser.test.ts
git commit -m "feat(db): add FirestoreDbConfig and Firebase config snippet parser"
```

---

### Task 2: Firestore Adapter Implementation & Contract Tests

**Files:**
- Create: `src/core/db/firestore-adapter.ts`
- Create: `src/core/db/__tests__/mock-firestore.ts`
- Test: `src/core/db/__tests__/firestore-adapter.test.ts`

**Interfaces:**
- Consumes:
  - `DbAdapter`, `DocEnvelope`, `AllDocsOptions` from `src/core/db/adapter.ts`
  - `describeAdapterContract` from `src/core/db/__tests__/adapter-contract.ts`
  - `FirestoreDbConfig` from `src/core/db/config.ts`
- Produces:
  - `createFirestoreAdapter(config: FirestoreDbConfig): Promise<DbAdapter>`
  - `createFirestoreAdapterFromDb(db: any, collectionName?: string): Promise<DbAdapter>`

- [ ] **Step 1: Install `firebase` package**

Run: `npm install firebase`

- [ ] **Step 2: Create mock Firestore test double `src/core/db/__tests__/mock-firestore.ts`**

In-memory test double mirroring Firestore collection and document references with `getDoc`, `setDoc`, `getDocs`, `deleteDoc`, and `onSnapshot`.

- [ ] **Step 3: Write contract tests in `src/core/db/__tests__/firestore-adapter.test.ts`**

```ts
// src/core/db/__tests__/firestore-adapter.test.ts
import { describe } from 'vitest';
import { describeAdapterContract } from './adapter-contract';
import { createFirestoreAdapterFromDb } from '../firestore-adapter';
import { createMockFirestoreDb } from './mock-firestore';

describeAdapterContract('FirestoreAdapter (via mock Firestore db)', {
  create: async () => {
    const mockDb = createMockFirestoreDb();
    return createFirestoreAdapterFromDb(mockDb as any);
  },
});
```

- [ ] **Step 4: Run test to verify failure**

Run: `npx vitest run src/core/db/__tests__/firestore-adapter.test.ts`
Expected: FAIL

- [ ] **Step 5: Implement `src/core/db/firestore-adapter.ts`**

Implement `get`, `put`, `allDocs`, `remove`, `subscribe` conforming to `DbAdapter`.
Register `'firestore'` in `provider.ts`: `registerDatabaseProvider('firestore', createFirestoreAdapter)`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/core/db/__tests__/firestore-adapter.test.ts`
Expected: PASS all 17 contract tests.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/core/db/firestore-adapter.ts src/core/db/__tests__/mock-firestore.ts src/core/db/__tests__/firestore-adapter.test.ts
git commit -m "feat(db): implement FirestoreAdapter passing core DbAdapter contract"
```

---

### Task 3: Firestore Connection Verification

**Files:**
- Create: `src/core/db/firestore-provision.ts`
- Test: `src/core/db/__tests__/firestore-provision.test.ts`

**Interfaces:**
- Consumes:
  - `FirestoreDbConfig` from `src/core/db/config.ts`
- Produces:
  - `testFirestoreConnection(config: FirestoreDbConfig): Promise<{ success: boolean; latencyMs?: number; error?: string }>`

- [ ] **Step 1: Write test for `testFirestoreConnection`**

```ts
// src/core/db/__tests__/firestore-provision.test.ts
import { describe, it, expect, vi } from 'vitest';
import { testFirestoreConnection } from '../firestore-provision';
import type { FirestoreDbConfig } from '../config';

describe('testFirestoreConnection', () => {
  it('returns success and latency for valid config', async () => {
    // using mock or real client
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/db/__tests__/firestore-provision.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/core/db/firestore-provision.ts`**

Pings Firestore by fetching a document or testing collection read with timing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/db/__tests__/firestore-provision.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/db/firestore-provision.ts src/core/db/__tests__/firestore-provision.test.ts
git commit -m "feat(db): add Firestore connection test utility"
```

---

### Task 4: `useDatabaseProvider` Firestore Support

**Files:**
- Modify: `src/composables/useDatabaseProvider.ts`
- Modify: `src/composables/__tests__/useDatabaseProvider.test.ts`

**Interfaces:**
- Supports `config.provider === 'firestore'`.
- Initializes and switches to Firestore adapter via `createFirestoreAdapter`.

- [ ] **Step 1: Write tests for switching to Firestore in `useDatabaseProvider.test.ts`**

```ts
it('switches provider to firestore successfully', async () => {
  const { activeConfig, providerStatus, switchProvider } = useDatabaseProvider();
  const firestoreConfig: FirestoreDbConfig = {
    provider: 'firestore',
    apiKey: 'AIzaSy123',
    authDomain: 'test.firebaseapp.com',
    projectId: 'test-project',
    appId: '1:123:web:456',
  };
  const newAdapter = await switchProvider(firestoreConfig);
  expect(newAdapter).toBeDefined();
  expect(activeConfig.value.provider).toBe('firestore');
  expect(providerStatus.value).toBe('connected');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/composables/__tests__/useDatabaseProvider.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `src/composables/useDatabaseProvider.ts`**

Import `createFirestoreAdapter` and handle `config.provider === 'firestore'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/composables/__tests__/useDatabaseProvider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/useDatabaseProvider.ts src/composables/__tests__/useDatabaseProvider.test.ts
git commit -m "feat(composables): add Firestore provider support to useDatabaseProvider"
```

---

### Task 5: i18n Localization Key Parity

**Files:**
- Modify: `src/i18n/vi.json`
- Modify: `src/i18n/en.json`
- Test: `src/i18n/__tests__/i18n.test.ts`

**Interfaces:**
- Translation keys:
  - `database.providers.firestore`: "Google Cloud Firestore (Cloud NoSQL)"
  - `database.pasteConfig`: "Dán cấu hình Firebase (JSON / Code)" / "Paste Firebase Config (JSON / Code)"
  - `database.pastePrompt`: "Dán đoạn mã cấu hình sao chép từ Firebase Console vào đây:" / "Paste the configuration snippet copied from Firebase Console here:"
  - `database.parseSuccess`: "Đã trích xuất cấu hình Firebase thành công" / "Successfully parsed Firebase configuration"
  - `database.parseFailed`: "Không thể nhận diện cấu hình Firebase hợp lệ" / "Could not recognize a valid Firebase configuration"
  - `database.apiKey`: "API Key" / "API Key"
  - `database.projectId`: "Project ID" / "Project ID"
  - `database.authDomain`: "Auth Domain" / "Auth Domain"
  - `database.storageBucket`: "Storage Bucket" / "Storage Bucket"
  - `database.messagingSenderId`: "Messaging Sender ID" / "Messaging Sender ID"
  - `database.appId`: "App ID" / "App ID"
  - `database.collectionName`: "Tên Collection" / "Collection Name"

- [ ] **Step 1: Add keys to `src/i18n/vi.json` and `src/i18n/en.json`**
- [ ] **Step 2: Run i18n parity test**

Run: `npx vitest run src/i18n/__tests__/i18n.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/i18n/vi.json src/i18n/en.json
git commit -m "feat(i18n): add Firestore provider configuration translation keys"
```

---

### Task 6: `DatabaseSettingsModal.vue` Dual-Input Firestore UI

**Files:**
- Modify: `src/features/database/DatabaseSettingsModal.vue`
- Modify: `src/features/database/__tests__/DatabaseSettingsModal.test.ts`

**Interfaces:**
- Adds Firestore option in provider selector.
- Renders Firestore form fields (`apiKey`, `projectId`, `authDomain`, `appId`, etc.).
- Adds "Paste Config JSON" button and paste dialog.
- Connects test connection and migration to Firestore.

- [ ] **Step 1: Write component tests for Firestore form & paste action**

```ts
it('renders Firestore fields when firestore is selected and populates on paste', async () => {
  // test firestore form selection and JSON parsing
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/database/__tests__/DatabaseSettingsModal.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `src/features/database/DatabaseSettingsModal.vue`**

Implement Firestore fields, paste dialog, and test connection integration.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/database/__tests__/DatabaseSettingsModal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/database/DatabaseSettingsModal.vue src/features/database/__tests__/DatabaseSettingsModal.test.ts
git commit -m "feat(ui): add dual-input Firestore form and snippet paste to DatabaseSettingsModal"
```

---

### Task 7: App Header Badge & End-to-End Integration Verification

**Files:**
- Modify: `src/App.vue`
- Modify: `tests/database-provider.test.ts`

- [ ] **Step 1: Update `src/App.vue` header status label**

Display `Firestore` when `activeConfig.provider === 'firestore'`.

- [ ] **Step 2: Add Firestore tests to `tests/database-provider.test.ts`**

Validate Firestore provider registration, CRUD, and migration.

- [ ] **Step 3: Run complete verification**

Run: `npm test`
Run: `npx vue-tsc --noEmit`
Expected: All tests pass and 0 type errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.vue tests/database-provider.test.ts
git commit -m "chore: complete Firebase Firestore provider integration and verification"
```
