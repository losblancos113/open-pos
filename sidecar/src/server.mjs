import express from 'express';
import PouchDB from 'pouchdb';
import find from 'pouchdb-find';
import { mkdirSync } from 'node:fs';

PouchDB.plugin(find);

const port = Number(process.env.HUB_PORT ?? 5984);
const dataDir = process.env.HUB_DATA_DIR ?? '.hub-data';

mkdirSync(dataDir, { recursive: true });

const app = express();
app.use(express.json({ limit: '10mb' }));

const dbs = new Map();
function getDb(name) {
  let db = dbs.get(name);
  if (!db) {
    db = new PouchDB(`${dataDir}/${name}`);
    dbs.set(name, db);
  }
  return db;
}

function errorResponse(res, err) {
  if (err && err.status === 404) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(500).json({ error: String(err && err.message ? err.message : err) });
}

app.get('/', (_req, res) => {
  res.json({ couchdb: 'Welcome', version: '0.1.0-openpos-hub', express: 'ok' });
});

app.get('/_all_dbs', (_req, res) => {
  res.json([...dbs.keys()]);
});

// --- Replication endpoints mà PouchDB client yêu cầu ---
// Đăng ký TRƯỚC `/:db/:id`, nếu không Express sẽ khớp `_changes` / `_all_docs`
// vào route `/:db/:id` và luôn trả 404.

app.post('/:db/_revs_diff', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const result = {};
    for (const [id, revs] of Object.entries(req.body ?? {})) {
      const missing = [];
      for (const rev of revs) {
        try {
          await db.get(id, { rev });
        } catch (err) {
          if (err && err.status === 404) missing.push(rev);
        }
      }
      if (missing.length > 0) result[id] = { missing };
    }
    res.json(result);
  } catch (err) {
    errorResponse(res, err);
  }
});

app.get('/:db/_changes', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const since = Number(req.query.since ?? 0);
    const changes = await db.changes({ since, include_docs: true, limit: 1000 });
    res.json({
      results: changes.results.map((row) => ({
        seq: row.seq,
        id: row.id,
        changes: row.changes,
        doc: row.doc,
      })),
      last_seq: changes.last_seq,
    });
  } catch (err) {
    errorResponse(res, err);
  }
});

app.get('/:db/_local/:id', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const doc = await db.get(`_local/${req.params.id}`);
    res.json(doc);
  } catch (err) {
    errorResponse(res, err);
  }
});

app.put('/:db/_local/:id', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const id = `_local/${req.params.id}`;
    let existing = {};
    try {
      existing = await db.get(id);
    } catch (err) {
      if (!(err && err.status === 404)) throw err;
    }
    const result = await db.put({ ...req.body, _id: id, _rev: existing._rev });
    res.status(201).json({ ok: true, id: result.id, rev: result.rev });
  } catch (err) {
    errorResponse(res, err);
  }
});

// CouchDB-compatible bulk endpoint — PouchDB replication dùng endpoint này.
// `new_edits: false` phải được tôn trọng, nếu không hub sẽ sinh rev mới và
// replication sẽ lệch rev với client.
app.post('/:db/_bulk_docs', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const result = await db.bulkDocs(req.body?.docs ?? [], {
      new_edits: req.body?.new_edits !== false,
    });
    res.status(201).json(result);
  } catch (err) {
    errorResponse(res, err);
  }
});

// PouchDB replication đọc document từ hub qua `_bulk_get`.
app.post('/:db/_bulk_get', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const docs = req.body?.docs ?? [];
    const results = await Promise.all(
      docs.map(async (entry) => {
        const id = entry.id;
        const rev = entry.rev;
        try {
          const doc = await db.get(id, rev ? { rev, revs: true } : { revs: true });
          return { id, docs: [{ ok: doc }] };
        } catch (err) {
          return { id, docs: [{ error: { id, rev, error: 'not_found', reason: 'missing' } }] };
        }
      }),
    );
    res.json({ results });
  } catch (err) {
    errorResponse(res, err);
  }
});

// Database info — PouchDB replication gọi endpoint này trước khi bắt đầu.
// getDb() tạo db lazily nên lần replicate đầu tiên vào hub vẫn hoạt động.
app.get('/:db', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const info = await db.info();
    res.json({ ...info, db_name: req.params.db });
  } catch (err) {
    errorResponse(res, err);
  }
});

// PouchDB dùng `_all_docs` cho một số truy vấn replication.
app.get('/:db/_all_docs', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const result = await db.allDocs({ include_docs: req.query.include_docs === 'true' });
    res.json(result);
  } catch (err) {
    errorResponse(res, err);
  }
});

app.put('/:db', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const doc = req.body;
    const result = await db.put(doc);
    res.status(201).json({ ok: true, id: result.id, rev: result.rev });
  } catch (err) {
    errorResponse(res, err);
  }
});

// Phải đăng ký CUỐI CÙNG: route này khớp mọi path hai segment.
app.get('/:db/:id', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const doc = await db.get(req.params.id);
    res.json(doc);
  } catch (err) {
    errorResponse(res, err);
  }
});

const server = app.listen(port, '127.0.0.1', () => {
  const actual = server.address();
  const boundPort = typeof actual === 'object' && actual !== null ? actual.port : port;
  console.log(`OPEN_POS_HUB_URL=http://127.0.0.1:${boundPort}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
