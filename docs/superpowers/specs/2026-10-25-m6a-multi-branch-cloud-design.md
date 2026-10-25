# M6a — Multi-Branch & Cloud Design Document

**Date:** 2026-10-25  
**Status:** Draft — Awaiting User Approval  
**Module:** `src/core/branch/`, `src/core/auth/`, `src/features/branch/`, `src-tauri/src/lan/`, `sidecar/`  
**Authority:** Follows `docs/superpowers/specs/2026-10-20-open-pos-design.md` (§4.2, §4.7, §5.1, §5.4, §6.1, §9)

---

## 1. Intent & The Why

Open POS started with single-branch operations under the hardcoded sentinel `DEFAULT_BRANCH_ID = 'hq'`. Real restaurant and café chains in Vietnam operate across 2 to 10+ locations, where:
1. **Catalog is global** with optional branch-level price overrides and availability (86'd items) — already modeled in M2.
2. **Operational data is isolated** per branch: orders, tables, bills, payments, and cash shifts at Branch B must never clutter or leak into Branch A's local terminals.
3. **Roles and security must be enforced server-side (§6.1):** Waiters and cashiers belong to specific branches. A compromised client cannot simply send `branchId: "hq"` to read or modify another branch's orders.
4. **Owners need cross-branch visibility:** Owners and general managers must be able to view consolidated revenue and operational reports across all branches or switch branch contexts seamlessly on their terminal.

This milestone (M6a) delivers full multi-branch support, server-enforced branch access tokens, filtered data sync, and owner-tier cross-branch reporting.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **G1 (Branch Management):** CRUD for branches (`BranchDoc`) with branch code, name, address, phone, and timezone.
- **G2 (Active Branch Context & Switching):** Reactive branch context in the frontend allowing authorized users to switch between branches.
- **G3 (Server-Enforced Branch Auth - §6.1):** Argon2id PIN verification and signed HMAC-SHA256 session tokens. Axum LAN endpoints and Sidecar sync endpoints reject requests/writes where token claims do not authorize the target `branchId` (unless role is `owner`).
- **G4 (Filtered Sync & Hub Security):** Sidecar validates tokens and filters replication streams directly: terminals of Branch X pull only documents with `branchId === BranchX || branchId === '*'`. Writes for other branches are rejected with 403 Forbidden.
- **G5 (Cross-Branch Reporting on HQ / Master Hub):** Aggregated revenue, bill count, and average order value reporting across all branches for `owner` role, executing on the central HQ terminal or master cloud instance.
- **G6 (Offline-First Invariant):** All branch operations, offline switching for authorized cached branches, and POS flows remain 100% operational offline without internet.

### Non-Goals
- **M6b Inventory:** Recipe BOM, stock movements, and inventory deduction are strictly M6b.
- **Full Staff Mobile UI / KDS UI:** Customer QR web app and KDS display screens belong to M5. M6a implements the auth/token infrastructure on the LAN server and sidecar required for §6.1 branch isolation, plus the minimal PIN login dialog.
- **Public Cloud SaaS Hosting:** M6a specifies and tests replication against CouchDB-compatible cloud endpoints, but does not deploy external cloud infrastructure.
- **24 Separate Databases Refactoring:** Remains on the proven single-database architecture with document-level `branchId` and `docType` filtering, avoiding disruptive architectural rewrites.

### Anti-Goals
- **Client-trusted `branchId`:** Never accept `branchId` from client body or query parameter without cryptographic verification against the session token.
- **Global document pollution:** Never allow operational documents (bills, sessions, orders) to use `GLOBAL_BRANCH_ID` (`*`). Only shared definitions (catalog, types, branches, users) may be global.

---

## 3. Constraints

1. **Mandatory `branchId` (M0 Invariant 4.1):** Every document must carry `branchId`. `GLOBAL_BRANCH_ID = '*'` is the sentinel for global docs.
2. **Integer Minor Units (M0 Invariant 4.2):** Money remains integer minor units (VND exponent 0).
3. **Headless UI with Vuetify0 & UnoCSS (M0 Invariant 4.8 & 4.9):** Interactive UI uses `@vuetify/v0` primitives (`Select.Root`, `Dialog`, `Button`, `Input`) styled with token shortcuts (`btn`, `panel-card`, `field-input`).
4. **Pure Domain Logic in `src/core/` (M0 Rule):** Domain logic must not import Vue, PouchDB, or Tauri APIs.
5. **i18n Parity (M0 Invariant 4.6):** All user-facing keys must exist in both `src/i18n/vi.json` and `src/i18n/en.json`.

---

## 4. Approaches Considered & Trade-Offs

### Approach 1: Client-Only Multi-Branch (Fastest, Local Focus)
- Add `BranchDoc` schema and a frontend branch switcher dropdown. Filter in memory and client-side.
- *Pros:* Quick to build, 100% TypeScript.
- *Cons:* Violates design spec §6.1. Any client can forge `branchId`. Tech debt would require rewriting auth later.

### Approach 2: Full-Stack Multi-Branch with axum Token Security (Recommended & Selected)
- Implement `BranchDoc` and `UserDoc` in core domain with TypeScript HMAC/Argon2id support.
- Implement LAN server token signing and axum middleware in `src-tauri/src/lan/` verifying branch access.
- Implement branch filtered sync rules for PouchDB.
- Build reactive `useActiveBranch()` and `BranchSwitcher.vue` UI in the POS header.
- Provide cross-branch owner reporting.
- *Pros:* Fully satisfies §6.1 security invariant, aligns directly with the authoritative design spec, prepares LAN server for M5 without rework.
- *Cons:* Crosses both Rust and TypeScript boundaries.

### Approach 3: Two-Tier Cloud Aggregator (Backend-Heavy)
- Require an upstream cloud CouchDB server with CouchDB security documents and server-side Mango replication filters.
- *Pros:* Enterprise standard for distributed databases.
- *Cons:* Requires active internet or heavy cloud mocks for tests; breaks offline-first developer ergonomics.

**Selection:** **Approach 2** was chosen because it delivers robust server-side security while preserving pure offline-first capabilities.

---

## 5. Detailed Design & Architecture

```
                                  ┌───────────────────────────────┐
                                  │      Cloud CouchDB (opt)      │
                                  └───────────────▲───────────────┘
                                                  │ Filtered Sync
                                                  │ (branchId + '*')
                                  ┌───────────────▼───────────────┐
                                  │   Desktop Hub (PouchDB-server)│
                                  └───────────────▲───────────────┘
                                                  │ Filtered LAN Sync
                        ┌─────────────────────────┴─────────────────────────┐
                        │                                                   │
         ┌──────────────▼──────────────┐                     ┌──────────────▼──────────────┐
         │     Terminal 1 (Branch A)   │                     │     Terminal 2 (Branch B)   │
         │ - branchId: "hq"            │                     │ - branchId: "dist1"         │
         │ - Token: role="cashier"     │                     │ - Token: role="manager"     │
         │ - pulls "hq" + "*" only     │                     │ - pulls "dist1" + "*" only  │
         └─────────────────────────────┘                     └─────────────────────────────┘
```

### 5.1 Data Models (`src/core/branch/` and `src/core/auth/`)

#### 1. `BranchDoc` (`branches` collection)
Document ID helper: `branchDocId(branchId: string)` -> `branch:<branchId>` (already in `src/core/db/ids.ts`).
```ts
export interface BranchDoc extends DocEnvelope {
  _id: string; // "branch:<branchId>"
  docType: 'branch';
  branchId: typeof GLOBAL_BRANCH_ID; // Branches themselves are global records
  code: string; // e.g. "HQ", "D1", "BT"
  name: string; // e.g. "Chi nhánh Quận 1"
  address: string;
  phone: string;
  timezone: string; // e.g. "Asia/Ho_Chi_Minh"
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

#### 2. `UserDoc` (`users` collection)
Document ID helper: `userDocId(userId: string)` -> `user:<userId>`.
```ts
export type UserRole = 'owner' | 'manager' | 'cashier' | 'staff';

export interface UserDoc extends DocEnvelope {
  _id: string; // "user:<userId>"
  docType: 'user';
  branchId: typeof GLOBAL_BRANCH_ID; // User accounts are globally replicated
  username: string;
  displayName: string;
  pinHash: string; // Argon2id hash of the numeric PIN
  role: UserRole;
  /**
   * Branches this user is authorized to access.
   * If role === 'owner', access to all branches is granted regardless of this list.
   * For manager/cashier/staff, must contain specific branch IDs.
   */
  branchIds: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

#### 3. `AuthTokenClaims` (Signed Session Token)
```ts
export interface AuthTokenClaims {
  sub: string; // userId
  username: string;
  role: UserRole;
  branchIds: string[];
  activeBranchId: string; // Currently active branch for this session
  exp: number; // Unix epoch seconds (e.g. now + 12h)
  iat: number;
}
```

---

### 5.2 Server-Side Token & Middleware Security (`src-tauri/src/lan/` & `sidecar/src/server.mjs`)

Per Spec §6.1, the server must never trust `branchId` passed in the HTTP request payload without verifying the signed token.

#### 1. Axum Server Endpoints (`src-tauri/src/lan/`):
- `POST /api/auth/login`
  - **Request:** `{ "username": "admin", "pin": "1234" }`
  - **Process:** Loads `UserDoc`, verifies PIN using `argon2::Argon2`, generates HMAC-SHA256 JWT containing `AuthTokenClaims`.
  - **Response:** `{ "token": "<jwt>", "user": { ... }, "activeBranchId": "hq" }`
- `POST /api/auth/switch-branch`
  - **Request:** Header `Authorization: Bearer <token>`, Body: `{ "targetBranchId": "dist1" }`
  - **Validation:** Verifies token; asserts user role is `owner` OR `branchIds.includes("dist1")`.
  - **Response:** New token with `activeBranchId: "dist1"`.
- **Axum Middleware `require_branch_access`:**
  - Intercepts requests to `/api/orders/*`, `/api/tables/*`, `/api/pos/*`.
  - Extracts and verifies JWT from `Authorization` header.
  - Compares request's target `branchId` against token's `activeBranchId` and `branchIds`. If user is `owner`, access is permitted across all branches. Otherwise, mismatched branch returns `403 Forbidden`.

#### 2. Sidecar Replication Security (`sidecar/src/server.mjs`):
Desktop terminals sync directly with the local sidecar hub (`sidecar/src/server.mjs`) via PouchDB HTTP protocol.
- **Sidecar Bearer Token Middleware:**
  - Inspects `Authorization: Bearer <token>` on replication endpoints (`_changes`, `_bulk_docs`, `_all_docs`, `PUT`).
  - Decodes and verifies the HMAC-SHA256 signature using the shared secret (`HUB_AUTH_SECRET`).
  - **Read Isolation (`_changes` & `_all_docs`):** Filters document streams to emit only documents where `doc.branchId === token.activeBranchId || doc.branchId === '*'`. Non-authorized branch documents are omitted from the change feed.
  - **Write Isolation (`_bulk_docs` & `PUT`):** Rejects any document with `status: 403` if `doc.branchId !== '*' && doc.branchId !== token.activeBranchId` (unless user role is `owner`).

*Note for local TS runtime:* A mirrored pure TypeScript authenticator (`src/core/auth/token.ts`) implements the identical token generation, verification, and Argon2id PIN validation algorithms so that in-memory tests, Vitest test suites, and client-side guards run identically without requiring a live Rust binary.

---

### 5.3 Filtered Replication Engine (`src/core/db/replication.ts`)

Terminals must not pull data belonging to other branches.

#### Filter Function: `branchFilter`
```ts
export function createBranchReplicationFilter(targetBranchId: string) {
  return function filterDoc(doc: DocEnvelope): boolean {
    if (doc.branchId === GLOBAL_BRANCH_ID) return true; // Global catalog, branches, users sync to all
    return doc.branchId === targetBranchId; // Branch operational data syncs only to its branch
  };
}
```

#### Database Topology:
- **Single-Database Architecture:** Retains the established single local store (`openpos_local` wrapped by `DbAdapter`), using document-level `branchId` and `docType` prefixes (`branch:<id>`, `user:<id>`, `product:<id>`). This avoids disrupting the existing repository contracts.
- **In-Memory Adapter Contract:**
  `src/core/db/memory-adapter.ts` already implements:
  ```ts
  docs.filter((d) => d.branchId === branchId || (includeGlobal && d.branchId === GLOBAL_BRANCH_ID))
  ```
  Formalized and verified with dedicated contract tests for cross-branch isolation.

---

### 5.4 Active Branch Context, User Auth & Switcher UI (`src/features/branch/` & `src/features/auth/`)

1. **`useCurrentUser` Composable (`src/core/auth/use-current-user.ts`):**
   - Manages active user session, token storage (`sessionStorage`), and decoded claims.
   - Provides role helpers: `isOwner`, `isManager`, `canAccessBranch(branchId: string)`.

2. **`UserLoginModal.vue` Component:**
   - Lightweight PIN pad dialog rendered on app launch if no active user session exists.
   - Quick PIN entry with numeric keypad and username selection.
   - Verifies PIN locally (offline-first via `src/core/auth/token.ts` / `UserDoc`) or against `/api/auth/login`.

3. **`useActiveBranch` Composable (`src/core/branch/use-active-branch.ts`):**
   - Holds reactive `currentBranch: Ref<BranchDoc>`.
   - Persists active branch ID to `localStorage` (defaulting to `DEFAULT_BRANCH_ID = 'hq'`).
   - Validates that the active user has rights to the selected branch before switching.

4. **`BranchSwitcher.vue` Component:**
   - Placed in the top POS navigation header next to cashier badge.
   - Shows active branch code and name.
   - Clicking opens a Vuetify0 `Select` / dropdown of authorized active branches.
   - For `cashier`/`staff` with a single branch, renders as static badge (no switching).
   - For `owner`/`manager`, allows one-click switching which updates `activeBranchId` across all views and refreshes the catalog/tables.

5. **`BranchAdminModal.vue`:**
   - Modal dialog for managing branches: list of branches, status toggles, adding new branch (code, name, address, phone).

---

### 5.5 Cross-Branch Aggregated Reporting (`src/core/reports/cross-branch.ts`)

#### Deployment & Execution Topology:
- **HQ Master Hub / Cloud Execution:** Because branch terminals filter out operational data from other branches (G4), cross-branch consolidated reporting executes exclusively on the **central HQ terminal, master hub, or cloud aggregator** where all branches' data is synchronized.
- Branch terminals display operational and sales reports strictly for their own assigned `branchId`.

#### Report Generation Interface:
```ts
export interface BranchSummaryReport {
  branchId: string;
  branchName: string;
  totalOrders: number;
  totalRevenue: Money;
  paidBillsCount: number;
}

export async function generateCrossBranchReport(
  adapter: DbAdapter,
  branchRepo: BranchRepository,
  dateRange: { start: string; end: string }
): Promise<{ branches: BranchSummaryReport[]; consolidatedRevenue: Money }>;
```
- Queries `adapter.allDocs({ branchId: undefined })` to retrieve bills across all branches on the master hub.
- Aggregates metrics grouped by `branchId`.
- Restricted: throws `UnauthorizedError` if called by a non-owner context.

---

## 6. What's Left to the Builder
- Detailed CSS styling for the `BranchSwitcher.vue` badge to match UnoCSS tokens.
- Default branch seed generator (`createDefaultBranches()`) with `'hq'` and sample branch `'dist1'`.
- Specific token expiration constants (default: 12 hours for staff shifts).
- Local fallback secret key generation when running in pure in-memory test mode.
