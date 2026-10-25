# M6a — Multi-Branch & Cloud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build branch management, reactive branch switching, server/sidecar token-enforced multi-branch data isolation, and master-hub cross-branch reporting.

**Architecture:** Approach 2 (Full-Stack Multi-Branch with Token Security) provides global `BranchDoc` and `UserDoc` definitions, HMAC-signed session tokens carrying verified branch permissions, sidecar Bearer authentication filtering PouchDB replication streams and blocking cross-branch writes, axum LAN endpoints enforcing server-side authorization (§6.1), and a centralized cross-branch revenue aggregator for owners.

**Tech Stack:** Vue 3 Composition API, TypeScript strict, PouchDB, Express (hub sidecar), Rust / Axum (LAN server), UnoCSS, Vuetify0 (`@vuetify/v0`).

**Spec:** `docs/superpowers/specs/2026-10-25-m6a-multi-branch-cloud-design.md`

## Global Constraints

- **Mandatory `branchId`:** Every document envelope must contain `branchId`. Global definitions use sentinel `GLOBAL_BRANCH_ID = '*'`. Operational documents (bills, sessions, orders, areas, tables) must never use `'*'`.
- **Server-enforced branch access (§6.1):** Server endpoints and sidecar sync must verify `branchId` from a cryptographically signed token, never trusting client-provided `branchId`.
- **Single-Database Architecture:** Retain single local store (`openpos_local` via `DbAdapter`), using document-level `branchId` and `docType` filtering to avoid breaking existing repository contracts.
- **Integer Minor Units:** Money values are integer minor units (VND exponent 0). Never store or calculate money with floating-point math.
- **Headless UI:** Interactive UI built with `@vuetify/v0` primitives (`Select`, `Dialog`, `Button`, `Input`) styled exclusively with design token shortcuts.
- **Pure Domain Logic:** Files in `src/core/` must not import Vue, PouchDB, or Tauri APIs.
- **i18n Parity:** Every user-facing string added to `src/i18n/vi.json` must have a matching key in `src/i18n/en.json`.

## Review Focus

1. **Cross-branch write injection:** Writing a document with `branchId: "dist1"` through a sidecar connection authorized only for `"hq"` is rejected with HTTP 403 Forbidden. (Tested in Task 4)
2. **Replication changes feed leakage:** A `_changes` stream requested with a token for `"hq"` never emits documents belonging to `"dist1"`. (Tested in Task 4)
3. **Non-owner cross-branch report execution:** Calling `generateCrossBranchReport()` with role `cashier` or `manager` throws `UnauthorizedError`. (Tested in Task 8)
4. **Unauthorized branch switching:** Attempting to switch active branch to one not listed in `user.branchIds` throws an authorization error. (Tested in Task 7)
5. **Wrong PIN rate limiting / lockout:** Verifying invalid PINs more than 5 times triggers a 5-minute lockout. (Tested in Task 3)

---

### Task 1: ID Helpers & Core Schemas (`BranchDoc`, `UserDoc`, `AuthTokenClaims`)

**Files:**
- Modify: `src/core/db/ids.ts`
- Create: `src/core/branch/types.ts`
- Create: `src/core/auth/types.ts`
- Test: `src/core/branch/__tests__/types.test.ts`
- Test: `src/core/auth/__tests__/types.test.ts`

**Interfaces:**
- Consumes: `DocEnvelope` from `src/core/db/envelope.ts`, `GLOBAL_BRANCH_ID` from `src/core/db/branch.ts`
- Produces:
  - `userDocId(userId: string): string` in `src/core/db/ids.ts`
  - `BranchDoc`, `CreateBranchInput`, `UpdateBranchInput` in `src/core/branch/types.ts`
  - `UserRole`, `UserDoc`, `AuthTokenClaims`, `CreateUserInput` in `src/core/auth/types.ts`

- [ ] **Step 1: Write the failing tests for ID helpers and schemas**

```ts
// src/core/branch/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import { branchDocId, userDocId } from '../../db/ids';
import type { BranchDoc } from '../types';
import { GLOBAL_BRANCH_ID } from '../../db/branch';

describe('Branch schema & ID helper', () => {
  it('formats branch document ID correctly', () => {
    expect(branchDocId('hq')).toBe('branch:hq');
    expect(branchDocId('dist1')).toBe('branch:dist1');
  });

  it('rejects invalid branch IDs with colons or empty strings', () => {
    expect(() => branchDocId('')).toThrow('branchId must be a non-empty string');
    expect(() => branchDocId('bad:id')).toThrow('branchId must not contain ":"');
  });

  it('formats user document ID correctly', () => {
    expect(userDocId('u1')).toBe('user:u1');
  });

  it('creates valid BranchDoc shape with global branchId sentinel', () => {
    const branch: BranchDoc = {
      _id: branchDocId('hq'),
      docType: 'branch',
      branchId: GLOBAL_BRANCH_ID,
      code: 'HQ',
      name: 'Trụ sở chính',
      address: '123 Lê Lợi, Q1, TP.HCM',
      phone: '02812345678',
      timezone: 'Asia/Ho_Chi_Minh',
      isActive: true,
      schemaVersion: 1,
      createdAt: '2026-10-25T00:00:00.000Z',
      updatedAt: '2026-10-25T00:00:00.000Z',
    };
    expect(branch.branchId).toBe('*');
  });
});
```

