import { describe, it, expect, afterEach } from 'vitest';
import PouchDB from 'pouchdb';
import memory from 'pouchdb-adapter-memory';
import { createEnvelope } from '../envelope';
import { createPouchAdapter } from '../pouch-adapter';
import { describeAdapterContract } from './adapter-contract';

// Đăng ký plugin memory MỘT LẦN cho cả file. Production dùng IndexedDB (mặc định của
// PouchDB); test dùng memory để không cần trình duyệt.
PouchDB.plugin(memory);

const opened: PouchDB.Database[] = [];

function openDb(name?: string): PouchDB.Database {
  const db = new PouchDB(
    name ?? `openpos_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    { adapter: 'memory' },
  );
  opened.push(db);
  return db;
}

afterEach(async () => {
  // Destroy từng instance ĐÚNG MỘT LẦN. Hai instance cùng tên chia sẻ một store;
  // destroy instance thứ hai sau khi store đã bị xoá sẽ treo vô hạn.
  for (const db of opened.splice(0)) {
    await db.destroy();
  }
});

describeAdapterContract('pouch adapter', {
  create: async () => createPouchAdapter(openDb()),
});

describe('pouch adapter specifics', () => {
  it('assigns a real PouchDB revision on put', async () => {
    const adapter = await createPouchAdapter(openDb());
    const saved = await adapter.put(
      createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }),
    );
    expect(saved._rev).toMatch(/^1-/);
  });

  it('holds no local state — a second adapter sees the first one writes', async () => {
    const pouch = openDb();
    const writer = await createPouchAdapter(pouch);
    const reader = await createPouchAdapter(pouch);

    await writer.put(createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }));

    expect(await reader.get('product:p001')).toMatchObject({ _id: 'product:p001' });
    expect((await reader.allDocs()).map((d) => d._id)).toEqual(['product:p001']);
  });

  it('hides a hard-deleted document from get and allDocs', async () => {
    const pouch = openDb();
    const adapter = await createPouchAdapter(pouch);

    const saved = await adapter.put(
      createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }),
    );
    await adapter.remove('product:p001', saved._rev as string);

    // remove() để lại tombstone ở tầng PouchDB — adapter phải không lộ nó ra
    expect(await adapter.get('product:p001')).toBeNull();
    expect((await adapter.allDocs()).map((d) => d._id)).toEqual([]);
  });
});
