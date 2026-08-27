// Database layer -- Postgres-backed (Vercel + Supabase deployment).
//
// This replaces the original node:sqlite version. The schema and all data
// were migrated over first (see migration/README.md) -- this file is just
// the app's connection + small set of app_state helpers server.js actually
// imports directly. Everything else that used to live in this file (the
// one-time data repairs, the SQLite-only constraint migration, the
// fresh-database seed) was intentionally NOT ported: those repairs already
// ran against the SQLite database before it was migrated, so the data
// Postgres now holds is already in its final, correct shape, and porting
// dead one-time code would just be extra surface area with nothing to do.
// See the "Postgres migration" section of README.md for the full reasoning.
//
// Every function here is async now (a real network round trip replaces
// what used to be a synchronous local file read), which is the one thing
// that ripples out into server.js: every call site awaits these now.
//
// Uses the real `pg` package when it's installed (always true on Vercel,
// where `npm install` has full registry access) and falls back to
// lib/pg-lite.js -- a small hand-rolled client -- only when `pg` isn't
// available, which so far has only been true in this dev sandbox (no npm
// registry access here). pg-lite is explicitly NOT safe for production
// (no SSL, no SCRAM auth) -- see its header comment.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ashr = require('./ashr');

let PoolCtor;
try {
  ({ Pool: PoolCtor } = require('pg'));
} catch {
  ({ Pool: PoolCtor } = require('./pg-lite'));
}

const SCHEMA_PATH = path.join(__dirname, '..', 'migration', 'postgres-schema.sql');

// Level groups -- fixed metadata Nina supplied directly (not derived from the
// spreadsheet extraction). Each classroom instructor belongs to exactly one
// group; general staff / trainee-only edge cases not listed here stay
// ungrouped (team_group = NULL). Aug 19: added for the group calendar views.
const TEACHER_GROUPS = {
  SUGAR: '7A-3A61', MIRA: '7A-3A61', KC: '7A-3A61', GB: '7A-3A61', QUEENIE: '7A-3A61',
  JESS: '3A71-A',
  JOFEL: 'BCD', LYCKA: 'BCD', 'JEA AND HAMID': 'BCD',
  FRANCIS: 'EFG',
  ERICKSON: 'H-O', MARK: 'H-O',
};
const GROUP_ORDER = ['7A-3A61', '3A71-A', 'BCD', 'EFG', 'H-O'];

// Same normalization used when the ashr_award.teacher_id backfill (below)
// matches a free-text teacher_label against a real teacher record.
function normalizeTeacherLabel(label) {
  return String(label).trim().toUpperCase().replace(/^(MS|SIR|MR|MRS)\.?\s+/, '');
}

const INITIAL_ACTIVE_MONTH = '2026-08';
// Same pattern as active_month, but for which ASHR cycle is currently "in
// progress" (its qualifying levels shown as a live preview, not yet locked
// in). Seeded once to the cycle right after the last backfilled history.
const INITIAL_ASHR_CYCLE = '2026-08';

// Gate on editing an already-closed historical record -- deliberately simple
// (one shared password, checked per-request, not a real account system).
const DEFAULT_ADMIN_PASSWORD = 'kumon2026';

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function buildPoolConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    // Real Postgres (Supabase) in production. Supabase's connection
    // requires TLS; passing this explicitly avoids Node's default strict
    // chain verification tripping on Supabase's cert setup in some
    // environments (the connection is still encrypted either way).
    return { connectionString, ssl: { rejectUnauthorized: false } };
  }
  // No DATABASE_URL set -- local sandbox testing against the local
  // Postgres instance set up for development (see migration/README.md).
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER || 'kumon',
    database: process.env.PGDATABASE || 'kumon_roster',
  };
}

let _pool = null;
let _ready = null;

// Lazily creates the connection pool and, the first time it's used, makes
// sure the schema exists and a handful of cheap self-heals have run --
// same self-healing spirit as the old SQLite getDb(), just with the actual
// repair work stripped out since migrated data is already correct.
async function getDb() {
  if (!_pool) {
    _pool = new PoolCtor(buildPoolConfig());
  }
  if (!_ready) {
    _ready = initialize(_pool);
  }
  await _ready;
  return _pool;
}

