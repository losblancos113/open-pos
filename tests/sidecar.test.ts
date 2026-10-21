import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
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

function putDoc(db: string, id: string, body: unknown, rev?: string): Promise<Response> {
  const qs = rev ? `?rev=${encodeURIComponent(rev)}` : '';
  return fetch(`${hubUrl}/${db}/${id}${qs}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function putLocal(db: string, id: string, body: unknown, rev?: string): Promise<Response> {
  const qs = rev ? `?rev=${encodeURIComponent(rev)}` : '';
  return fetch(`${hubUrl}/${db}/_local/${id}${qs}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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

  it('creates a database and serves a written document back', async () => {
    const create = await fetch(`${hubUrl}/openpos_probe`, { method: 'PUT' });
    expect(create.status).toBe(201);

    const put = await putDoc('openpos_probe', 'probe:1', {
      docType: 'probe',
      branchId: 'hq',
    });
    expect(put.status).toBe(201);
    const written = (await put.json()) as { rev: string };
    expect(written.rev).toBeTruthy();

    const get = await fetch(`${hubUrl}/openpos_probe/probe:1`);
    expect(get.status).toBe(200);
    const doc = (await get.json()) as { _id: string; branchId: string; _rev: string };
    expect(doc._id).toBe('probe:1');
    expect(doc.branchId).toBe('hq');
    expect(doc._rev).toBe(written.rev);
  }, 45_000);

  it('rejects a non-integer or negative _changes limit instead of crashing', async () => {
    // `limit=-1` từng làm PouchDB ném RangeError NGOÀI try/catch và giết tiến trình
    // hub — một DoS chỉ bằng một dòng URL.
    for (const bad of ['-1', '1.5', 'abc', '-0.5']) {
      const res = await fetch(`${hubUrl}/openpos_probe/_changes?limit=${bad}`);
      expect(res.status, `limit=${bad}`).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('query_parse_error');
    }

    // Hub vẫn sống sau đó.
    const alive = await fetch(`${hubUrl}/openpos_probe/_changes?limit=1`);
    expect(alive.status).toBe(200);
  }, 45_000);

  it('rejects path traversal in the database name', async () => {
    // Express decode param SAU khi match path, nên `%2f` lọt vào tên db.
    const escaped = 'openpos_ESCAPED';
    const victim = join(dataDir as string, '..', escaped);

    const res = await fetch(`${hubUrl}/..%2f${escaped}`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('illegal_database_name');

    // Không được tạo thư mục ngoài HUB_DATA_DIR.
    expect(existsSync(victim)).toBe(false);

    // Tên hợp lệ vẫn phải chạy bình thường.
    const ok = await fetch(`${hubUrl}/openpos_valid_name`);
    expect(ok.status).toBe(200);
  }, 45_000);

  it('honours ?rev= on a document GET instead of silently returning the winning rev', async () => {
    await fetch(`${hubUrl}/openpos_rev`, { method: 'PUT' });

    const put1 = await putDoc('openpos_rev', 'd:1', { v: 1 });
    expect(put1.status).toBe(201);
    const rev1 = ((await put1.json()) as { rev: string }).rev;

    const put2 = await putDoc('openpos_rev', 'd:1', { v: 2 }, rev1);
    expect(put2.status).toBe(201);
    const rev2 = ((await put2.json()) as { rev: string }).rev;
    expect(rev2).not.toBe(rev1);

    const head = await fetch(`${hubUrl}/openpos_rev/d:1`);
    expect(((await head.json()) as { _rev: string })._rev).toBe(rev2);

    // Không có ?rev= thì trả về rev mới nhất; có ?rev= phải trả ĐÚNG rev đó.
    const old = await fetch(`${hubUrl}/openpos_rev/d:1?rev=${encodeURIComponent(rev1)}`);
    expect(old.status).toBe(200);
    const oldDoc = (await old.json()) as { _rev: string; v: number };
    expect(oldDoc._rev).toBe(rev1);
    expect(oldDoc.v).toBe(1);
  }, 45_000);

  it('returns 409 for a stale _local checkpoint rev instead of overwriting it', async () => {
    await fetch(`${hubUrl}/openpos_local`, { method: 'PUT' });

    const r1 = await putLocal('openpos_local', 'checkpoint', { lastSeq: 1 });
    expect(r1.status).toBe(201);
    const rev1 = ((await r1.json()) as { rev: string }).rev;

    const r2 = await putLocal('openpos_local', 'checkpoint', { lastSeq: 2 }, rev1);
    expect(r2.status).toBe(201);
    const rev2 = ((await r2.json()) as { rev: string }).rev;

    // Ghi lại bằng rev cũ → phải là 409, KHÔNG được ghi đè checkpoint mới hơn.
    const stale = await putLocal('openpos_local', 'checkpoint', { lastSeq: 99 }, rev1);
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as { error: string };
    expect(body.error).toBe('conflict');

    const current = await fetch(`${hubUrl}/openpos_local/_local/checkpoint`);
    const doc = (await current.json()) as { _rev: string; lastSeq: number };
    expect(doc._rev).toBe(rev2);
    expect(doc.lastSeq).toBe(2);
  }, 45_000);

  it('deletes a document with DELETE /:db/:id', async () => {
    await fetch(`${hubUrl}/openpos_del`, { method: 'PUT' });

    const put = await putDoc('openpos_del', 'x:1', { v: 1 });
    const rev = ((await put.json()) as { rev: string }).rev;

    const del = await fetch(`${hubUrl}/openpos_del/x:1?rev=${encodeURIComponent(rev)}`, {
      method: 'DELETE',
    });
    expect(del.status).toBe(200);

    const after = await fetch(`${hubUrl}/openpos_del/x:1`);
    expect(after.status).toBe(404);
  }, 45_000);

  it('destroys a database with DELETE /:db', async () => {
    const create = await fetch(`${hubUrl}/openpos_destroy_me`, { method: 'PUT' });
    expect(create.status).toBe(201);

    const del = await fetch(`${hubUrl}/openpos_destroy_me`, { method: 'DELETE' });
    expect(del.status).toBe(200);

    const dbDir = join(dataDir as string, 'openpos_destroy_me');
    expect(existsSync(dbDir)).toBe(false);
  }, 45_000);
});