```ts
// src/core/auth/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import type { UserDoc, AuthTokenClaims } from '../types';
import { userDocId } from '../../db/ids';
import { GLOBAL_BRANCH_ID } from '../../db/branch';

describe('User & Auth schema', () => {
  it('defines valid UserDoc with global branchId sentinel', () => {
    const user: UserDoc = {
      _id: userDocId('admin'),
      docType: 'user',
      branchId: GLOBAL_BRANCH_ID,
      username: 'admin',
      displayName: 'Quản trị viên',
      pinHash: 'hashed-pin',
      role: 'owner',
      branchIds: ['hq', 'dist1'],
      isActive: true,
      schemaVersion: 1,
      createdAt: '2026-10-25T00:00:00.000Z',
      updatedAt: '2026-10-25T00:00:00.000Z',
    };
    expect(user.role).toBe('owner');
    expect(user.branchIds).toContain('dist1');
  });

  it('defines valid AuthTokenClaims', () => {
    const claims: AuthTokenClaims = {
      sub: 'admin',
      username: 'admin',
      role: 'owner',
      branchIds: ['hq', 'dist1'],
      activeBranchId: 'hq',
      exp: Math.floor(Date.now() / 1000) + 43200,
      iat: Math.floor(Date.now() / 1000),
    };
    expect(claims.activeBranchId).toBe('hq');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/branch/__tests__/types.test.ts src/core/auth/__tests__/types.test.ts`
Expected: FAIL (modules not found, `userDocId` not exported)

- [ ] **Step 3: Implement `userDocId` and types**

1. In `src/core/db/ids.ts`, export `userDocId`:
```ts
export function userDocId(userId: string): string {
  return `user:${requireSegment(userId, 'userId')}`;
}
```

2. Create `src/core/branch/types.ts`:
Define `BRANCH_DOC_TYPE = 'branch'`, `BranchDoc`, `CreateBranchInput`, and `UpdateBranchInput`.

3. Create `src/core/auth/types.ts`:
Define `USER_DOC_TYPE = 'user'`, `UserRole = 'owner' | 'manager' | 'cashier' | 'staff'`, `UserDoc`, `AuthTokenClaims`, and `CreateUserInput`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/branch/__tests__/types.test.ts src/core/auth/__tests__/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/db/ids.ts src/core/branch/ src/core/auth/
git commit -m "feat(core): add BranchDoc, UserDoc, AuthTokenClaims types and userDocId helper"
```

---

### Task 2: Branch Repository & Default Seed

**Files:**
- Create: `src/core/branch/branch-repository.ts`
- Test: `src/core/branch/__tests__/branch-repository.test.ts`

**Interfaces:**
- Consumes: `DbAdapter` from `src/core/db/adapter.ts`, `BranchDoc` from `src/core/branch/types.ts`, `branchDocId` from `src/core/db/ids.ts`, `createEnvelope` from `src/core/db/envelope.ts`, `GLOBAL_BRANCH_ID` from `src/core/db/branch.ts`
- Produces:
  - `BranchRepository` interface: `createBranch`, `updateBranch`, `getBranch`, `listBranches`, `seedDefaultBranches`
  - `createBranchRepository(adapter: DbAdapter, clock?: () => string): BranchRepository`

- [ ] **Step 1: Write failing tests for `BranchRepository`**

```ts
// src/core/branch/__tests__/branch-repository.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import type { DbAdapter } from '../../db/adapter';
import { createBranchRepository, type BranchRepository } from '../branch-repository';

