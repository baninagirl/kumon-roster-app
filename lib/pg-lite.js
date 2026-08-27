// Minimal Postgres client -- LOCAL TESTING FALLBACK ONLY.
//
// This sandbox has no npm registry access (confirmed: registry.npmjs.org
// and the usual CDN mirrors all return 403 host_not_allowed here), so the
// real `pg` package can't be installed to test the Postgres-backed rewrite
// of this app end-to-end. This file is a small hand-rolled client
// implementing just enough of the Postgres wire protocol (startup +
// "simple query" protocol only -- no SCRAM, no SSL, no prepared-statement
// Parse/Bind/Execute) to run the app's actual queries against a real local
// Postgres instance for testing.
//
// lib/db.js prefers the real `pg` package and only falls back to this file
// if `pg` isn't installed (see the require() there) -- on Vercel, where
// `npm install` runs against the real registry, `pg` will always be
// present and this file is never touched. Do not point this at a real
// production database: it has no SSL and no SCRAM-SHA-256 support, so it
// cannot even authenticate against Supabase's default connection
// requirements, let alone secure the connection.
//
// Exposes just the subset of the `pg` package's API this app actually
// uses: `new Pool(config)`, `pool.query(text, params)`, and
// `pool.connect()` returning a client with `.query()`/`.release()` for
// explicit transactions (BEGIN/COMMIT/ROLLBACK).

const net = require('node:net');

function readCString(buf, offset) {
  let end = offset;
  while (buf[end] !== 0) end += 1;
  return { value: buf.toString('utf8', offset, end), next: end + 1 };
}

