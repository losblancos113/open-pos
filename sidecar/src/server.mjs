import express from 'express';
import PouchDB from 'pouchdb';
import find from 'pouchdb-find';
import { mkdirSync } from 'node:fs';
import crypto from 'node:crypto';

PouchDB.plugin(find);

const port = Number(process.env.HUB_PORT ?? 5984);
const host = process.env.HUB_HOST ?? '127.0.0.1';
const dataDir = process.env.HUB_DATA_DIR ?? '.hub-data';
const HUB_AUTH_SECRET = process.env.HUB_AUTH_SECRET;

// Allowlist tên database: chỉ chữ, số và _ . $ -
// Không cho '/', '\', hay '..' → chặn path traversal kiểu `/..%2fESCAPED`
// (Express decode param SAU khi match path, nên %2f lọt vào tên db).
const DB_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.$-]{0,62}$/;

mkdirSync(dataDir, { recursive: true });

const app = express();
app.use(express.json({ limit: '10mb' }));

const dbs = new Map();

function badRequest(reason, error = 'bad_request') {
  const err = new Error(reason);
  err.status = 400;
  err.error = error;
  err.reason = reason;
  return err;
}

function authenticateRequest(req) {
  if (!HUB_AUTH_SECRET || process.env.HUB_AUTH_DISABLED === '1') {
    return { activeBranchId: '*', role: 'owner' };
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Missing or invalid Authorization header');
    err.status = 401;
    err.error = 'unauthorized';
    err.reason = 'Authentication required';
    throw err;
  }
  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 2) {
    const err = new Error('Invalid token format');
    err.status = 401;
    err.error = 'unauthorized';
    err.reason = 'Invalid token';
    throw err;
  }
  const [b64Payload, b64Sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', HUB_AUTH_SECRET)
    .update(b64Payload)
    .digest('base64url');

  const bExpected = Buffer.from(expectedSig);
  const bSig = Buffer.from(b64Sig);
  if (bExpected.length !== bSig.length || !crypto.timingSafeEqual(bExpected, bSig)) {
    const err = new Error('Invalid token signature');
    err.status = 401;
    err.error = 'unauthorized';
    err.reason = 'Signature verification failed';
    throw err;
  }

  try {
    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
      const err = new Error('Token expired');
      err.status = 401;
      err.error = 'unauthorized';
      err.reason = 'Token has expired';
      throw err;
    }
    return payload;
  } catch (parseErr) {
    if (parseErr.status === 401) throw parseErr;
    const err = new Error('Malformed token claims');
    err.status = 401;
    err.error = 'unauthorized';
    err.reason = 'Malformed token claims';
    throw err;
  }
}

function assertBranchWriteAccess(doc, claims) {
  if (!claims || claims.role === 'owner') return;
  const docBranchId = doc && doc.branchId;
  if (docBranchId !== '*' && docBranchId !== claims.activeBranchId) {
    const err = new Error(
      `Cannot write document for branch "${docBranchId}" with token active for "${claims.activeBranchId}"`,
    );
    err.status = 403;
    err.error = 'branch_access_denied';
    err.reason = `Unauthorized branch write for branch "${docBranchId}"`;
    throw err;
  }
}

function getDb(name) {
  if (!DB_NAME_RE.test(name)) {
    throw badRequest(
      `Name: ${name}. Only letters, digits and _ . $ - are allowed in database names.`,
      'illegal_database_name',
    );
  }
  let db = dbs.get(name);
  if (!db) {
    db = new PouchDB(`${dataDir}/${name}`);
    dbs.set(name, db);
  }
  return db;
}