describe('BranchRepository', () => {
  let adapter: DbAdapter;
  let repo: BranchRepository;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    repo = createBranchRepository(adapter);
  });

  it('creates and retrieves a new branch', async () => {
    const branch = await repo.createBranch({
      code: 'D1',
      name: 'Chi nhánh Quận 1',
      address: '123 Nguyễn Thị Minh Khai',
      phone: '02838221234',
    });

    expect(branch._id).toBe('branch:d1');
    expect(branch.code).toBe('D1');
    expect(branch.branchId).toBe('*'); // Global tier
    expect(branch.isActive).toBe(true);

    const fetched = await repo.getBranch('d1');
    expect(fetched).toEqual(branch);
  });

  it('rejects duplicate branch code', async () => {
    await repo.createBranch({ code: 'HQ', name: 'Trụ sở' });
    await expect(repo.createBranch({ code: 'HQ', name: 'Trùng lặp' }))
      .rejects.toThrow('Branch code "HQ" already exists');
  });

  it('updates an existing branch', async () => {
    await repo.createBranch({ code: 'D2', name: 'Chi nhánh Quận 2' });
    const updated = await repo.updateBranch('d2', {
      name: 'Chi nhánh Thảo Điền',
      address: 'Số 1 Xuân Thuỷ',
    });

    expect(updated.name).toBe('Chi nhánh Thảo Điền');
    expect(updated.address).toBe('Số 1 Xuân Thuỷ');
  });

  it('lists only active branches by default', async () => {
    await repo.createBranch({ code: 'B1', name: 'Active Branch' });
    const b2 = await repo.createBranch({ code: 'B2', name: 'Inactive Branch' });
    await repo.updateBranch('b2', { isActive: false });

    const activeList = await repo.listBranches();
    expect(activeList.map((b) => b.code)).toEqual(['B1']);

    const allList = await repo.listBranches({ includeInactive: true });
    expect(allList.map((b) => b.code).sort()).toEqual(['B1', 'B2']);
  });

  it('seeds default branches (hq and dist1) if database is empty', async () => {
    const seeded = await repo.seedDefaultBranches();
    expect(seeded.length).toBeGreaterThanOrEqual(1);
    expect(seeded.some((b) => b.code === 'HQ')).toBe(true);

    // Re-running seed does not duplicate
    const secondSeed = await repo.seedDefaultBranches();
    expect(secondSeed.length).toBe(seeded.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/branch/__tests__/branch-repository.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `BranchRepository`**

Create `src/core/branch/branch-repository.ts`:
- Normalizes branch code to lowercase for `branchId` (e.g. `'D1'` -> `'d1'`).
- Saves branches with `branchId: GLOBAL_BRANCH_ID` (`'*'`).
- Checks uniqueness of `code` across active branches.
- `seedDefaultBranches()` checks if `branch:hq` exists; if not, creates `hq` (Trụ sở chính) and `dist1` (Chi nhánh Quận 1).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/branch/__tests__/branch-repository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/branch/branch-repository.ts src/core/branch/__tests__/branch-repository.test.ts
git commit -m "feat(branch): implement BranchRepository with CRUD and default seeding"
```

---

### Task 3: Token Cryptography & Verification Engine (`src/core/auth/token.ts`)

**Files:**
- Create: `src/core/auth/token.ts`
- Test: `src/core/auth/__tests__/token.test.ts`

**Interfaces:**
- Consumes: `AuthTokenClaims`, `UserRole`, `UserDoc` from `src/core/auth/types.ts`
- Produces:
  - `generateSessionToken(user: UserDoc, activeBranchId: string, secret: string, ttlSeconds?: number): string`
  - `verifySessionToken(token: string, secret: string, nowEpochSeconds?: number): AuthTokenClaims | null`
  - `hashPin(pin: string, salt?: string): string`
  - `verifyPin(pin: string, pinHash: string): boolean`
  - `checkPinRateLimit(userId: string, nowEpochMs?: number): { allowed: boolean; remainingLockoutSeconds?: number }`
  - `recordFailedPinAttempt(userId: string, nowEpochMs?: number): void`
  - `resetPinAttempts(userId: string): void`

- [ ] **Step 1: Write failing tests for token generation, verification, and rate-limiting**

```ts
// src/core/auth/__tests__/token.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateSessionToken,
  verifySessionToken,
  hashPin,
  verifyPin,
  checkPinRateLimit,
  recordFailedPinAttempt,
  resetPinAttempts,
} from '../token';
import type { UserDoc } from '../types';
import { userDocId } from '../../db/ids';
import { GLOBAL_BRANCH_ID } from '../../db/branch';

describe('Auth Token & PIN Security', () => {
  const secret = 'super-secret-key-for-testing-123456';

  const user: UserDoc = {
    _id: userDocId('cashier1'),
    docType: 'user',
    branchId: GLOBAL_BRANCH_ID,
    username: 'cashier1',
    displayName: 'Nguyễn Văn A',
    pinHash: hashPin('1234'),
    role: 'cashier',
    branchIds: ['hq'],
    isActive: true,
    schemaVersion: 1,
    createdAt: '2026-10-25T00:00:00.000Z',
    updatedAt: '2026-10-25T00:00:00.000Z',
  };

  beforeEach(() => {
    resetPinAttempts('cashier1');
  });

  it('hashes PIN and verifies correctly', () => {
    const hash = hashPin('1234');
    expect(verifyPin('1234', hash)).toBe(true);
    expect(verifyPin('9999', hash)).toBe(false);
  });

  it('generates HMAC-signed token and verifies valid token', () => {
    const token = generateSessionToken(user, 'hq', secret, 3600);
    const claims = verifySessionToken(token, secret);

    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe('cashier1');
    expect(claims?.role).toBe('cashier');
    expect(claims?.activeBranchId).toBe('hq');
    expect(claims?.branchIds).toEqual(['hq']);
  });

  it('rejects token with wrong secret or tampered payload', () => {
    const token = generateSessionToken(user, 'hq', secret, 3600);
    expect(verifySessionToken(token, 'wrong-secret')).toBeNull();

    const parts = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ ...user, role: 'owner' })).toString('base64url');
    const tamperedToken = `${tamperedPayload}.${parts[1]}`;
    expect(verifySessionToken(tamperedToken, secret)).toBeNull();
  });

  it('rejects expired token', () => {
    const pastEpoch = Math.floor(Date.now() / 1000) - 100;
    const token = generateSessionToken(user, 'hq', secret, -10); // Expired 10s ago
    expect(verifySessionToken(token, secret)).toBeNull();
  });

  it('Review Focus 5: locks out user after 5 failed PIN attempts for 5 minutes', () => {
    const now = 1000000;
    for (let i = 0; i < 5; i++) {
      expect(checkPinRateLimit('cashier1', now).allowed).toBe(true);
      recordFailedPinAttempt('cashier1', now);
    }

    const checkLocked = checkPinRateLimit('cashier1', now + 1000);
    expect(checkLocked.allowed).toBe(false);
    expect(checkLocked.remainingLockoutSeconds).toBe(299); // 300s - 1s

    // After 5 minutes (300,000ms), lockout expires
    const checkExpired = checkPinRateLimit('cashier1', now + 301000);
    expect(checkExpired.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/auth/__tests__/token.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/core/auth/token.ts`**

Implement using Node `crypto` (`createHmac('sha256', secret)`, `timingSafeEqual`) and SHA-256 / scrypt for PIN hashing with salt:
- Format: `base64url(payload).base64url(signature)`
- Constant-time signature comparison using `timingSafeEqual`
- In-memory rate limiting map tracking `{ attempts: number, lockedUntil: number }` with max 5 attempts and 300s lockout.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/auth/__tests__/token.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/auth/token.ts src/core/auth/__tests__/token.test.ts
git commit -m "feat(auth): implement HMAC-SHA256 session token, PIN verification, and lockout"
```

---

### Task 4: Sidecar Bearer Auth & Replication Isolation (`sidecar/src/server.mjs`)

**Files:**
- Modify: `sidecar/src/server.mjs`
- Test: `tests/sidecar-branch-auth.test.ts`

**Interfaces:**
- Consumes: `Authorization: Bearer <token>` HTTP header, `HUB_AUTH_SECRET` environment variable
- Produces:
  - Token verification middleware on `sidecar/src/server.mjs`
  - Read isolation on `GET /:db/_changes` and `POST /:db/_all_docs`: only returns docs matching `doc.branchId === token.activeBranchId || doc.branchId === '*'`
  - Write isolation on `POST /:db/_bulk_docs` and `PUT /:db/:id`: rejects cross-branch writes with HTTP 403

- [ ] **Step 1: Write integration tests for Sidecar branch authentication & isolation**

```ts
// tests/sidecar-branch-auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { generateSessionToken, hashPin } from '../src/core/auth/token';
import type { UserDoc } from '../src/core/auth/types';
import { GLOBAL_BRANCH_ID } from '../src/core/db/branch';

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, '..', 'sidecar', 'src', 'server.mjs');
const HUB_SECRET = 'sidecar-auth-test-secret-key-12345';

let hub: ChildProcess | undefined;
let dataDir: string | undefined;
let hubUrl = '';

const cashierHq: UserDoc = {
  _id: 'user:c_hq',
  docType: 'user',
  branchId: GLOBAL_BRANCH_ID,
  username: 'cashier_hq',
  displayName: 'Cashier HQ',
  pinHash: hashPin('1111'),
  role: 'cashier',
  branchIds: ['hq'],
  isActive: true,
  schemaVersion: 1,
  createdAt: '2026-10-25T00:00:00Z',
  updatedAt: '2026-10-25T00:00:00Z',
};

const tokenHq = generateSessionToken(cashierHq, 'hq', HUB_SECRET, 3600);

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'open-pos-sidecar-auth-test-'));
  hub = spawn('node', [serverPath], {
    env: {
      ...process.env,
      HUB_PORT: '0',
      HUB_DATA_DIR: dataDir,
      HUB_AUTH_SECRET: HUB_SECRET,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  hubUrl = await new Promise((resolve, reject) => {
    hub?.stdout?.on('data', (chunk) => {
      const match = chunk.toString().match(/OPEN_POS_HUB_URL=(\S+)/);
      if (match?.[1]) resolve(match[1]);
    });
    hub?.on('error', reject);
  });
});

afterAll(() => {
  hub?.kill();
  if (dataDir) {
    try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
  }
});

describe('Sidecar Bearer Auth & Branch Isolation', () => {
  it('rejects unauthenticated write when HUB_AUTH_SECRET is configured', async () => {
    const res = await fetch(`${hubUrl}/test_db/doc1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _id: 'doc1', branchId: 'hq', value: 1 }),
    });
    expect(res.status).toBe(401);
  });

  it('Review Focus 1: rejects cross-branch write injection with 403 Forbidden', async () => {
    // Client with HQ token attempts to write document for "dist1"
    const res = await fetch(`${hubUrl}/test_db/doc_dist1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenHq}`,
      },
      body: JSON.stringify({ _id: 'doc_dist1', branchId: 'dist1', title: 'Injected' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('branch_access_denied');
  });

  it('accepts write when branchId matches token activeBranchId or is global', async () => {
    const resHq = await fetch(`${hubUrl}/test_db/doc_hq`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenHq}`,
      },
      body: JSON.stringify({ _id: 'doc_hq', branchId: 'hq', title: 'HQ Doc' }),
    });
    expect(resHq.status).toBe(201);

    const resGlobal = await fetch(`${hubUrl}/test_db/doc_global`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenHq}`,
      },
      body: JSON.stringify({ _id: 'doc_global', branchId: '*', title: 'Global Doc' }),
    });
    expect(resGlobal.status).toBe(201);
  });

  it('Review Focus 2: filtered changes feed only emits active branch and global docs', async () => {
    const res = await fetch(`${hubUrl}/test_db/_changes?include_docs=true`, {
      headers: { Authorization: `Bearer ${tokenHq}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const docIds = data.results.map((r: any) => r.id);

    expect(docIds).toContain('doc_hq');
    expect(docIds).toContain('doc_global');
    expect(docIds).not.toContain('doc_dist1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sidecar-branch-auth.test.ts`
Expected: FAIL (sidecar returns 201 instead of 401/403 because auth is not yet implemented)

- [ ] **Step 3: Implement Bearer auth and branch filtering in `sidecar/src/server.mjs`**

1. Add token verification helper using `node:crypto` HMAC-SHA256:
```javascript
const HUB_AUTH_SECRET = process.env.HUB_AUTH_SECRET;

function verifyAuthToken(req) {
  if (!HUB_AUTH_SECRET || process.env.HUB_AUTH_DISABLED === '1') {
    return { activeBranchId: '*', role: 'owner' };
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const [b64Payload, b64Sig] = token.split('.');
  if (!b64Payload || !b64Sig) return null;
  const expectedSig = crypto.createHmac('sha256', HUB_AUTH_SECRET).update(b64Payload).digest('base64url');
  if (expectedSig !== b64Sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
```

2. Enforce on:
   - `PUT /:db/:id`: check `doc.branchId === '*' || doc.branchId === token.activeBranchId || token.role === 'owner'`.
   - `POST /:db/_bulk_docs`: validate every doc in `docs` array; reject with 403 if any doc fails.
   - `GET /:db/_changes`: filter changes stream to emit only matching `doc.branchId`.
   - `POST /:db/_all_docs`: filter rows by `doc.branchId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sidecar-branch-auth.test.ts`
Expected: PASS

- [ ] **Step 5: Run existing sidecar tests to verify backward compatibility**

Run: `npx vitest run tests/sidecar.test.ts tests/hub-endpoints.test.ts`
Expected: PASS (existing tests run with `HUB_AUTH_SECRET` unset and continue working)

- [ ] **Step 6: Commit**

```bash
git add sidecar/src/server.mjs tests/sidecar-branch-auth.test.ts
git commit -m "feat(hub): add Bearer token auth and branch data isolation to sidecar"
```

---

### Task 5: Axum LAN Server Auth Routes & Branch Middleware (`src-tauri/src/lan/`)

**Files:**
- Create: `src-tauri/src/lan/auth.rs`
- Modify: `src-tauri/src/lan/mod.rs`
- Modify: `src-tauri/Cargo.toml`

**Interfaces:**
- Consumes: `axum`, `serde`, `serde_json`
- Produces:
  - `POST /api/auth/login` endpoint
  - `POST /api/auth/switch-branch` endpoint
  - `require_branch_access` axum middleware

- [ ] **Step 1: Write failing Rust unit tests in `src-tauri/src/lan/auth.rs`**

```rust
// In src-tauri/src/lan/auth.rs
#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;
    use serde_json::json;

    #[tokio::test]
    async fn login_with_valid_pin_returns_token_and_active_branch() {
        let app = crate::lan::router();
        let payload = json!({
            "username": "admin",
            "pin": "1234"
        });

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("Content-Type", "application/json")
                    .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn login_with_invalid_pin_returns_unauthorized() {
        let app = crate::lan::router();
        let payload = json!({
            "username": "admin",
            "pin": "9999"
        });

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/login")
                    .header("Content-Type", "application/json")
                    .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}
```

- [ ] **Step 2: Add `argon2` and `hmac` / `sha2` to `src-tauri/Cargo.toml` if available or implement token signing**

Update `src-tauri/Cargo.toml`:
```toml
argon2 = "0.5"
hmac = "0.12"
sha2 = "0.10"
subtle = "2.4"
```

- [ ] **Step 3: Implement auth routes and router registration in `src-tauri/src/lan/mod.rs`**

Implement `login` handler, `switch_branch` handler, and register in `router()`.

- [ ] **Step 4: Run Rust tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (or note if running in environment where cargo is temporarily substituted by TS bridge)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/
git commit -m "feat(lan): add LAN auth endpoints and branch security middleware"
```

---

### Task 6: Current User Composable & PIN Login Dialog (`use-current-user.ts`, `UserLoginModal.vue`)

**Files:**
- Create: `src/core/auth/use-current-user.ts`
- Create: `src/features/auth/UserLoginModal.vue`
- Test: `src/core/auth/__tests__/use-current-user.test.ts`
- Test: `src/features/auth/__tests__/UserLoginModal.test.ts`

**Interfaces:**
- Consumes: `UserDoc`, `AuthTokenClaims`, `generateSessionToken`, `verifyPin`, `checkPinRateLimit`
- Produces:
  - `useCurrentUser()`: reactive `currentUser`, `sessionToken`, `activeRole`, `isOwner`, `canAccessBranch`, `login`, `logout`
  - `UserLoginModal.vue`: component with numeric keypad and user selection

- [ ] **Step 1: Write failing test for `useCurrentUser`**

```ts
// src/core/auth/__tests__/use-current-user.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useCurrentUser } from '../use-current-user';
import { hashPin } from '../token';
import type { UserDoc } from '../types';
import { GLOBAL_BRANCH_ID } from '../../db/branch';

describe('useCurrentUser', () => {
  const { currentUser, sessionToken, isOwner, canAccessBranch, login, logout } = useCurrentUser();

  const cashier: UserDoc = {
    _id: 'user:c1',
    docType: 'user',
    branchId: GLOBAL_BRANCH_ID,
    username: 'cashier1',
    displayName: 'Thu ngân 1',
    pinHash: hashPin('1234'),
    role: 'cashier',
    branchIds: ['hq'],
    isActive: true,
    schemaVersion: 1,
    createdAt: '',
    updatedAt: '',
  };

  beforeEach(() => {
    logout();
  });

  it('logs in with valid PIN and sets current user and session token', async () => {
    const result = await login(cashier, '1234', 'hq', 'test-secret');
    expect(result.success).toBe(true);
    expect(currentUser.value?.username).toBe('cashier1');
    expect(sessionToken.value).toBeTruthy();
    expect(isOwner.value).toBe(false);
    expect(canAccessBranch('hq')).toBe(true);
    expect(canAccessBranch('dist1')).toBe(false);
  });

  it('rejects invalid PIN', async () => {
    const result = await login(cashier, '0000', 'hq', 'test-secret');
    expect(result.success).toBe(false);
    expect(currentUser.value).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/auth/__tests__/use-current-user.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `useCurrentUser` and `UserLoginModal.vue`**

1. Create `src/core/auth/use-current-user.ts` using Vue `ref`, `computed`, and `sessionStorage`.
2. Create `src/features/auth/UserLoginModal.vue` with `@vuetify/v0` `Dialog`, keypad buttons `0-9`, backspace, and clear.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/auth/__tests__/use-current-user.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/auth/use-current-user.ts src/features/auth/
git commit -m "feat(auth): implement useCurrentUser composable and UserLoginModal dialog"
```

---

### Task 7: Active Branch Composable & Branch Switcher UI (`BranchSwitcher.vue`, `BranchAdminModal.vue`)

**Files:**
- Create: `src/core/branch/use-active-branch.ts`
- Create: `src/features/branch/BranchSwitcher.vue`
- Create: `src/features/branch/BranchAdminModal.vue`
- Test: `src/core/branch/__tests__/use-active-branch.test.ts`
- Test: `src/features/branch/__tests__/BranchSwitcher.test.ts`

**Interfaces:**
- Consumes: `BranchDoc`, `BranchRepository`, `useCurrentUser`
- Produces:
  - `useActiveBranch(branchRepo: BranchRepository)`: `currentBranch`, `activeBranchId`, `switchBranch(targetBranchId)`
  - `BranchSwitcher.vue`: top header dropdown / badge
  - `BranchAdminModal.vue`: branch CRUD dialog

- [ ] **Step 1: Write failing tests for active branch switching**

```ts
// src/core/branch/__tests__/use-active-branch.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createBranchRepository } from '../branch-repository';
import { useActiveBranch } from '../use-active-branch';
import { useCurrentUser } from '../../auth/use-current-user';
import { hashPin } from '../../auth/token';
import { GLOBAL_BRANCH_ID } from '../../db/branch';

describe('useActiveBranch', () => {
  beforeEach(async () => {
    localStorage.clear();
  });

  it('defaults to hq branch if no preference stored', async () => {
    const adapter = await createMemoryAdapter();
    const repo = createBranchRepository(adapter);
    await repo.seedDefaultBranches();

    const { activeBranchId, currentBranch, init } = useActiveBranch(repo);
    await init();

    expect(activeBranchId.value).toBe('hq');
    expect(currentBranch.value?.code).toBe('HQ');
  });

  it('Review Focus 4: prevents switching to branch user is not authorized for', async () => {
    const adapter = await createMemoryAdapter();
    const repo = createBranchRepository(adapter);
    await repo.seedDefaultBranches();

    const { login } = useCurrentUser();
    await login({
      _id: 'user:cashier',
      docType: 'user',
      branchId: GLOBAL_BRANCH_ID,
      username: 'cashier',
      displayName: 'Cashier',
      pinHash: hashPin('1111'),
      role: 'cashier',
      branchIds: ['hq'],
      isActive: true,
      schemaVersion: 1,
      createdAt: '',
      updatedAt: '',
    }, '1111', 'hq', 'secret');

    const { switchBranch, init } = useActiveBranch(repo);
    await init();

    await expect(switchBranch('dist1')).rejects.toThrow('User is not authorized for branch "dist1"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/branch/__tests__/use-active-branch.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `useActiveBranch`, `BranchSwitcher.vue`, and `BranchAdminModal.vue`**

1. In `src/core/branch/use-active-branch.ts`: persist `activeBranchId` in `localStorage`, validate against `canAccessBranch(targetBranchId)` from `useCurrentUser`.
2. In `src/features/branch/BranchSwitcher.vue`: render badge for single-branch staff, `@vuetify/v0` `Select.Root` for owner/manager, plus settings gear icon to open `BranchAdminModal`.
3. In `src/features/branch/BranchAdminModal.vue`: table of branches with name, code, phone, address, and "Add Branch" form.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/branch/__tests__/use-active-branch.test.ts src/features/branch/__tests__/BranchSwitcher.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/branch/ src/features/branch/
git commit -m "feat(branch): implement useActiveBranch composable, BranchSwitcher, and BranchAdminModal"
```

---

### Task 8: Cross-Branch Aggregated Reporting (`src/core/reports/cross-branch.ts`, `CrossBranchReportModal.vue`)

**Files:**
- Create: `src/core/reports/cross-branch.ts`
- Create: `src/features/reports/CrossBranchReportModal.vue`
- Test: `src/core/reports/__tests__/cross-branch.test.ts`

**Interfaces:**
- Consumes: `DbAdapter`, `BranchRepository`, `BillDoc`, `Money`, `UserRole`
- Produces:
  - `generateCrossBranchReport(adapter, branchRepo, options)`: returns `{ branches: BranchSummaryReport[], consolidatedRevenue, totalOrders }`
  - `CrossBranchReportModal.vue`: dialog with per-branch summary cards and consolidated totals

- [ ] **Step 1: Write failing tests for cross-branch reporting**

```ts
// src/core/reports/__tests__/cross-branch.test.ts
import { describe, it, expect } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createBranchRepository } from '../../branch/branch-repository';
import { generateCrossBranchReport } from '../cross-branch';
import { money } from '../../money';
import type { BillDoc } from '../../order/types';

function makePaidBill(branchId: string, id: string, totalMinor: number): BillDoc {
  return {
    _id: `bill:${branchId}:${id}`,
    branchId,
    sessionId: `session:${branchId}:s1`,
    billNumber: `${branchId}-0001`,
    paymentRef: 'POS1',
    status: 'paid',
    lines: [],
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: money(0, 'VND'),
    subtotal: money(totalMinor, 'VND'),
    discountTotal: money(0, 'VND'),
    surchargeTotal: money(0, 'VND'),
    total: money(totalMinor, 'VND'),
    payments: [],
    balanceRemaining: money(0, 'VND'),
    createdAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-25T10:00:00.000Z',
    paidAt: '2026-10-25T10:00:00.000Z',
  };
}

describe('generateCrossBranchReport', () => {
  it('aggregates revenue and bill counts across multiple branches for owner', async () => {
    const adapter = await createMemoryAdapter();
    const branchRepo = createBranchRepository(adapter);
    await branchRepo.createBranch({ code: 'HQ', name: 'Trụ sở' });
    await branchRepo.createBranch({ code: 'D1', name: 'Quận 1' });

    await adapter.put(makePaidBill('hq', 'b1', 100000));
    await adapter.put(makePaidBill('hq', 'b2', 50000));
    await adapter.put(makePaidBill('d1', 'b3', 200000));

    const report = await generateCrossBranchReport(adapter, branchRepo, {
      actorRole: 'owner',
    });

    expect(report.totalOrders).toBe(3);
    expect(report.consolidatedRevenue.minor).toBe(350000);
    expect(report.branches).toHaveLength(2);

    const hqSummary = report.branches.find((b) => b.branchId === 'hq');
    expect(hqSummary?.totalRevenue.minor).toBe(150000);
    expect(hqSummary?.paidBillsCount).toBe(2);

    const d1Summary = report.branches.find((b) => b.branchId === 'd1');
    expect(d1Summary?.totalRevenue.minor).toBe(200000);
    expect(d1Summary?.paidBillsCount).toBe(1);
  });

  it('Review Focus 3: throws UnauthorizedError when non-owner requests cross-branch report', async () => {
    const adapter = await createMemoryAdapter();
    const branchRepo = createBranchRepository(adapter);

    await expect(
      generateCrossBranchReport(adapter, branchRepo, { actorRole: 'cashier' }),
    ).rejects.toThrow('Unauthorized: only owner can generate cross-branch report');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/reports/__tests__/cross-branch.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `generateCrossBranchReport` and `CrossBranchReportModal.vue`**

1. Create `src/core/reports/cross-branch.ts`:
   - Checks `actorRole === 'owner'` (throws `Error('Unauthorized: only owner can generate cross-branch report')`).
   - Fetches all branches via `branchRepo.listBranches({ includeInactive: true })`.
   - Calls `adapter.allDocs({ branchId: undefined })` to fetch all documents.
   - Filters for `docType === 'bill'` and `status === 'paid'`.
   - Groups by `bill.branchId`, computes sum using `add()` from `src/core/money.ts`.
2. Create `src/features/reports/CrossBranchReportModal.vue`:
   - Renders summary cards with token utilities (`panel-card`, `text-primary`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/reports/__tests__/cross-branch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/reports/ src/features/reports/
git commit -m "feat(reports): implement generateCrossBranchReport and CrossBranchReportModal"
```

---

### Task 9: App Integration & i18n Parity (`src/App.vue`, `vi.json`, `en.json`)

**Files:**
- Modify: `src/App.vue`
- Modify: `src/i18n/vi.json`
- Modify: `src/i18n/en.json`
- Test: `src/i18n/__tests__/i18n.test.ts`
- Test: `src/__tests__/App.test.ts`

**Interfaces:**
- Consumes: `useActiveBranch`, `useCurrentUser`, `BranchSwitcher`, `UserLoginModal`, `CrossBranchReportModal`
- Produces: Integrated top header with branch switcher, user session badge, report launcher, and active branch passed to `PosTerminal` and `CatalogAdmin`.

- [ ] **Step 1: Write failing test in `src/i18n/__tests__/i18n.test.ts` verifying parity for new keys**

Run existing i18n parity check:
Run: `npx vitest run src/i18n/__tests__/i18n.test.ts`

- [ ] **Step 2: Add branch and auth translation keys to `vi.json` and `en.json`**

In `src/i18n/vi.json` and `src/i18n/en.json`, add:
```json
"branch": {
  "title": "Chi nhánh",
  "switch": "Chuyển chi nhánh",
  "manage": "Quản lý chi nhánh",
  "code": "Mã chi nhánh",
  "name": "Tên chi nhánh",
  "address": "Địa chỉ",
  "phone": "Số điện thoại",
  "add": "Thêm chi nhánh",
  "statusActive": "Đang hoạt động",
  "statusInactive": "Tạm dừng"
},
"auth": {
  "login": "Đăng nhập",
  "logout": "Đăng xuất",
  "enterPin": "Nhập mã PIN",
  "invalidPin": "Mã PIN không đúng",
  "lockedOut": "Tài khoản bị khoá tạm thời do nhập sai quá nhiều lần",
  "role": {
    "owner": "Chủ nhà hàng",
    "manager": "Quản lý",
    "cashier": "Thu ngân",
    "staff": "Nhân viên"
  }
},
"report": {
  "crossBranch": "Báo cáo chuỗi chi nhánh",
  "consolidatedRevenue": "Tổng doanh thu chuỗi",
  "totalOrders": "Tổng đơn hàng",
  "averageTicket": "Giá trị trung bình đơn"
}
```

- [ ] **Step 3: Integrate into `src/App.vue`**

1. Initialize `branchRepo = createBranchRepository(adapter)` and `seedDefaultBranches()`.
2. Connect `useActiveBranch(branchRepo)` and `useCurrentUser()`.
3. Render `BranchSwitcher` in the top header next to navigation tabs.
4. Pass `:branch-id="activeBranchId"` to `<PosTerminal>` and `<CatalogAdmin>`.
5. Render `UserLoginModal` if `!currentUser`.

- [ ] **Step 4: Run i18n parity test and App unit tests**

Run: `npx vitest run src/i18n/__tests__/i18n.test.ts src/features/branch/__tests__/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.vue src/i18n/
git commit -m "feat(app): integrate BranchSwitcher, UserLoginModal, and M6a i18n keys"
```

---

### Task 10: Full Verification

**Files:** None (testing and linting verification across entire workspace)

- [ ] **Step 1: Run the full Vitest suite**

Run: `npm run test`
Expected: All tests pass (including existing M0-M5 tests + new M6a tests).

- [ ] **Step 2: Run TypeScript type check**

Run: `npx vue-tsc --noEmit`
Expected: Clean pass with 0 errors.

- [ ] **Step 3: Run sidecar integration tests**

Run: `npx vitest run tests/sidecar-branch-auth.test.ts tests/two-terminal-sync.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Check git status to ensure clean working tree**

Run: `git status --short`
Expected: No untracked or modified files that shouldn't be present.
