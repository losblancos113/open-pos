import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

/**
 * Hợp đồng giao thức PouchDB/CouchDB của hub.
 *
 * Bốn nhóm dưới đây là bốn rủi ro cụ thể đã gặp khi viết `server.mjs`:
 *  1. Route reserved path bị `/:db/:id` che  → `_all_docs` trả 404 thay vì danh sách.
 *  2. `GET /:db` thiếu → PouchDB không parse được và replication chết ngay.
 *  3. `_changes` bỏ qua `limit`/`style` → trả thừa dữ liệu và sót nhánh conflict.
 *  4. `_local/*` là checkpoint của replication, phải round-trip được.
 */

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, '..', 'sidecar', 'src', 'server.mjs');

let hub: ChildProcess | undefined;
let dataDir: string | undefined;
let hubUrl = '';

const db = 'endpoint_probe';

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

function jsonPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${hubUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'open-pos-endpoints-'));
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
      // Best-effort temp cleanup.
    }
  }
});

describe('hub PouchDB protocol contract', () => {
  it('GET /:db returns CouchDB-shaped db info', async () => {
    const res = await fetch(`${hubUrl}/${db}`);
    expect(res.status).toBe(200);

    const info = (await res.json()) as {
      db_name: string;
      doc_count: number;
      update_seq: number | string;
    };
    expect(info.db_name).toBe(db);
    expect(typeof info.doc_count).toBe('number');
    expect(info.update_seq).toBeDefined();
  });

  it('round-trips a _local checkpoint document', async () => {
    const put = await fetch(`${hubUrl}/${db}/_local/replication-checkpoint`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lastSeq: 7, session: 'abc' }),
    });
    expect(put.status).toBe(201);

    const get = await fetch(`${hubUrl}/${db}/_local/replication-checkpoint`);
    expect(get.status).toBe(200);

    const doc = (await get.json()) as { _id: string; lastSeq: number; session: string };
    expect(doc._id).toBe('_local/replication-checkpoint');
    expect(doc.lastSeq).toBe(7);
    expect(doc.session).toBe('abc');
  });

  it('writes documents through _bulk_docs', async () => {
    const res = await jsonPost(`/${db}/_bulk_docs`, {
      docs: [
        { _id: 'chg:1', docType: 'probe', branchId: 'hq' },
        { _id: 'chg:2', docType: 'probe', branchId: 'hq' },
        { _id: 'chg:3', docType: 'probe', branchId: 'hq' },
      ],
    });
    expect(res.status).toBe(201);

    const rows = (await res.json()) as Array<{ ok?: boolean; error?: string }>;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.error).toBeUndefined();
      expect(row.ok).toBe(true);
    }
  });

  it('_changes honours limit and returns results + last_seq', async () => {
    const res = await fetch(`${hubUrl}/${db}/_changes?since=0&limit=2`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      results: Array<{ seq: unknown; id: string; changes: unknown[]; doc?: unknown }>;
      last_seq: unknown;
    };
    expect(body.results).toHaveLength(2);
    expect(body.last_seq).toBeDefined();
    expect(body.results[0]?.changes).toBeDefined();
    expect(body.results[0]?.id).toBeDefined();
  });

  it('_changes accepts style=all_docs', async () => {
    const res = await fetch(`${hubUrl}/${db}/_changes?since=0&style=all_docs`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { results: unknown[]; last_seq: unknown };
    expect(body.results.length).toBeGreaterThanOrEqual(3);
    expect(body.last_seq).toBeDefined();
  });

  it('does not shadow reserved paths with /:db/:id', async () => {
    // `_all_docs` là hai segment, đúng bằng `/:db/:id`. Nếu đăng ký sai thứ tự,
    // route sẽ khớp vào `/:db/:id` và trả 404 vì không có document tên `_all_docs`.
    const res = await fetch(`${hubUrl}/${db}/_all_docs?include_docs=true`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { rows: Array<{ id: string; doc?: unknown }> };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.map((r) => r.id)).toContain('chg:1');

    // `_local` không được xuất hiện trong `_all_docs`.
    expect(body.rows.map((r) => r.id).some((id) => id.startsWith('_local/'))).toBe(false);
  });

  it('_revs_diff reports revisions the hub does not have', async () => {
    const res = await jsonPost(`/${db}/_revs_diff`, {
      'chg:1': ['1-not-a-real-rev', '2-also-not-real'],
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, { missing?: string[] }>;
    expect(body['chg:1']?.missing).toEqual(['1-not-a-real-rev', '2-also-not-real']);
  });

  it('_revs_diff stays silent for revisions the hub already has', async () => {
    const get = await fetch(`${hubUrl}/${db}/chg:1`);
    const doc = (await get.json()) as { _rev: string };

    const res = await jsonPost(`/${db}/_revs_diff`, { 'chg:1': [doc._rev] });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, { missing?: string[] }>;
    expect(body['chg:1']).toBeUndefined();
  });

  it('_bulk_docs honours new_edits=false so replicated revs survive intact', async () => {
    const rev = '1-00000000000000000000000000000001';
    const res = await jsonPost(`/${db}/_bulk_docs`, {
      docs: [{ _id: 'ne:1', _rev: rev, docType: 'probe', branchId: 'hq' }],
      new_edits: false,
    });
    expect(res.status).toBe(201);

    const get = await fetch(`${hubUrl}/${db}/ne:1`);
    expect(get.status).toBe(200);

    const doc = (await get.json()) as { _id: string; _rev: string };
    expect(doc._rev).toBe(rev);
  });
});