// Values passed as query params come from JS (numbers, strings, null,
// booleans). Simple-query protocol has no separate parameter channel, so
// they're interpolated directly into the SQL text as literals -- same
// escaping approach as migration/sqlite-to-postgres.js's sqlLiteral().
function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${String(value).replace(/'/g, "''")}'`;
}

// Rewrites "$1, $2, ..." placeholders (Postgres's own placeholder syntax --
// this app's db.js layer converts SQLite's "?" into this before calling
// here) into literal values, longest-index-first so $10 isn't clobbered by
// a naive $1 replace.
function interpolate(text, params) {
  if (!params || !params.length) return text;
  let out = text;
  const order = params.map((_, i) => i + 1).sort((a, b) => b - a);
  for (const i of order) {
    const re = new RegExp('\\$' + i + '(?!\\d)', 'g');
    out = out.replace(re, literal(params[i - 1]));
  }
  return out;
}

class LiteClient {
  constructor(config) {
    this.config = config;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = [];
    this._connected = null;
  }

  connect() {
    if (this._connected) return this._connected;
    this._connected = new Promise((resolve, reject) => {
      const { host = 'localhost', port = 5432, user, database } = this.config;
      const socket = net.connect({ host, port }, () => {
        const params = Buffer.concat([
          Buffer.from('user\0' + user + '\0'),
          Buffer.from('database\0' + database + '\0'),
          Buffer.from('\0'),
        ]);
        const body = Buffer.concat([Buffer.from([0, 3, 0, 0]), params]); // protocol 3.0
        const len = Buffer.alloc(4);
        len.writeInt32BE(body.length + 4);
        socket.write(Buffer.concat([len, body]));
      });
      socket.on('error', reject);
      this.socket = socket;
      this._resolveConnect = resolve;
      this._rejectConnect = reject;
      socket.on('data', (chunk) => this._onData(chunk));
    });
    return this._connected;
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 5) {
      const type = String.fromCharCode(this.buffer[0]);
      const len = this.buffer.readInt32BE(1);
      if (this.buffer.length < len + 1) return; // wait for more data
      const body = this.buffer.subarray(5, len + 1);
      this.buffer = this.buffer.subarray(len + 1);
      this._handleMessage(type, body);
    }
  }

  _handleMessage(type, body) {
    if (type === 'R') { // Authentication*
      const code = body.readInt32BE(0);
      if (code !== 0) {
        this._failCurrent(new Error(
          `pg-lite: server requested auth method code ${code} (SCRAM/MD5), but this local-only test client only supports 'trust' auth. ` +
          `This is expected -- it only matters for local sandbox testing, never for the real 'pg' package used on Vercel.`
        ));
      }
      return;
    }
    if (type === 'S' || type === 'K') return; // ParameterStatus / BackendKeyData -- ignored
    if (type === 'Z') { // ReadyForQuery
      if (this._resolveConnect) { this._resolveConnect(); this._resolveConnect = null; return; }
      this._finishCurrent();
      return;
    }
    if (type === 'T') { // RowDescription
      const count = body.readInt16BE(0);
      let off = 2;
      const cols = [];
      for (let i = 0; i < count; i++) {
        const { value, next } = readCString(body, off);
        cols.push(value);
        off = next + 18; // skip tableOID(4) colAttr(2) typeOID(4) typeLen(2) typeMod(4) format(2)
      }
      this._current().columns = cols;
      return;
    }
    if (type === 'D') { // DataRow
      const cur = this._current();
      const count = body.readInt16BE(0);
      let off = 2;
      const row = {};
      for (let i = 0; i < count; i++) {
        const flen = body.readInt32BE(off);
        off += 4;
        let val = null;
        if (flen >= 0) {
          val = body.toString('utf8', off, off + flen);
          off += flen;
        }
        row[cur.columns[i]] = val;
      }
      cur.rows.push(row);
      return;
    }
    if (type === 'C') { // CommandComplete
      const cur = this._current();
      const tag = body.toString('utf8', 0, body.length - 1);
      const m = /(\d+)$/.exec(tag);
      cur.rowCount = m ? Number(m[1]) : cur.rows.length;
      return;
    }
    if (type === 'E') { // ErrorResponse
      const fields = {};
      let off = 0;
      while (body[off] !== 0) {
        const code = String.fromCharCode(body[off]);
        const { value, next } = readCString(body, off + 1);
        fields[code] = value;
        off = next;
      }
      const err = new Error(`pg-lite: ${fields.M || 'unknown Postgres error'} (${fields.C || ''})`);
      const job = this._current();
      // A guard, not just defensiveness: an ErrorResponse can arrive with no
      // tracked query (e.g. a startup/auth failure before any query was
      // sent) -- crashing the whole process on that instead of surfacing it
      // as a rejected promise took the entire local dev server down during
      // testing, so this now fails loud but safe.
      if (job) job.error = err;
      else console.error('pg-lite: received an ErrorResponse with no pending query:', err.message);
      return;
    }
    // Ignore anything else (NoticeResponse, EmptyQueryResponse, etc.)
  }

  _current() {
    return this.pending[0];
  }

  _finishCurrent() {
    const job = this.pending.shift();
    if (!job) return;
    if (job.error) job.reject(job.error);
    else job.resolve({ rows: job.rows, rowCount: job.rowCount });
  }

  _failCurrent(err) {
    const job = this.pending[0];
    if (job) job.error = err;
  }

  async query(text, params) {
    await this.connect();
    const sql = interpolate(text, params);
    return new Promise((resolve, reject) => {
      this.pending.push({ rows: [], columns: [], rowCount: 0, error: null, resolve, reject });
      const body = Buffer.from(sql + '\0', 'utf8');
      const len = Buffer.alloc(4);
      len.writeInt32BE(body.length + 4);
      this.socket.write(Buffer.concat([Buffer.from('Q'), len, body]));
    });
  }

  release() {
    if (this.socket) this.socket.end();
  }
}

// Real `pg`'s Pool caps how many connections it opens at once (default 10)
// and queues anything past that, reusing connections instead of opening a
// fresh one per query. This client doesn't reuse connections (each query
// gets its own short-lived one, simplest thing that works for a local-only
// test client) but DOES need the same concurrency cap: server.js fans out
// with Promise.all over every row it's rendering (one query per student for
// tuition math, for instance), and without a cap that can open hundreds of
// simultaneous connections against local Postgres's own connection limit --
// confirmed by hitting exactly that crash while smoke-testing the Postgres
// port end-to-end. Capping here keeps that concurrency at a realistic level
// so this client's behavior actually matches what `pg`'s Pool would do in
// production, rather than passing local tests by accident.
const DEFAULT_MAX_CONNECTIONS = 10;

class Pool {
  constructor(config) {
    this.config = config;
    this.maxConnections = (config && config.max) || DEFAULT_MAX_CONNECTIONS;
    this._active = 0;
    this._queue = [];
  }

  async _acquireSlot() {
    if (this._active < this.maxConnections) {
      this._active += 1;
      return;
    }
    await new Promise((resolve) => this._queue.push(resolve));
    this._active += 1;
  }

  _releaseSlot() {
    this._active -= 1;
    const next = this._queue.shift();
    if (next) next();
  }

  async query(text, params) {
    await this._acquireSlot();
    try {
      const client = new LiteClient(this.config);
      try {
        return await client.query(text, params);
      } finally {
        client.release();
      }
    } finally {
      this._releaseSlot();
    }
  }

  async connect() {
    const client = new LiteClient(this.config);
    await client.connect();
    return client;
  }
}

module.exports = { Pool };
