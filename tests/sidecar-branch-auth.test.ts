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

const ownerUser: UserDoc = {
  _id: 'user:admin',
  docType: 'user',
  branchId: GLOBAL_BRANCH_ID,
  username: 'admin',
  displayName: 'Admin Owner',
  pinHash: hashPin('8888'),
  role: 'owner',
  branchIds: ['hq', 'dist1'],
  isActive: true,
  schemaVersion: 1,
  createdAt: '2026-10-25T00:00:00Z',
  updatedAt: '2026-10-25T00:00:00Z',
};

const tokenOwner = generateSessionToken(ownerUser, 'dist1', HUB_SECRET, 3600);

function waitForHubUrl(proc: ChildProcess, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('hub did not report URL in time')), timeoutMs);
    let buffer = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = buffer.match(/OPEN_POS_HUB_URL=(\S+)/);
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`hub exited early with code ${code}`));
    });
  });
}

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

  hubUrl = await waitForHubUrl(hub);
});

afterAll(() => {
  hub?.kill();
  if (dataDir) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {}
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
        Authorization: `Bearer ${tokenOwner}`,
      },
      body: JSON.stringify({ _id: 'doc_global', branchId: '*', title: 'Global Doc' }),
    });
    expect(resGlobal.status).toBe(201);

    // Seed doc_dist1 using owner token
    const resDist1 = await fetch(`${hubUrl}/test_db/doc_dist1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenOwner}`,
      },
      body: JSON.stringify({ _id: 'doc_dist1', branchId: 'dist1', title: 'Dist1 Doc' }),
    });
    expect(resDist1.status).toBe(201);
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

  it('Finding 1: rejects unauthenticated DELETE and cross-branch DELETE', async () => {
    const getRes = await fetch(`${hubUrl}/test_db/doc_dist1`, {
      headers: { Authorization: `Bearer ${tokenOwner}` },
    });
    const docDist1 = await getRes.json();

    // Unauthenticated delete
    const resUnauth = await fetch(`${hubUrl}/test_db/doc_dist1?rev=${docDist1._rev}`, {
      method: 'DELETE',
    });
    expect(resUnauth.status).toBe(401);

    // Cross-branch delete with HQ cashier token against doc_dist1
    const resForbidden = await fetch(`${hubUrl}/test_db/doc_dist1?rev=${docDist1._rev}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenHq}` },
    });
    expect(resForbidden.status).toBe(403);
  });

  it('Finding 1: rejects cross-branch direct GET /:db/:id', async () => {
    // Attempting to read another branch's doc directly by ID
    const res = await fetch(`${hubUrl}/test_db/doc_dist1`, {
      headers: { Authorization: `Bearer ${tokenHq}` },
    });
    expect(res.status).toBe(403);
  });

  it('Finding 3: rejects non-owner attempting to write global document (branchId: "*")', async () => {
    const res = await fetch(`${hubUrl}/test_db/injected_global`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenHq}`,
      },
      body: JSON.stringify({ _id: 'injected_global', branchId: '*', title: 'Pollution' }),
    });
    expect(res.status).toBe(403);
  });
});
