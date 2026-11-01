# Firebase Firestore Provider Architecture Design Document

**Date:** 2026-11-01
**Status:** In Review
**Module:** `src/core/db/`, `src/composables/`, `src/features/database/`, `src/i18n/`
**Authority:** Extends `docs/superpowers/specs/2026-11-01-azure-cosmos-db-provider-design.md`

---

## 1. Intent & The Why

Open POS now features a pluggable database architecture allowing multiple storage providers to coexist. Following the successful delivery of the **Azure Cosmos DB** provider, store operators requested **Google Cloud Firestore** as an alternative online NoSQL database option.

Firestore offers several unique advantages for restaurants and retail:
1. **Google Firebase Ecosystem:** Many small business owners already have Firebase/Google Cloud projects configured.
2. **First-Class Real-Time Sync:** Native `onSnapshot()` document listeners provide reactive, sub-second synchronization across all front-of-house and kitchen terminals.
3. **Built-in Offline Persistence:** The Firebase Web SDK provides IndexedDB-backed local cache (`persistentLocalCache`), ensuring cashiers can ring bills offline and sync transactions automatically when internet connectivity resumes.
4. **Free Tier (Spark Plan):** 50,000 reads/day, 20,000 writes/day, and 1 GB storage free forever.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **G1 (Provider Registration):** Extend `DatabaseConfig` with `FirestoreDbConfig` and register `'firestore'` with `registerDatabaseProvider('firestore', createFirestoreAdapter)`.
- **G2 (Contract-Compliant Adapter):** Implement `FirestoreAdapter` implementing `DbAdapter` (`get`, `put`, `allDocs`, `remove`, `subscribe`), passing all standardized tests in `adapter-contract.ts`.
- **G3 (Document Mapping & Concurrency):**
  - Store documents in a dedicated Firestore collection (default: `openpos_documents`).
  - Document ID `doc._id` mapped to Firestore document ID.
  - Mandatory `branchId` (Invariant 4.1) indexed and queried.
  - Optimistic concurrency control via `_rev` (or document timestamp/etag check).
- **G4 (Real-Time Subscriptions):** Wire `subscribe()` to Firestore's `onSnapshot()` listener so multi-terminal updates trigger immediate UI refreshes.
- **G5 (Connection Testing & Verification):** Test connection by verifying project access and read/write capability to the collection.
- **G6 (Flexible Credentials Entry in UI):**
  - Dedicated input fields for `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, and `collectionName`.
  - A **"Paste Config JSON"** button/dialog that automatically parses both raw JSON objects and JavaScript code blocks (`const firebaseConfig = { ... }`), populating all fields instantly.
- **G7 (Cross-Provider Migration):** Enable 1-click migration between Local (PouchDB), Azure Cosmos DB, and Firestore via `migrateToCloud`.
- **G8 (i18n Parity):** Vietnamese and English translation parity for all Firestore configuration strings.

### Non-Goals
- Firebase Authentication replacement: Open POS retains its own role-based PIN and token authentication system.
- Firebase Hosting deployment scripts: Out of scope.

### Anti-Goals
- Tight coupling to Firebase SDK types in core domain models.
- Breaking existing PouchDB or Cosmos DB adapters.

---

## 3. Data Model & Architecture

```
                                  ┌────────────────────────┐
                                  │ Open POS Domain Logic  │
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
       │   Local Provider   │       │   Cosmos Provider  │       │ Firestore Provider │
       │     (PouchDB)      │       │ (Azure Cosmos DB)  │       │ (Google Firestore) │
       └────────────────────┘       └────────────────────┘       └─────────┬──────────┘
                                                                           │
                                                                           ▼
                                                              ┌─────────────────────────┐
                                                              │ Google Cloud Firestore  │
                                                              │ - Collection:           │
                                                              │   openpos_documents     │
                                                              │ - Realtime onSnapshot   │
                                                              │ - Free Tier: 50k reads  │
                                                              └─────────────────────────┘
```

### 3.1 Document Mapping
- In Firestore collection `openpos_documents`:
  - `docRef = doc(collection(db, collectionName), doc._id)`
  - Stored fields match `DocEnvelope`: `_id`, `branchId`, `docType`, `createdAt`, `updatedAt`, `_rev`, `payload`, etc.
  - Concurrency: `_rev` is maintained on update. If an update provides a stale `_rev`, the adapter rejects with a conflict error matching `adapter-contract.ts`.

### 3.2 Query Translation
- `get(id)`: `getDoc(docRef)`; returns null if not exists or `deletedAt !== undefined`.
- `allDocs({ branchId, includeGlobal })`:
  - Scoped to `branchId`: `query(collRef, where('branchId', '==', branchId))`
  - With `includeGlobal: true`: `query(collRef, where('branchId', 'in', [branchId, '*']))`
  - All: `getDocs(collRef)`
- `subscribe(listener)`: Hooks to `onSnapshot(collRef, () => listener())` and returns unsubscribe function.

---

## 4. UI & Configuration Experience

### DatabaseSettingsModal
- Provider Dropdown now includes:
  - 🖥️ **Local Database (PouchDB / Offline)**
  - ☁️ **Azure Cosmos DB (Cloud NoSQL)**
  - 🔥 **Google Cloud Firestore (Cloud NoSQL)**
- When **Firestore** is selected:
  - **"Paste Config JSON"** button: Opens an inline helper where users paste their Firebase console snippet:
    ```js
    const firebaseConfig = {
      apiKey: "AIzaSy...",
      authDomain: "my-pos.firebaseapp.com",
      projectId: "my-pos",
      storageBucket: "my-pos.appspot.com",
      messagingSenderId: "123456789",
      appId: "1:123456789:web:abcdef"
    };
    ```
    The helper parses JSON or JS object notation using a robust regex/JSON parser and populates all form fields.
  - Dedicated editable input fields: API Key, Project ID, Auth Domain, App ID, Storage Bucket, Messaging Sender ID, Collection Name (default `openpos_documents`).
  - **"Test Connection"** button: Checks initialization and collection readability, displaying latency.
  - **"Migrate Data to Cloud"**: Transfers documents safely into Firestore.

---

## 5. Verification Strategy
- **Contract Tests:** `FirestoreAdapter` tested against `adapter-contract.ts` with mock Firestore double.
- **Config Parser Tests:** Unit tests validating the JSON / JS snippet parser with various Firebase console formats.
- **Integration Tests:** End-to-end provider switching test in `tests/database-provider.test.ts`.
- **Full Gate:** `npm run test` and `npx vue-tsc --noEmit`.
