# Azure Cosmos DB Provider & Extensible Cloud Database Architecture Design Document

**Date:** 2026-11-01
**Status:** Approved
**Module:** `src/core/db/`, `src/composables/`, `src/features/database/`, `src/i18n/`
**Authority:** Extends `docs/superpowers/specs/2026-10-20-open-pos-design.md` (§5, §6.1, §8)

---

## 1. Intent & The Why

Open POS is designed as an offline-first POS for restaurants and cafes. In the v1.0 milestone, multi-terminal synchronization operated over local LAN through a PouchDB-server hub sidecar.

However, business owners require **remote internet access** to:
1. Access the POS software from anywhere (home, mobile, tablet) without being on the shop's physical LAN.
2. Synchronize real-time orders, table statuses, catalog updates, inventory, and shift closures across multi-branch and remote terminals.
3. Eliminate the operational burden of keeping a local hub PC powered on 24/7 with complex port forwarding or static IP setups.

To achieve this, Open POS adopts **Azure Cosmos DB** as its primary cloud NoSQL database provider, while introducing a **Pluggable Database Provider Architecture** so that additional cloud databases (such as Google Cloud Firestore, MongoDB, CouchDB) can be added seamlessly in the future without modifying domain logic.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **G1 (Extensible Provider Registry):** Create a database provider abstraction (`DatabaseProviderRegistry`) and unified configuration interface (`DatabaseConfig`) allowing dynamic switching between `local` (PouchDB) and `cosmos` (Azure Cosmos DB), with easy extension for future databases (`firestore`, `mongodb`).
- **G2 (Azure Cosmos DB Adapter):** Implement `CosmosAdapter` conforming 100% to the core `DbAdapter` contract (`get`, `put`, `allDocs`, `remove`, `subscribe`), passing the existing `adapter-contract.ts` test suite.
- **G3 (Partition Key Alignment):** Map Cosmos DB partition key to `/branchId`, directly leveraging Open POS Invariant 4.1 (`branchId` mandatory on every document) for optimal indexing and lowest RU cost.
- **G4 (Optimistic Concurrency):** Maintain revision conflict detection using Cosmos DB's native `_etag` mapped to Open POS's `_rev` envelope field.
- **G5 (Automatic Provisioning):** Automatically create the target database (`openpos`) and container (`documents`) with free-tier friendly throughput (default 400 RU/s, safely within the 1000 RU/s lifetime free tier limit) if they do not exist.
- **G6 (RU/s-Safe Data Migration):** Provide a controlled, rate-limited local-to-cloud data migration utility that batches document uploads and throttles execution to strictly guarantee it stays well below the 1000 RU/s limit and handles HTTP 429 (`RequestRateTooLarge`) with exponential backoff.
- **G7 (Reactive UI & Composable):** Deliver `useDatabaseProvider()` composable and Vuetify0 `DatabaseSettingsModal.vue` allowing cashiers and owners to test credentials, toggle backends, provision containers, and monitor real-time sync status.
- **G8 (i18n Parity):** 100% key parity across `src/i18n/vi.json` and `src/i18n/en.json`.

### Non-Goals
- **Multi-region geo-replication orchestration:** Configuring geo-redundant Cosmos DB regions is managed in Azure Portal, not in POS UI.
- **Replacing in-memory test adapter:** `createMemoryAdapter()` remains the primary isolated test double.

### Anti-Goals
- **Leaking Azure SDK into domain logic:** Domain models, reducers, and services must strictly interact via `DbAdapter`.
- **Exceeding 1000 RU/s during migration:** Never flood Cosmos DB with unbounded concurrent writes that incur charges or trigger rate limiting.

---

## 3. Architecture & Data Flow

```
                                  ┌────────────────────────┐
                                  │ Open POS Domain Logic  │
                                  │  (Orders, Menu, KDS)   │
                                  └───────────┬────────────┘
                                              │
                                       ┌──────┴──────┐
                                       │  DbAdapter  │
                                       └──────┬──────┘
                                              │
                              ┌───────────────┴───────────────┐
                              │  createDatabaseAdapter(...)   │
                              └───────────────┬───────────────┘
                                              │
                 ┌────────────────────────────┼────────────────────────────┐
                 │                            │                            │
       ┌─────────┴──────────┐       ┌─────────┴──────────┐       ┌─────────┴──────────┐
       │   Local Provider   │       │   Cosmos Provider  │       │  Future Providers  │
       │  (PouchDB/LevelDB) │       │ (Azure Cosmos DB)  │       │(Firestore, MongoDB)│
       └────────────────────┘       └─────────┬──────────┘       └────────────────────┘
                                              │
                                              ▼
                                 ┌─────────────────────────┐
                                 │ Azure Cosmos DB Cloud   │
                                 │ - Database: openpos     │
                                 │ - Container: documents  │
                                 │ - Partition: /branchId  │
                                 │ - Free tier: 1000 RU/s  │
                                 └─────────────────────────┘
```