async function initialize(pool) {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await pool.query(schemaSql);

  await pool.query(
    `INSERT INTO app_state (key, value) VALUES ('active_month', $1) ON CONFLICT (key) DO NOTHING`,
    [INITIAL_ACTIVE_MONTH]
  );
  await pool.query(
    `INSERT INTO app_state (key, value) VALUES ('ashr_active_cycle', $1) ON CONFLICT (key) DO NOTHING`,
    [INITIAL_ASHR_CYCLE]
  );
  const hasPassword = await pool.query(`SELECT 1 FROM app_state WHERE key = 'admin_password_hash'`);
  if (hasPassword.rows.length === 0) {
    await pool.query(
      `INSERT INTO app_state (key, value) VALUES ('admin_password_hash', $1) ON CONFLICT (key) DO NOTHING`,
      [hashPassword(DEFAULT_ADMIN_PASSWORD)]
    );
    console.log(
      `First run: the admin password for editing closed months is set to "${DEFAULT_ADMIN_PASSWORD}". ` +
      `Change it from the app (the "Manage" link above the roster) as soon as you can.`
    );
  }

  // Re-apply the fixed teacher -> group mapping every startup (cheap,
  // idempotent, self-correcting if a teacher row's team_group is ever
  // cleared for any reason).
  for (const [nickname, group] of Object.entries(TEACHER_GROUPS)) {
    await pool.query(`UPDATE teacher SET team_group = $1 WHERE nickname = $2`, [group, nickname]);
  }

  // Best-effort backfill of ashr_award.teacher_id from the existing
  // teacher_label text, for any row that doesn't have it yet. Matches
  // case-insensitively against nickname or legal_name after
  // normalizeTeacherLabel() strips a leading honorific; leaves teacher_id
  // null (rather than guessing) if nothing matches, same "flag rather than
  // guess" precedent as elsewhere in the app.
  const teacherRows = (await pool.query(`SELECT id, nickname, legal_name FROM teacher`)).rows;
  const teacherByLabel = {};
  for (const t of teacherRows) {
    if (t.nickname) teacherByLabel[t.nickname.trim().toUpperCase()] = t.id;
    if (t.legal_name) {
      const key = t.legal_name.trim().toUpperCase();
      teacherByLabel[key] = teacherByLabel[key] || t.id;
    }
  }
  const unresolvedAshrRows = (await pool.query(
    `SELECT id, teacher_label FROM ashr_award WHERE teacher_id IS NULL AND teacher_label IS NOT NULL`
  )).rows;
  for (const row of unresolvedAshrRows) {
    const match = teacherByLabel[normalizeTeacherLabel(row.teacher_label)];
    if (match) await pool.query(`UPDATE ashr_award SET teacher_id = $1 WHERE id = $2`, [match, row.id]);
  }

  // Recompute needs_level_review from current_level_raw every startup:
  // flags any row whose raw value looks like a bare ISO date/timestamp
  // with no real current_level, clears it otherwise.
  const DATE_LIKE_RAW = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2})?$/;
  const levelRawRows = (await pool.query(
    `SELECT id, current_level, current_level_raw, needs_level_review FROM subject_enrollment`
  )).rows;
  for (const row of levelRawRows) {
    const looksLikeDate = !row.current_level && row.current_level_raw && DATE_LIKE_RAW.test(row.current_level_raw.trim());
    const shouldFlag = looksLikeDate ? 1 : 0;
    if (shouldFlag !== Number(row.needs_level_review)) {
      await pool.query(`UPDATE subject_enrollment SET needs_level_review = $1 WHERE id = $2`, [shouldFlag, row.id]);
    }
  }

  // Capture each student's original grade value into grade_raw the first
  // time this runs on a given row (never overwritten afterwards), then
  // (re)normalize `grade` from it every startup.
  await pool.query(`UPDATE student SET grade_raw = grade WHERE grade_raw IS NULL AND grade IS NOT NULL`);
  const gradeRows = (await pool.query(`SELECT id, grade, grade_raw FROM student`)).rows;
  for (const row of gradeRows) {
    const source = row.grade_raw !== null ? row.grade_raw : row.grade;
    const normalized = ashr.normalizeGrade(source);
    if (normalized !== row.grade) {
      await pool.query(`UPDATE student SET grade = $1 WHERE id = $2`, [normalized, row.id]);
    }
  }
}

async function getActiveMonth(db) {
  const result = await db.query(`SELECT value FROM app_state WHERE key = 'active_month'`);
  return result.rows.length ? result.rows[0].value : INITIAL_ACTIVE_MONTH;
}

async function setActiveMonth(db, month) {
  await db.query(
    `INSERT INTO app_state (key, value) VALUES ('active_month', $1)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [month]
  );
}

async function getAshrActiveCycle(db) {
  const result = await db.query(`SELECT value FROM app_state WHERE key = 'ashr_active_cycle'`);
  return result.rows.length ? result.rows[0].value : INITIAL_ASHR_CYCLE;
}

async function setAshrActiveCycle(db, cycle) {
  await db.query(
    `INSERT INTO app_state (key, value) VALUES ('ashr_active_cycle', $1)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [cycle]
  );
}

async function setAdminPassword(db, password) {
  await db.query(
    `INSERT INTO app_state (key, value) VALUES ('admin_password_hash', $1)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [hashPassword(password)]
  );
}

async function checkAdminPassword(db, password) {
  const result = await db.query(`SELECT value FROM app_state WHERE key = 'admin_password_hash'`);
  if (!result.rows.length) return false;
  return hashPassword(password || '') === result.rows[0].value;
}

// Simple one-level "undo last edit" (Aug 19) -- see server.js for what
// counts as "covered" (student/enrollment edits, historical corrections)
// and what deliberately isn't.
async function getLastUndo(db) {
  const result = await db.query(`SELECT value FROM app_state WHERE key = 'last_undo'`);
  if (!result.rows.length) return null;
  try {
    return JSON.parse(result.rows[0].value);
  } catch {
    return null; // corrupt/unexpected value -- treat as "nothing to undo" rather than throw
  }
}

async function setLastUndo(db, undoInfo) {
  await db.query(
    `INSERT INTO app_state (key, value) VALUES ('last_undo', $1)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(undoInfo)]
  );
}

async function clearLastUndo(db) {
  await db.query(`DELETE FROM app_state WHERE key = 'last_undo'`);
}

module.exports = {
  getDb, TEACHER_GROUPS, GROUP_ORDER,
  getActiveMonth, setActiveMonth,
  getAshrActiveCycle, setAshrActiveCycle,
  setAdminPassword, checkAdminPassword,
  getLastUndo, setLastUndo, clearLastUndo,
};
