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

app.get('/', (_req, res) => {
  res.json({ couchdb: 'Welcome', version: '0.1.0-openpos-hub', express: 'ok' });
});

app.get('/_all_dbs', (_req, res) => {
  res.json([...dbs.keys()]);
});

app.put('/:db', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const doc = req.body;
    const result = await db.put(doc);
    res.status(201).json({ ok: true, id: result.id, rev: result.rev });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

app.get('/:db/:id', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const doc = await db.get(req.params.id);
    res.json(doc);
  } catch (err) {
    if (err && err.status === 404) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

// CouchDB-compatible bulk endpoint — PouchDB replication dùng endpoint này.
app.post('/:db/_bulk_docs', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const result = await db.bulkDocs(req.body.docs ?? []);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
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