// Trả đúng status của lỗi. PouchDB phân nhánh theo status: 409 → retry checkpoint,
// 401/403 → 'denied'. Gộp hết thành 500 làm replication abort giữa chừng.
function errorResponse(res, err) {
  const status =
    err && Number.isInteger(err.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;
  const fallback =
    status === 404
      ? 'not_found'
      : status === 400
        ? 'bad_request'
        : status === 409
          ? 'conflict'
          : 'internal_server_error';
  const error = (err && err.error) || fallback;
  const reason = (err && err.reason) || (err && err.message) || 'unknown error';
  res.status(status).json({ error, reason });
}

// `limit`/`since` đi thẳng từ query string vào PouchDB. Giá trị sai (âm, thập phân,
// NaN) làm PouchDB ném RangeError *ngoài* try/catch → giết tiến trình hub.
// Phải chặn ở đây, không được để lọt xuống dưới.
function parseNonNegativeInt(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw badRequest(`invalid value for parameter: ${name}=${value}`, 'query_parse_error');
  }
  return n;
}

function assertDocId(id) {
  if (typeof id !== 'string' || id.startsWith('_')) {
    throw badRequest('Only reserved document ids may start with underscore.');
  }
  return id;
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
    const body = req.body ?? {};
    if (typeof body !== 'object' || Array.isArray(body)) {
      throw badRequest('Request body must be a JSON object mapping ids to revisions.');
    }
    const result = {};
    for (const [id, revs] of Object.entries(body)) {
      if (!Array.isArray(revs)) {
        throw badRequest(`Revisions for document ${id} must be an array.`);
      }
      const missing = [];
      for (const rev of revs) {
        try {
          // Lưu ý: rev đã bị xoá (tombstone) KHÔNG ném 404 — PouchDB trả về chính
          // tombstone đó. Vì vậy "có mặt" ở đây là đúng cho cả rev đã xoá.
          await db.get(id, { rev });
        } catch (err) {
          if (err && err.status === 404) {
            missing.push(rev);
          } else {
            // TUYỆT ĐỐI không coi lỗi không rõ là "đã có": _revs_diff dùng để báo
            // rev nào hub còn thiếu. Bỏ sót một rev = client không bao giờ gửi
            // document đó = mất dữ liệu vĩnh viễn khi sync.
            throw err;
          }
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
    const claims = authenticateRequest(req);
    const db = getDb(req.params.db);

    let since = 0;
    if (req.query.since !== undefined && req.query.since !== '') {
      if (req.query.since === 'now') {
        const info = await db.info();
        since = info.update_seq;
      } else {
        since = parseNonNegativeInt(req.query.since, 0, 'since');
      }
    }

    const limit = parseNonNegativeInt(req.query.limit, 1000, 'limit');
    const style = req.query.style === 'all_docs' ? 'all_docs' : 'main_only';
    const clientIncludeDocs = req.query.include_docs !== 'false';
    const mustFilter = claims.role !== 'owner' && claims.activeBranchId !== '*';

    const changes = await db.changes({
      since,
      include_docs: mustFilter || clientIncludeDocs,
      limit,
      style,
    });

    let results = changes.results;
    if (mustFilter) {
      results = results.filter((row) => {
        if (row.deleted && !row.doc) return true;
        const branchId = row.doc && row.doc.branchId;
        return branchId === '*' || branchId === claims.activeBranchId;
      });
    }

    res.json({
      results: results.map((row) => ({
        seq: row.seq,
        id: row.id,
        changes: row.changes,
        ...(clientIncludeDocs && row.doc !== undefined ? { doc: row.doc } : {}),
        ...(row.deleted ? { deleted: true } : {}),
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

    let existing;
    try {
      existing = await db.get(id);
    } catch (err) {
      if (!(err && err.status === 404)) throw err;
      existing = undefined;
    }

    // PouchDB gửi rev của checkpoint ở body._rev hoặc query ?rev= tuỳ phiên bản.
    const clientRev = (req.body && req.body._rev) || req.query.rev;

    if (existing && clientRev !== existing._rev) {
      const conflict = new Error('Document update conflict.');
      conflict.status = 409;
      conflict.error = 'conflict';
      conflict.reason = 'Document update conflict.';
      throw conflict;
    }

    const doc = { ...(req.body ?? {}), _id: id };
    if (existing) {
      doc._rev = existing._rev;
    } else {
      delete doc._rev;
    }

    const result = await db.put(doc);
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
    const claims = authenticateRequest(req);
    const db = getDb(req.params.db);
    const body = req.body ?? {};
    if (!Array.isArray(body.docs)) {
      throw badRequest("Missing JSON list of 'docs'");
    }
    for (const doc of body.docs) {
      assertBranchWriteAccess(doc, claims);
    }
    const result = await db.bulkDocs(body.docs, { new_edits: body.new_edits !== false });
    res.status(201).json(result);
  } catch (err) {
    errorResponse(res, err);
  }
});

// PouchDB replication đọc document từ hub qua `_bulk_get`.
app.post('/:db/_bulk_get', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const docs = Array.isArray(req.body?.docs) ? req.body.docs : [];
    const results = await Promise.all(
      docs.map(async (entry) => {
        const id = entry.id;
        const rev = entry.rev;
        try {
          const doc = await db.get(id, rev ? { rev, revs: true } : { revs: true });
          return { id, docs: [{ ok: doc }] };
        } catch (err) {
          const is404 = err && err.status === 404;
          return {
            id,
            docs: [
              {
                error: {
                  id,
                  rev,
                  error: is404 ? 'not_found' : (err && err.error) || 'internal_server_error',
                  reason: is404
                    ? 'missing'
                    : (err && err.reason) || (err && err.message) || 'unknown error',
                },
              },
            ],
          };
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

// `_all_docs` là 2 segment, trùng dạng với `/:db/:id` → phải đăng ký trước.
app.get('/:db/_all_docs', async (req, res) => {
  try {
    const claims = authenticateRequest(req);
    const db = getDb(req.params.db);
    const mustFilter = claims.role !== 'owner' && claims.activeBranchId !== '*';
    const opts = {};
    if (req.query.include_docs === 'true' || mustFilter) opts.include_docs = true;
    if (req.query.descending === 'true') opts.descending = true;
    if (req.query.limit !== undefined) opts.limit = parseNonNegativeInt(req.query.limit, 0, 'limit');
    if (req.query.skip !== undefined) opts.skip = parseNonNegativeInt(req.query.skip, 0, 'skip');
    if (typeof req.query.startkey === 'string') opts.startkey = req.query.startkey;
    if (typeof req.query.endkey === 'string') opts.endkey = req.query.endkey;
    const result = await db.allDocs(opts);
    if (mustFilter) {
      result.rows = result.rows.filter((row) => {
        const branchId = row.doc && row.doc.branchId;
        return branchId === '*' || branchId === claims.activeBranchId;
      });
      result.total_rows = result.rows.length;
      if (req.query.include_docs !== 'true') {
        for (const row of result.rows) {
          delete row.doc;
        }
      }
    }
    res.json(result);
  } catch (err) {
    errorResponse(res, err);
  }
});

app.post('/:db/_all_docs', async (req, res) => {
  try {
    const claims = authenticateRequest(req);
    const db = getDb(req.params.db);
    const body = req.body ?? {};
    const mustFilter = claims.role !== 'owner' && claims.activeBranchId !== '*';
    const opts = {};
    if (Array.isArray(body.keys)) opts.keys = body.keys;
    if (body.include_docs === true || mustFilter) opts.include_docs = true;
    const result = await db.allDocs(opts);
    if (mustFilter) {
      result.rows = result.rows.filter((row) => {
        const branchId = row.doc && row.doc.branchId;
        return branchId === '*' || branchId === claims.activeBranchId;
      });
      result.total_rows = result.rows.length;
      if (body.include_docs !== true) {
        for (const row of result.rows) {
          delete row.doc;
        }
      }
    }
    res.json(result);
  } catch (err) {
    errorResponse(res, err);
  }
});

// CouchDB create-database. Trả 201 (idempotent) thay vì 412 khi đã tồn tại:
// PouchDB http adapter coi 412 là lỗi, còn app thì chỉ cần db sẵn sàng.
app.put('/:db', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    await db.info();
    res.status(201).json({ ok: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

// CouchDB delete-database. Không có route này thì `db.destroy()` phía client
// báo thành công mà dữ liệu vẫn nằm nguyên trên đĩa.
app.delete('/:db', async (req, res) => {
  try {
    const name = req.params.db;
    const db = getDb(name);
    await db.destroy();
    dbs.delete(name);
    res.status(200).json({ ok: true });
  } catch (err) {
    errorResponse(res, err);
  }
});

app.put('/:db/:id', async (req, res) => {
  try {
    const claims = authenticateRequest(req);
    const db = getDb(req.params.db);
    const id = assertDocId(req.params.id);

    const doc = { ...(req.body ?? {}), _id: id };
    assertBranchWriteAccess(doc, claims);

    if (typeof req.query.rev === 'string' && req.query.rev !== '') doc._rev = req.query.rev;

    if (req.query.new_edits === 'false') {
      const [row] = await db.bulkDocs([doc], { new_edits: false });
      if (row && row.error) {
        const err = new Error(row.reason || row.error);
        err.status = row.status || 409;
        err.error = row.error;
        err.reason = row.reason;
        throw err;
      }
      res.status(201).json({ ok: true, id, rev: (row && row.rev) || doc._rev });
      return;
    }

    const result = await db.put(doc);
    res.status(201).json({ ok: true, id: result.id, rev: result.rev });
  } catch (err) {
    errorResponse(res, err);
  }
});

app.delete('/:db/:id', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const id = assertDocId(req.params.id);
    const rev = typeof req.query.rev === 'string' ? req.query.rev : '';
    if (!rev) {
      throw badRequest('You must supply the revision to delete a document.');
    }
    const result = await db.put({ _id: id, _rev: rev, _deleted: true });
    res.status(200).json({ ok: true, id: result.id, rev: result.rev });
  } catch (err) {
    errorResponse(res, err);
  }
});

// Phải đăng ký CUỐI CÙNG: route này khớp mọi path hai segment.
app.get('/:db/:id', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const opts = {};
    if (typeof req.query.rev === 'string') opts.rev = req.query.rev;
    if (req.query.revs === 'true') opts.revs = true;
    if (req.query.revs_info === 'true') opts.revs_info = true;
    if (req.query.conflicts === 'true') opts.conflicts = true;
    if (req.query.attachments === 'true') opts.attachments = true;
    if (req.query.open_revs !== undefined) opts.open_revs = req.query.open_revs;
    const doc = await db.get(req.params.id, opts);
    res.json(doc);
  } catch (err) {
    errorResponse(res, err);
  }
});

// JSON hỏng từ client → trả đúng dạng lỗi CouchDB thay vì HTML của Express.
app.use((err, _req, res, _next) => {
  errorResponse(res, err);
});

let server;

// `app.listen` không có 'error' handler: nếu cổng đang bận (chạy 2 instance, hoặc
// máy đã có CouchDB/PouchDB-server ở 5984) thì Node ném 'error' không ai bắt và
// tiến trình chết trước khi kịp in OPEN_POS_HUB_URL → bên gọi treo vô thời hạn.
function startHub(listenPort, allowFallback) {
  const s = app.listen(listenPort, host);

  s.on('listening', () => {
    server = s;
    const actual = s.address();
    const boundPort = typeof actual === 'object' && actual !== null ? actual.port : listenPort;
    const advertisedHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
    console.log(`OPEN_POS_HUB_URL=http://${advertisedHost}:${boundPort}`);
  });

  s.on('error', (err) => {
    const code = (err && err.code) || 'unknown';
    if (allowFallback && code === 'EADDRINUSE') {
      console.error(`OPEN_POS_HUB_PORT_IN_USE=${listenPort}; falling back to an ephemeral port`);
      s.removeAllListeners('error');
      startHub(0, false);
      return;
    }
    console.error(`OPEN_POS_HUB_ERROR=${code}: ${(err && err.message) || err}`);
    process.exit(1);
  });
}

startHub(port, true);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  // Đóng PouchDB trước khi thoát để nhả LOCK file của LevelDB (Windows giữ handle
  // khá lâu, làm thư mục tạm không xoá được).
  for (const db of dbs.values()) {
    try {
      await db.close();
    } catch {
      // best effort
    }
  }
  dbs.clear();
  if (server) {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000);
  } else {
    process.exit(0);
  }
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason) => {
  console.error('OPEN_POS_HUB_UNHANDLED_REJECTION', reason);
});
