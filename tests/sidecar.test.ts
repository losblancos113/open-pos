import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, '..', 'sidecar', 'src', 'server.mjs');

let hub: ChildProcess | undefined;
let dataDir: string | undefined;
let hubUrl = '';

function waitForHubUrl(proc: ChildProcess, timeoutMs: number): Promise<string> {
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
  dataDir = mkdtempSync(join(tmpdir(), 'open-pos-hub-'));
  hub = spawn(process.execPath, [serverPath], {
    env: { ...process.env, HUB_PORT: '0', HUB_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  hubUrl = await waitForHubUrl(hub, 30_000);
}, 45_000);

afterAll(async () => {
  if (hub && !hub.killed) {
    const exited = new Promise<void>((resolve) => {
      hub?.once('exit', () => resolve());
      setTimeout(resolve, 5_000);
    });
    hub.kill();
    await exited;
  }
  if (dataDir) {
    try {
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // Best-effort temp cleanup: a lingering file handle must not fail the suite.
    }
  }
});

describe('pouchdb-server sidecar', () => {
  it('starts, reports its URL, and serves the CouchDB welcome document', async () => {
    expect(hubUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const res = await fetch(hubUrl);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { couchdb?: string; express?: string };
    expect(body.couchdb).toBeTruthy();
  }, 45_000);

  it('accepts a document and serves it back', async () => {
    const put = await fetch(`${hubUrl}/openpos_probe`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ _id: 'probe:1', docType: 'probe', branchId: 'hq' }),
    });
    expect(put.status).toBe(201);

    const get = await fetch(`${hubUrl}/openpos_probe/probe:1`);
    expect(get.status).toBe(200);
    const doc = (await get.json()) as { _id: string; branchId: string };
    expect(doc._id).toBe('probe:1');
    expect(doc.branchId).toBe('hq');
  }, 45_000);
});
