import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import PouchDB from 'pouchdb';
import memory from 'pouchdb-adapter-memory';
import { createEnvelope } from '../src/core/db/envelope';

PouchDB.plugin(memory);

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
  });
}

function makeLocalDb(name: string): PouchDB.Database {
  return new PouchDB(name, { adapter: 'memory' });
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'open-pos-sync-'));
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

describe('M0 acceptance: two terminals sync through the hub', () => {
  it('propagates a document written on terminal A to terminal B', async () => {
    const terminalA = makeLocalDb('terminal-a');
    const terminalB = makeLocalDb('terminal-b');
    const remoteA = new PouchDB(`${hubUrl}/openpos_sync`);

    const doc = createEnvelope({
      id: 'product:sync-probe',
      docType: 'product',
      branchId: 'hq',
      now: '2026-10-20T10:00:00.000Z',
    });

    await terminalA.put(doc);

    await new Promise<void>((resolve, reject) => {
      terminalA
        .replicate.to(remoteA)
        .on('complete', () => resolve())
        .on('error', (err: unknown) => reject(err));
    });

    await new Promise<void>((resolve, reject) => {
      terminalB
        .replicate.from(remoteA)
        .on('complete', () => resolve())
        .on('error', (err: unknown) => reject(err));
    });

    const seenOnB = await terminalB.get('product:sync-probe');
    expect(seenOnB).toMatchObject({ docType: 'product', branchId: 'hq' });
  }, 45_000);

  it('keeps accepting writes while the hub is unreachable (offline-first)', async () => {
    const terminalC = makeLocalDb('terminal-c');
    await terminalC.put(
      createEnvelope({ id: 'product:offline-probe', docType: 'product', branchId: 'hq' }),
    );

    const doc = await terminalC.get('product:offline-probe');
    expect(doc).toMatchObject({ _id: 'product:offline-probe', branchId: 'hq' });
  });

  it('catches up after the hub comes back', async () => {
    const terminalD = makeLocalDb('terminal-d');
    await terminalD.put(
      createEnvelope({ id: 'product:catchup-probe', docType: 'product', branchId: 'hq' }),
    );

    const remoteD = new PouchDB(`${hubUrl}/openpos_sync`);
    await new Promise<void>((resolve, reject) => {
      terminalD
        .replicate.to(remoteD)
        .on('complete', () => resolve())
        .on('error', (err: unknown) => reject(err));
    });

    const onHub = await remoteD.get('product:catchup-probe');
    expect(onHub).toMatchObject({ branchId: 'hq' });
  }, 45_000);
});