### 3.1 Document Envelope Mapping in Cosmos DB
In Cosmos DB, documents require a unique `id` property within their logical partition.
Open POS documents already have:
- `_id`: e.g. `product:p001`, `branch:hq`, `order:b001`
- `branchId`: e.g. `hq`, `dist1`, `*` (`GLOBAL_BRANCH_ID`)
- `_rev`: e.g. `1-00000001` (mapped to/from Cosmos `_etag`)

In Cosmos DB:
```json
{
  "id": "product:p001",
  "_id": "product:p001",
  "branchId": "hq",
  "docType": "product",
  "createdAt": "2026-11-01T08:00:00.000Z",
  "updatedAt": "2026-11-01T08:00:00.000Z",
  "_etag": "\"00000000-0000-0000-0000-000000000000\"",
  "_rev": "\"00000000-0000-0000-0000-000000000000\"",
  "payload": { ... }
}
```

### 3.2 Query Translation
1. **`get(id)`**:
   Cosmos Point Read requires `(id, partitionKey)`. When `branchId` is known, point read is $1\text{ RU}$. If `branchId` is not known upfront, query `SELECT * FROM c WHERE c.id = @id` across partitions ($2.5\text{ RU}$).
2. **`allDocs({ branchId, includeGlobal })`**:
   - `branchId` specified:
     `SELECT * FROM c WHERE c.branchId = @branchId` (single partition query, $<3\text{ RU}$).
   - `includeGlobal: true`:
     `SELECT * FROM c WHERE c.branchId IN (@branchId, '*')`
   - no `branchId`:
     `SELECT * FROM c` (cross-partition query).
3. **`put(doc)`**:
   Upsert document. If `doc._rev` is present, pass `accessCondition: { type: 'IfMatch', condition: doc._rev }` to detect concurrent modifications ($409\text{ Conflict}$).
4. **`remove(id, rev)`**:
   Delete item. Soft-deleted documents (`deletedAt`) are treated as absent in queries, or hard-deleted via item delete.

---

## 4. Rate-Limiting & Throughput Protection (< 1000 RU/s)

Azure Cosmos DB's lifetime free tier allocates **1,000 RU/s** shared across containers.
To ensure Open POS never exceeds this limit:
1. **Container Throughput Provisioning:**
   When auto-provisioning the container, we set manual throughput to **400 RU/s** (or Serverless mode if chosen), well below the 1000 RU/s boundary.
2. **Local-to-Cloud Migration Rate Limiter:**
   - Chunk size: 10 documents per batch.
   - Throttling delay: minimum $100\text{ms}$ pause between batches.
   - Average point write consumes $\sim 5\text{–}7\text{ RU}$. A batch of 10 writes consumes $\sim 60\text{ RU}$.
   - At 10 batches/second, sustained consumption is $\le 600\text{ RU/s}$, leaving 400 RU/s headroom.
3. **Retry on HTTP 429 (`RequestRateTooLarge`):**
   - Intercepts 429 errors, reads `retryAfterInMilliseconds` header from Azure SDK, waits, and retries with exponential backoff (max 5 attempts).

---

## 5. UI & User Experience

- **Header Integration:**
  - Status indicator button in `App.vue`:
    - 🟢 `Cosmos DB (Cloud)`: Connected, live cloud mode.
    - 🔵 `Local (PouchDB)`: Local offline IndexedDB mode.
    - 🔴 `Connection Error`: Invalid credentials or offline.
- **Database Settings Dialog:**
  - Provider selector dropdown (`Local Database`, `Azure Cosmos DB`).
  - Fields for Cosmos DB: Endpoint URL, Primary Key, Database Name, Container Name.
  - Action buttons:
    - **"Test Connection"**: Validates credentials and returns latency in ms.
    - **"Auto-Provision"**: Creates database and container if missing.
    - **"Migrate Local Data to Cloud"**: Visual progress bar showing documents synced, throttled to keep RU/s safe.

---

## 6. Verification Strategy

- **Contract Tests:** `CosmosAdapter` validated using Vitest against `adapter-contract.ts`.
- **Rate-Limit Guard Tests:** Verify batching and 429 backoff logic.
- **Provisioning Tests:** Verify container creation parameters (partition key `/branchId`).
- **UI Tests:** Component tests for `DatabaseSettingsModal.vue` with mock provider.
- **Full Quality Gate:** `npm run test`, `npx vue-tsc --noEmit`.
