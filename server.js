const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  getDb, GROUP_ORDER, getActiveMonth, setActiveMonth,
  getAshrActiveCycle, setAshrActiveCycle,
  setAdminPassword, checkAdminPassword,
  getLastUndo, setLastUndo, clearLastUndo,
} = require('./lib/db');
const { wrapDb } = require('./lib/pg-compat');
const { DAY_ORDER } = require('./lib/schedule');
const ashr = require('./lib/ashr');
const payments = require('./lib/payments');
const tuition = require('./lib/tuition');
const risk = require('./lib/risk');
const ocr = require('./lib/ocr');
const receiptStorage = require('./lib/receipt-storage');

const PORT = process.env.PORT || 3300;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Receipt uploads (Aug 27 follow-up) -- stored outside public/ (same reason
// data/roster.db lives outside it), served back out only through the
// GET /api/payments/receipts/:id/image route below, never as a static file.
// Aug 27 (Postgres migration follow-up, task #45): the actual read/write of
// the image bytes now goes through lib/receipt-storage.js, which is local
// disk here and Vercel Blob in production -- see that file's header for why.
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024; // 8MB decoded -- comfortably above any phone screenshot, well under OCR.space's request limits

// Free-tier OCR (Nina: "i dont want to pay anything") -- see lib/ocr.js's
// header comment for the full reasoning. No key ships with the app; it's
// read from an environment variable so Nina can add her own free OCR.space
// key (https://ocr.space/ocrapi) without anyone editing code. Until one is
// set, every upload still works -- it just skips straight to "OCR not
// configured" and leaves reference/amount/date blank for manual entry,
// same as any other low-confidence OCR result (see callOcrSpace below).
const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY || '';
const OCR_SPACE_ENDPOINT = 'https://api.ocr.space/parse/image';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function rowsToObjects(stmt, ...args) {
  return stmt.all(...args);
}

// ---- API handlers -----------------------------------------------------

async function listTeachers(db) {
  return db.prepare(`SELECT * FROM teacher ORDER BY active DESC, legal_name`).all();
}

async function listLevels(db, subject) {
  // Math and Reading share the pre-A tier and J/K/L (subject IS NULL on
  // those rows) but diverge for every letter grade A-I -- see the Aug 20
  // curriculum_level split in lib/db.js. No subject filter returns
  // everything (used by the historical-record edit panel before Aug 20's
  // subject-aware rework lands there too, and as a safe fallback).
  if (subject === 'Math' || subject === 'Reading') {
    const rows = await db.prepare(
      `SELECT code FROM curriculum_level WHERE subject IS NULL OR subject = ? ORDER BY sort_order`
    ).all(subject);
    return rows.map(r => r.code);
  }
  const rows = await db.prepare(`SELECT code FROM curriculum_level ORDER BY sort_order`).all();
  return rows.map(r => r.code);
}

async function listEnrollments(db, query) {
  const clauses = [];
  const params = [];
  if (query.q) {
    clauses.push(`(s.last_name ILIKE ? OR s.first_name ILIKE ? OR (s.first_name || ' ' || s.last_name) ILIKE ?)`);
    const like = `%${query.q}%`;
    params.push(like, like, like);
  }
  if (query.subject) {
    clauses.push(`e.subject = ?`);
    params.push(query.subject);
  }
  if (query.teacherId) {
    clauses.push(`e.teacher_id = ?`);
    params.push(Number(query.teacherId));
  }
  if (query.studentId) {
    clauses.push(`e.student_id = ?`);
    params.push(Number(query.studentId));
  }
  if (query.group) {
    clauses.push(`t.team_group = ?`);
    params.push(query.group);
  }
  if (query.status) {
    clauses.push(`e.status = ?`);
    params.push(query.status);
  }
  if (query.needsReview === '1') {
    clauses.push(`e.needs_teacher_review = 1`);
  }
  if (query.needsScheduleReview === '1') {
    clauses.push(`e.needs_schedule_review = 1`);
  }
  if (query.needsLevelReview === '1') {
    clauses.push(`e.needs_level_review = 1`);
  }
  if (query.day || query.time) {
    const sub = ['ss.enrollment_id = e.id'];
    if (query.day) { sub.push('ss.day_of_week = ?'); params.push(query.day); }
    if (query.time) { sub.push('ss.time24 = ?'); params.push(query.time); }
    clauses.push(`EXISTS (SELECT 1 FROM schedule_slot ss WHERE ${sub.join(' AND ')})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  // Payment status is joined for the *active* month, regardless of whether
  // this call is for the live roster -- it's the same "what's this
  // student's payment status right now" badge either way.
  const activeMonth = await getActiveMonth(db);
  const sql = `
    SELECT
      e.id, e.subject, e.current_level, e.current_page, e.current_level_raw,
      e.goal_level, e.goal_page, e.goal_level_raw, e.goal_award,
      e.schedule_days, e.schedule_time, e.submission_mode, e.date_enrolled,
      e.status, e.needs_teacher_review, e.needs_schedule_review, e.needs_level_review, e.source_note, e.teacher_id,
      s.id AS student_id, s.last_name, s.first_name, s.grade,
      s.needs_attention, s.needs_attention_note,
      s.roster_status, s.absent_reported_date, s.absent_source_note,
      s.billing_group_id, bg.name AS billing_group_name,
      t.legal_name AS teacher_legal_name, t.nickname AS teacher_nickname, t.active AS teacher_active
    FROM subject_enrollment e
    JOIN student s ON s.id = e.student_id
    LEFT JOIN teacher t ON t.id = e.teacher_id
    LEFT JOIN billing_group bg ON bg.id = s.billing_group_id
    ${where}
    ORDER BY s.last_name, s.first_name, e.subject
  `;
  const rows = await db.prepare(sql).all(...params);
  await attachSlots(db, rows);
  await attachPaymentStatus(db, rows, activeMonth);
  return rows;
}

// Attaches each row's payment status (Paid/Partial/Advance/Unpaid/Absent)
// for a single given month, computed once per distinct student_id via
// computePaymentSummary (real tuition-amount math, Aug 20 follow-up to the
// Aug 19 payments feature) and copied onto every row sharing that student --
// several rows can share one student_id here (one per subject enrollment),
// but payment status/amounts are per-student, not per-subject. Shared by the
// Roster (live + historical) and the Payments tab so the math lives in one
// place (lib/tuition.js + lib/payments.js).
async function attachPaymentStatus(db, rows, month) {
  if (!rows.length) return;
  const ids = [...new Set(rows.map((r) => r.student_id))];
  const counts = await activeSubjectCounts(db, ids);
  const grades = {};
  for (const r of rows) if (!(r.student_id in grades)) grades[r.student_id] = r.grade;
  const summaries = {};
  for (const id of ids) summaries[id] = await computePaymentSummary(db, id, grades[id], counts[id], month);
  for (const r of rows) {
    const s = summaries[r.student_id];
    r.payment_status = s.status;
    r.payment_status_label = s.statusLabel;
    r.payment_reconciled = s.reconciled;
    r.payment_reconciled_note = s.reconciledNote;
    r.payment_amount_due = s.amountDue;
    r.payment_previous_balance = s.previousBalance;
    r.payment_amount_paid = s.amountPaid;
    r.payment_remaining_balance = s.remainingBalance;
    r.payment_tuition_flagged = s.tuitionFlagged;
  }
}

// Batch-fetch schedule_slot rows for a list of enrollment rows and attach
// them as `.slots`, sorted Mon->Sun then by time. Always queried fresh, so
// any edit to an enrollment's schedule is reflected immediately everywhere.
async function attachSlots(db, rows) {
  if (!rows.length) return;
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const slots = await db.prepare(
    `SELECT id, enrollment_id, day_of_week, time24, mode, needs_mode_review FROM schedule_slot WHERE enrollment_id IN (${placeholders})`
  ).all(...ids);
  const byEnrollment = {};
  for (const s of slots) {
    (byEnrollment[s.enrollment_id] = byEnrollment[s.enrollment_id] || []).push(s);
  }
  for (const r of rows) {
    const list = byEnrollment[r.id] || [];
    list.sort((a, b) => {
      const d = DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week);
      if (d !== 0) return d;
      return (a.time24 || '').localeCompare(b.time24 || '');
    });
    r.slots = list.map((s) => ({ day: s.day_of_week, time: s.time24, mode: s.mode, needsModeReview: !!s.needs_mode_review }));
  }
}

// mode defaults to 'IC' when the client doesn't send one (matches the
// column's own DEFAULT and the confirmed "unmarked = In-Center" rule) --
// keeps this the single place that default lives, rather than requiring
// every caller to pass it explicitly.
async function replaceSlots(db, enrollmentId, slots) {
  await db.prepare(`DELETE FROM schedule_slot WHERE enrollment_id = ?`).run(enrollmentId);
  if (!slots || !slots.length) return;
  const ins = db.prepare(
    `INSERT INTO schedule_slot (enrollment_id, day_of_week, time24, mode) VALUES (?, ?, ?, ?)`
  );
  for (const s of slots) {
    if (!s.day) continue;
    await ins.run(enrollmentId, s.day, s.time || null, s.mode === 'RI' ? 'RI' : 'IC');
  }
}

// ---- undo (Aug 19) --------------------------------------------------------
// A handful of small, generic building blocks for the one-level "undo last
// edit" feature. Snapshots are whole rows (SELECT *), so they stay correct
// automatically if a table gains/loses columns later -- nothing here needs
// updating when the schema changes, matching this codebase's self-heal
// philosophy. Only covers the everyday single-record edit surfaces (student/
// enrollment add+edit, historical corrections); see closeActiveMonth() and
// lockAshrCycle() for why those bulk actions clear it instead of using it.

async function snapshotRow(db, table, id) {
  const row = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  return row || null;
}

async function snapshotSlots(db, enrollmentId) {
  return db.prepare(
    `SELECT day_of_week AS day, time24 AS time, mode FROM schedule_slot WHERE enrollment_id = ? ORDER BY id`
  ).all(enrollmentId);
}

async function restoreRow(db, table, row) {
  if (!row) return;
  const cols = Object.keys(row).filter((k) => k !== 'id');
  if (!cols.length) return;
  const setClause = cols.map((c) => `${c} = ?`).join(', ');
  await db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).run(...cols.map((c) => row[c]), row.id);
}

// Re-inserts a fully-deleted row with its original id and every original
// column value (SELECT * snapshot, same as restoreRow's) -- used to undo a
// delete, as opposed to restoreRow's UPDATE, which undoes an edit on a row
// that's still there. Preserving the original id matters here: other
// snapshotted rows in the same undo batch (e.g. schedule_slot.enrollment_id)
// reference it, so it has to come back as the same id or those references
// would point at nothing.
async function insertRow(db, table, row) {
  if (!row) return;
  const cols = Object.keys(row);
  if (!cols.length) return;
  const placeholders = cols.map(() => '?').join(', ');
  await db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).run(...cols.map((c) => row[c]));
}

async function applyUndoStep(db, step) {
  if (step.type === 'restore_row') await restoreRow(db, step.table, step.row);
  else if (step.type === 'restore_slots') await replaceSlots(db, step.enrollmentId, step.slots);
  else if (step.type === 'delete_row') await db.prepare(`DELETE FROM ${step.table} WHERE id = ?`).run(step.id);
  else if (step.type === 'delete_by') await db.prepare(`DELETE FROM ${step.table} WHERE ${step.column} = ?`).run(step.value);
  else if (step.type === 'insert_row') await insertRow(db, step.table, step.row);
}

// Applies and clears the pending undo (single-level -- no undo of an undo).
// Returns the human description for the client to show, or null if there
// was nothing to undo.
async function applyUndo(db) {
  const undo = await getLastUndo(db);
  if (!undo) return null;
  for (const step of undo.steps) await applyUndoStep(db, step);
  await clearLastUndo(db);
  return undo.description;
}

function studentLabel(row) {
  return `${row.last_name}, ${row.first_name}`;
}

async function listTimeSlots(db) {
  const rows = await db.prepare(
    `SELECT DISTINCT time24 FROM schedule_slot WHERE time24 IS NOT NULL ORDER BY time24`
  ).all();
  return rows.map((r) => r.time24);
}

async function calendar(db, query) {
  const clauses = [`e.status = 'Active'`, `ss.time24 IS NOT NULL`];
  const params = [];
  if (query.teacherId) {
    clauses.push(`e.teacher_id = ?`);
    params.push(Number(query.teacherId));
  }
  if (query.group) {
    clauses.push(`t.team_group = ?`);
    params.push(query.group);
  }
  if (query.mode === 'RI' || query.mode === 'IC') {
    clauses.push(`ss.mode = ?`);
    params.push(query.mode);
  }
  const sql = `
    SELECT
      ss.id AS schedule_slot_id, ss.day_of_week AS day, ss.time24 AS time,
      ss.mode, ss.needs_mode_review,
      e.id AS enrollment_id, e.subject, e.status,
      s.last_name, s.first_name,
      t.id AS teacher_id, t.nickname AS teacher_nickname, t.legal_name AS teacher_legal_name,
      t.active AS teacher_active, t.team_group AS teacher_team_group
    FROM schedule_slot ss
    JOIN subject_enrollment e ON e.id = ss.enrollment_id
    JOIN student s ON s.id = e.student_id
    LEFT JOIN teacher t ON t.id = e.teacher_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY ss.day_of_week, ss.time24, s.last_name
  `;
  return db.prepare(sql).all(...params);
}

// ---- daily attendance ---------------------------------------------------
// "Today" is the server machine's local date/day -- this app runs on the
// same machine (or LAN) it's used from, so local time is the right notion
// of "today" here. Deliberately NOT using toISOString() for the date, since
// that converts to UTC and would flip to the wrong calendar date for hours
// near midnight in Philippine time (UTC+8).
const DOW_ABBREV = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function todayInfo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { day: DOW_ABBREV[now.getDay()], date: `${y}-${m}-${d}` };
}

async function attendanceToday(db) {
  const { date, day } = todayInfo();
  const rows = await db.prepare(`SELECT schedule_slot_id, arrived, marked_at FROM attendance WHERE date = ?`).all(date);
  return { date, day, marks: rows };
}

async function toggleAttendance(db, scheduleSlotId) {
  const { date } = todayInfo();
  const existing = await db.prepare(
    `SELECT id FROM attendance WHERE schedule_slot_id = ? AND date = ?`
  ).get(scheduleSlotId, date);
  if (existing) {
    await db.prepare(`DELETE FROM attendance WHERE id = ?`).run(existing.id);
    return { scheduleSlotId, date, arrived: false };
  }
  await db.prepare(
    `INSERT INTO attendance (schedule_slot_id, date, arrived) VALUES (?, ?, 1)`
  ).run(scheduleSlotId, date);
  return { scheduleSlotId, date, arrived: true };
}

async function listMonths(db) {
  const rows = await db.prepare(`SELECT DISTINCT month FROM monthly_progress ORDER BY month`).all();
  return rows.map((r) => r.month);
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function nextMonthStr(month) {
  const [y, m] = month.split('-').map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

async function activeMonthInfo(db) {
  const month = await getActiveMonth(db);
  return { month, label: monthLabel(month) };
}

// Snapshots every enrollment's Goal + Actual (current_level/page) for the
// active month into monthly_progress -- the same permanent, queryable
// history the Jan-Jul backfill created from the source workbooks, now
// written going forward from data teachers enter in-app. Rows with nothing
// recorded at all (no goal, no current level) are skipped, same as the
// "completely empty" rows the original extraction already excluded.
// Idempotent: closing the same month twice just re-saves over itself
// (INSERT ... ON CONFLICT), it doesn't duplicate or double-advance.
async function closeActiveMonth(db) {
  // Close month changes what any pending "undo last edit" would even mean
  // (it clears the goal roster-wide and archives everything into
  // monthly_progress), so a stale undo from before this point could restore
  // values that no longer make sense against the new active month. Clear it
  // rather than risk a confusing/incorrect restore.
  await clearLastUndo(db);
  const month = await getActiveMonth(db);
  const rows = await db.prepare(`
    SELECT e.student_id, e.subject, e.teacher_id,
           e.goal_level, e.goal_page, e.goal_level_raw, e.goal_award,
           e.current_level, e.current_page, e.current_level_raw,
           t.nickname AS teacher_nickname, t.legal_name AS teacher_legal_name
    FROM subject_enrollment e
    LEFT JOIN teacher t ON t.id = e.teacher_id
  `).all();

  // Goal is a target curriculum level AND a separate target award (Aug 20 --
  // "i also want goal award", added back alongside the level fields rather
  // than replacing them, unlike the Aug 19/Aug 20 back-and-forth earlier the
  // same day). Archives goal_level/goal_page/goal_level_raw/goal_award
  // together, the same four columns the real Jan-Jul backfilled history and
  // the brief Aug 19 award-only period both used at different times.
  const upsert = db.prepare(`
    INSERT INTO monthly_progress
      (student_id, subject, month, teacher_id, teacher_label,
       goal_level, goal_page, goal_level_raw, goal_award,
       actual_level, actual_page, actual_level_raw, source_sheet, source_file)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'Recorded in-app (month close-out)')
    ON CONFLICT(student_id, subject, month) DO UPDATE SET
      teacher_id = excluded.teacher_id,
      teacher_label = excluded.teacher_label,
      goal_level = excluded.goal_level,
      goal_page = excluded.goal_page,
      goal_level_raw = excluded.goal_level_raw,
      goal_award = excluded.goal_award,
      actual_level = excluded.actual_level,
      actual_page = excluded.actual_page,
      actual_level_raw = excluded.actual_level_raw,
      source_sheet = excluded.source_sheet,
      source_file = excluded.source_file
  `);

  let archivedCount = 0;
  for (const r of rows) {
    const hasGoal = r.goal_level || r.goal_page || r.goal_level_raw || r.goal_award;
    const hasActual = r.current_level || r.current_page || r.current_level_raw;
    if (!hasGoal && !hasActual) continue;
    const teacherLabel = r.teacher_id ? (r.teacher_nickname || r.teacher_legal_name) : 'Unassigned';
    await upsert.run(
      r.student_id, r.subject, month, r.teacher_id || null, teacherLabel,
      r.goal_level || null, r.goal_page || null, r.goal_level_raw || null, r.goal_award || null,
      r.current_level || null, r.current_page || null, r.current_level_raw || null
    );
    archivedCount++;
  }

  // Clear every enrollment's goal so teachers start the new month with a
  // blank goal to fill in -- current_level/page deliberately carry forward
  // untouched, since that's the student's real ongoing position, not
  // something that resets month to month.
  await db.prepare(`UPDATE subject_enrollment SET goal_level = NULL, goal_page = NULL, goal_level_raw = NULL, goal_award = NULL`).run();

  const newMonth = nextMonthStr(month);
  await setActiveMonth(db, newMonth);

  return {
    archivedMonth: month,
    archivedMonthLabel: monthLabel(month),
    archivedCount,
    newActiveMonth: newMonth,
    newActiveMonthLabel: monthLabel(newMonth),
  };
}

// Roster-wide view of a single past month -- same filter shape as
// listEnrollments (q/subject/teacherId/group) so the Roster toolbar's
// existing filters carry over cleanly when switching to a historical month.
async function listMonthlyProgress(db, query) {
  const clauses = [`mp.month = ?`];
  const params = [query.month];
  if (query.q) {
    clauses.push(`(s.last_name ILIKE ? OR s.first_name ILIKE ? OR (s.first_name || ' ' || s.last_name) ILIKE ?)`);
    const like = `%${query.q}%`;
    params.push(like, like, like);
  }
  if (query.subject) {
    clauses.push(`mp.subject = ?`);
    params.push(query.subject);
  }
  if (query.teacherId) {
    clauses.push(`mp.teacher_id = ?`);
    params.push(Number(query.teacherId));
  }
  if (query.group) {
    clauses.push(`t.team_group = ?`);
    params.push(query.group);
  }
  const sql = `
    SELECT
      mp.id, mp.subject, mp.month, mp.teacher_id, mp.teacher_label,
      mp.goal_level, mp.goal_page, mp.goal_level_raw, mp.goal_award,
      mp.actual_level, mp.actual_page, mp.actual_level_raw, mp.edited_at,
      s.id AS student_id, s.last_name, s.first_name, s.grade,
      s.needs_attention, s.needs_attention_note,
      t.nickname AS teacher_nickname, t.legal_name AS teacher_legal_name
    FROM monthly_progress mp
    JOIN student s ON s.id = mp.student_id
    LEFT JOIN teacher t ON t.id = mp.teacher_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY s.last_name, s.first_name, mp.subject
  `;
  const rows = await db.prepare(sql).all(...params);
  // Note: tuition due is always computed from the student's CURRENT grade
  // and CURRENT Active subject enrollments (see computePaymentSummary) --
  // there's no historical snapshot of grade/subjects per month in this app,
  // so a past month's "amount due" reflects today's roster, not that
  // month's. Flagged in the README as a known caveat, same treatment as
  // every other "current state projected backward" limitation here.
  await attachPaymentStatus(db, rows, query.month);
  return rows;
}

async function studentProgress(db, studentId) {
  return db.prepare(`
    SELECT
      mp.id, mp.subject, mp.month, mp.teacher_id, mp.teacher_label,
      mp.goal_level, mp.goal_page, mp.goal_level_raw, mp.goal_award,
      mp.actual_level, mp.actual_page, mp.actual_level_raw, mp.edited_at,
      mp.source_sheet, mp.source_file,
      t.nickname AS teacher_nickname, t.legal_name AS teacher_legal_name
    FROM monthly_progress mp
    LEFT JOIN teacher t ON t.id = mp.teacher_id
    WHERE mp.student_id = ?
    ORDER BY mp.month, mp.subject
  `).all(studentId);
}

// Correcting an already-closed historical record -- password-gated (see
// lib/db.js) since there's no per-teacher login yet. Clears the raw-text
// fields on edit: they held the original spreadsheet cell's literal text for
// provenance, which no longer matches once someone has typed a real
// correction over it, so keeping the stale raw string around would just be
// confusing (display always prefers level/page over raw anyway).
async function updateMonthlyProgress(db, id, body) {
  let teacherLabel = 'Unassigned';
  if (body.teacherId) {
    const t = await db.prepare(`SELECT nickname, legal_name FROM teacher WHERE id = ?`).get(body.teacherId);
    if (t) teacherLabel = t.nickname || t.legal_name;
  }
  await db.prepare(`
    UPDATE monthly_progress SET
      goal_level = ?, goal_page = ?, goal_level_raw = NULL, goal_award = ?,
      actual_level = ?, actual_page = ?, actual_level_raw = NULL,
      teacher_id = ?, teacher_label = ?,
      edited_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    body.goalLevel || null, body.goalPage || null, body.goalAward || null,
    body.actualLevel || null, body.actualPage || null,
    body.teacherId || null, teacherLabel,
    id
  );
}

// --- ASHR (Advanced Student Honor Roll) -----------------------------------

// Every cycle that has real locked history, plus the current in-progress
// (live preview) cycle -- in reverse-chronological order so the newest
// cycle (the live one) shows first.
async function ashrCycles(db) {
  const lockedCycleRows = await db.prepare(`SELECT DISTINCT cycle FROM ashr_award ORDER BY cycle`).all();
  const lockedCycles = lockedCycleRows.map((r) => r.cycle);
  const activeCycle = await getAshrActiveCycle(db);
  const cycles = [...lockedCycles];
  if (!cycles.includes(activeCycle)) cycles.push(activeCycle);
  return cycles
    .sort()
    .reverse()
    .map((cycle) => ({
      cycle,
      label: ashr.cycleLabel(cycle),
      locked: cycle !== activeCycle,
    }));
}

// Historical (locked) cycle: pure lookup of already-recorded facts, no
// computation needed -- these are real awards, either backfilled from the
// source workbooks or written by a prior "lock in" action.
async function listAshrLocked(db, cycle, query) {
  const clauses = [`a.cycle = ?`];
  const params = [cycle];
  if (query.subject) { clauses.push(`a.subject = ?`); params.push(query.subject); }
  if (query.grade) { clauses.push(`a.grade_at_cycle = ?`); params.push(query.grade); }
  if (query.teacherId) { clauses.push(`a.teacher_id = ?`); params.push(Number(query.teacherId)); }
  if (query.result) { clauses.push(`a.result = ?`); params.push(query.result); }
  if (query.hideDouble === '1') { clauses.push(`a.result != 'Double Award'`); }
  if (query.q) {
    clauses.push(`(s.last_name ILIKE ? OR s.first_name ILIKE ? OR (s.first_name || ' ' || s.last_name) ILIKE ?)`);
    const like = `%${query.q}%`;
    params.push(like, like, like);
  }
  const rows = await db.prepare(`
    SELECT a.id, a.student_id, s.last_name, s.first_name, a.subject,
           a.grade_at_cycle AS grade, a.level_raw, a.result, a.teacher_id, a.teacher_label,
           a.source, a.edited_at
    FROM ashr_award a
    JOIN student s ON s.id = a.student_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY s.last_name, s.first_name, a.subject
  `).all(...params);
  return rows.map((r) => ({ ...r, cycle, locked: true, previousResult: null }));
}

// Live (in-progress) cycle: both Math and Reading are computed on the fly
// from each active enrollment's current level against the qualifying-level
// table, compared to the most recent locked cycle's result (same subject)
// to resolve New vs. Double Award.
async function listAshrLive(db, cycle, query) {
  const cutoff = cycle.endsWith('-08') ? 'August' : 'February';
  const clauses = [`e.status = 'Active'`];
  const params = [];
  if (query.subject) { clauses.push(`e.subject = ?`); params.push(query.subject); }
  if (query.grade) { clauses.push(`s.grade = ?`); params.push(query.grade); }
  if (query.teacherId) { clauses.push(`e.teacher_id = ?`); params.push(Number(query.teacherId)); }
  if (query.q) {
    clauses.push(`(s.last_name ILIKE ? OR s.first_name ILIKE ? OR (s.first_name || ' ' || s.last_name) ILIKE ?)`);
    const like = `%${query.q}%`;
    params.push(like, like, like);
  }
  const rows = await db.prepare(`
    SELECT e.id AS enrollment_id, s.id AS student_id, s.last_name, s.first_name, s.grade, e.subject,
           e.current_level_raw, e.current_level, e.current_page, e.teacher_id,
           t.nickname AS teacher_nickname, t.legal_name AS teacher_legal_name
    FROM subject_enrollment e
    JOIN student s ON s.id = e.student_id
    LEFT JOIN teacher t ON t.id = e.teacher_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY s.last_name, s.first_name, e.subject
  `).all(...params);

  const prevStmt = db.prepare(`
    SELECT result FROM ashr_award
    WHERE student_id = ? AND subject = ? AND cycle < ?
    ORDER BY cycle DESC LIMIT 1
  `);

  const out = [];
  for (const r of rows) {
    // Bug fix (Aug 19, extended to Reading Aug 20): current_level/
    // current_page is the live, editable field -- it's what changes the
    // instant a teacher edits a level from the Roster panel.
    // current_level_raw is a frozen snapshot of whatever the ORIGINAL
    // import-time spreadsheet cell said, and is never touched by an in-app
    // edit (updateEnrollment() only ever writes current_level/current_page).
    // This used to check current_level_raw FIRST, so once a student's level
    // was edited in-app, the ASHR live preview kept computing off the stale
    // original import value forever -- exactly the "I updated the level in
    // the roster but ASHR didn't reflect it" report.
    //
    // Shipped Math-only on Aug 19 -- Reading was held back at the time
    // because diffing this fix against real data surfaced a separate,
    // pre-existing extraction bug affecting 47 Reading enrollments (some had
    // a lost page number, e.g. "D1 190" stored as level "D" page 1; a more
    // serious handful had the wrong LETTER entirely, e.g. "G-I 100" stored
    // as level "I", two to three curriculum levels ahead of reality).
    // Preferring current_level/current_page for Reading at that point would
    // have silently swapped 47 currently-*correct* ASHR results (computed
    // from the still-accurate current_level_raw) for wrong ones.
    //
    // Aug 20: those 47 rows were corrected at the source (see
    // repairReadingLevels() in lib/db.js -- a one-time, explicitly-
    // enumerated repair, not a recurring self-heal, precisely so it can
    // never clobber a real teacher edit made since). With current_level/
    // current_page now trustworthy for Reading too, this switches Reading
    // over to the same live-field preference Math already had -- re-verified
    // with the same full-database diff method that caught the original
    // regression, this time comparing pre-repair vs. post-repair-and-fix
    // output: 47 Reading rows changed (all matching the repair list
    // exactly), zero unexpected changes elsewhere.
    const levelRaw = r.current_level
      ? `${r.current_level} ${r.current_page || ''}`.trim()
      : r.current_level_raw;
    const tier = ashr.computeTier(r.subject, cutoff, r.grade, levelRaw);
    if (!tier) continue; // ungraded, unrecognized grade, or no level recorded yet
    const prevRow = await prevStmt.get(r.student_id, r.subject, cycle);
    const { result, status } = ashr.resolveAwardStatus(tier, prevRow ? prevRow.result : null);
    if (result === 'N/A') continue; // matches the source sheets: only qualifiers are listed
    if (query.result && result !== query.result) continue;
    if (query.hideDouble === '1' && result === 'Double Award') continue;
    out.push({
      id: null,
      student_id: r.student_id,
      last_name: r.last_name,
      first_name: r.first_name,
      subject: r.subject,
      grade: ashr.normalizeGrade(r.grade),
      level_raw: levelRaw,
      result,
      teacher_id: r.teacher_id,
      teacher_label: r.teacher_nickname || r.teacher_legal_name || 'Unassigned',
      source: 'live preview',
      edited_at: null,
      cycle,
      locked: false,
      previousResult: prevRow ? prevRow.result : null,
      status,
    });
  }
  return out;
}

async function listAshr(db, query) {
  const cycle = query.cycle;
  if (!cycle) throw new Error('cycle is required');
  const activeCycle = await getAshrActiveCycle(db);
  if (cycle === activeCycle) return listAshrLive(db, cycle, query);
  return listAshrLocked(db, cycle, query);
}

// Locks the live preview (both Math and Reading) into permanent history
// and advances the active cycle. Mirrors "Close month": no password gate
// on this forward action (only *editing* a locked record is gated), and
// it's idempotent-ish in spirit but NOT safe to double-click the way Close
// month is, since it always advances -- the button is disabled client-side
// after a successful lock to avoid an accidental double-fire.
async function lockAshrCycle(db) {
  // Same reasoning as closeActiveMonth: locking a cycle changes what a
  // pending undo would mean, so clear any stale one rather than risk a
  // confusing/incorrect restore.
  await clearLastUndo(db);
  const cycle = await getAshrActiveCycle(db);
  const rows = await listAshrLive(db, cycle, {});
  const ins = db.prepare(`
    INSERT INTO ashr_award (student_id, subject, cycle, grade_at_cycle, level_raw, result, teacher_id, teacher_label, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'computed')
    ON CONFLICT(student_id, subject, cycle) DO UPDATE SET
      grade_at_cycle = excluded.grade_at_cycle,
      level_raw = excluded.level_raw,
      result = excluded.result,
      teacher_id = excluded.teacher_id,
      teacher_label = excluded.teacher_label,
      source = excluded.source
  `);
  for (const r of rows) {
    await ins.run(r.student_id, r.subject, cycle, r.grade, r.level_raw, r.result, r.teacher_id, r.teacher_label);
  }
  const nextCycle = ashr.nextAshrCycle(cycle);
  await setAshrActiveCycle(db, nextCycle);
  return {
    lockedCycle: cycle,
    lockedCycleLabel: ashr.cycleLabel(cycle),
    lockedCount: rows.length,
    newActiveCycle: nextCycle,
    newActiveCycleLabel: ashr.cycleLabel(nextCycle),
  };
}

// Correcting an already-locked ASHR record -- same password gate as
// monthly-progress corrections (see lib/db.js). Backend only for now; a
// dedicated edit panel is a natural fast-follow once this first cut has
// been used for a cycle or two, same as how history-editing followed the
// initial Goal/Actual tracking build.
async function updateAshrAward(db, id, body) {
  let teacherLabel = 'Unassigned';
  if (body.teacherId) {
    const t = await db.prepare(`SELECT nickname, legal_name FROM teacher WHERE id = ?`).get(body.teacherId);
    if (t) teacherLabel = t.nickname || t.legal_name;
  }
  await db.prepare(`
    UPDATE ashr_award SET
      result = ?, level_raw = ?, teacher_id = ?, teacher_label = ?,
      source = 'corrected', edited_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(body.result, body.levelRaw || null, body.teacherId || null, teacherLabel, id);
}

// ---- Payments (tuition + Statement of Account tracking, Aug 19; real
// tuition amounts, Aug 20 same-day follow-up) -----------------------------
// Billed per student (not per subject enrollment) -- see lib/payments.js
// for the status/date-math rules. Same "absence of row = default state"
// pattern as attendance: a payment_record row only exists once something's
// actually been recorded for that student that month.

// Batch count of currently-Active subject enrollments per student, used to
// compute tuition (rate x subject count). Always counts ALL of a student's
// Active enrollments regardless of any Roster/Payments-tab filter in play --
// "how many subjects is this student billed for" is a fact about the
// student, not about what's currently on screen.
async function activeSubjectCounts(db, studentIds) {
  const out = {};
  for (const id of studentIds) out[id] = 0;
  if (!studentIds.length) return out;
  const placeholders = studentIds.map(() => '?').join(',');
  const rows = await db.prepare(
    `SELECT student_id, COUNT(*) AS c FROM subject_enrollment WHERE status = 'Active' AND student_id IN (${placeholders}) GROUP BY student_id`
  ).all(...studentIds);
  for (const r of rows) out[r.student_id] = Number(r.c);
  return out;
}

// The amount actually credited toward a month. If amount_paid was entered,
// use it. Otherwise, a legacy row from before amount-tracking existed
// (paid_date set, amount_paid still NULL) is read as "paid in full" -- see
// the ALTER TABLE comment in lib/db.js for why this is a faithful reading
// of what was already recorded, not a new guess.
function effectiveAmountPaid(record, amountDue) {
  if (!record) return 0;
  if (record.amount_paid !== null && record.amount_paid !== undefined) return record.amount_paid;
  if (record.paid_date) return amountDue || 0;
  return 0;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Full per-student, per-month payment picture: tuition due (from grade +
// active subject count), previous balance carried forward, advance/credit
// auto-applied from a prior month's overpayment, amount actually paid this
// month, and the resulting remaining balance + status. Implements the Aug 20
// Master Platform Specification's Parts 7 & 9 (tuition per subject; Paid /
// Unpaid / Partially Paid / Advance Payment / Previous Balance / Remaining
// Balance) at the single-student level -- billing groups and a consolidated
// SOA document are explicitly out of scope for this pass.
//
// Previous balance only looks ONE month back, and only if that prior month
// already has a payment_record row -- deliberately bounded rather than
// walking arbitrarily far into the past. payment_record didn't exist before
// Aug 19, 2026, so retroactively inventing a multi-month debt history for
// months nothing was ever recorded in would be a guess, not a fact. From
// Sept 2026 onward the chain is real and carries correctly month to month
// (recursion naturally terminates the first time it hits a month with no
// existing row).
async function computePaymentSummary(db, studentId, grade, activeCount, month, _depth) {
  const depth = _depth || 0;
  const normalizedGrade = ashr.normalizeGrade(grade);
  const tuitionInfo = tuition.computeTuitionDue(normalizedGrade, activeCount);
  const record = await db.prepare(`SELECT * FROM payment_record WHERE student_id = ? AND month = ?`).get(studentId, month);

  let previousBalance = 0;
  let advanceAvailable = 0;
  if (depth < 24) { // sanity bound only -- real chains are far shorter, bounded by actual recorded months
    const prevMonth = payments.addMonths(month, -1);
    const prevExists = await db.prepare(`SELECT 1 FROM payment_record WHERE student_id = ? AND month = ?`).get(studentId, prevMonth);
    if (prevExists) {
      const prevSummary = await computePaymentSummary(db, studentId, grade, activeCount, prevMonth, depth + 1);
      if (prevSummary.remainingBalance > 0) previousBalance = prevSummary.remainingBalance;
      else advanceAvailable = -prevSummary.remainingBalance;
    }
  }

  const amountDue = tuitionInfo.amountDue; // null when grade couldn't be classified -- never silently treated as 0
  const totalDue = (amountDue || 0) + previousBalance;
  const appliedAdvance = Math.min(advanceAvailable, totalDue);
  const netDueAfterAdvance = totalDue - appliedAdvance;
  const amountPaid = effectiveAmountPaid(record, amountDue);
  const remainingBalance = round2(netDueAfterAdvance - amountPaid);

  const resolved = payments.resolvePaymentStatus({
    amountPaid,
    remainingBalance,
    paidDate: record ? record.paid_date : null,
    absentDate: record ? record.marked_absent_date : null,
  });

  return {
    month,
    amountDue, tuitionFlagged: tuitionInfo.flagged, rate: tuitionInfo.rate, subjectCount: tuitionInfo.subjectCount,
    previousBalance: round2(previousBalance), advanceApplied: round2(appliedAdvance),
    netDueAfterAdvance: round2(netDueAfterAdvance),
    amountPaid: round2(amountPaid), remainingBalance,
    status: resolved.status, statusLabel: resolved.label,
    reconciled: resolved.reconciled, reconciledNote: resolved.reconciledNote,
    paidDate: record ? record.paid_date : null, markedAbsentDate: record ? record.marked_absent_date : null,
  };
}

async function listPaymentMonths(db) {
  const rows = await db.prepare(`SELECT DISTINCT month FROM payment_record ORDER BY month`).all();
  const months = rows.map((r) => r.month);
  const active = await getActiveMonth(db);
  if (!months.includes(active)) months.push(active);
  return months.sort();
}

// Student-level list for one month (defaults to the active month), with the
// same search/teacher/group filter shape as the Roster tab plus a
// status/needs-attention filter of its own. Only students with at least one
// Active enrollment are billed -- someone who's Absent on every subject
// shouldn't show up expecting tuition tracking.
async function listPayments(db, query) {
  const month = query.month || await getActiveMonth(db);
  const clauses = [`EXISTS (SELECT 1 FROM subject_enrollment e2 WHERE e2.student_id = s.id AND e2.status = 'Active')`];
  const params = [];
  if (query.q) {
    clauses.push(`(s.last_name ILIKE ? OR s.first_name ILIKE ? OR (s.first_name || ' ' || s.last_name) ILIKE ?)`);
    const like = `%${query.q}%`;
    params.push(like, like, like);
  }
  if (query.teacherId) {
    clauses.push(`EXISTS (SELECT 1 FROM subject_enrollment e2 WHERE e2.student_id = s.id AND e2.teacher_id = ? AND e2.status = 'Active')`);
    params.push(Number(query.teacherId));
  }
  if (query.group) {
    clauses.push(`EXISTS (SELECT 1 FROM subject_enrollment e2 JOIN teacher t2 ON t2.id = e2.teacher_id WHERE e2.student_id = s.id AND t2.team_group = ? AND e2.status = 'Active')`);
    params.push(query.group);
  }
  if (query.needsAttention === '1') {
    clauses.push(`s.needs_attention = 1`);
  }
  const rows = await db.prepare(`
    SELECT s.id AS student_id, s.last_name, s.first_name, s.grade,
           s.needs_attention, s.needs_attention_note,
           s.roster_status, s.absent_reported_date, s.absent_source_note,
           s.billing_group_id, bg.name AS billing_group_name,
           pr.soa1_sent_date, pr.soa2_sent_date, pr.soa3_sent_date, pr.soa4_sent_date,
           pr.paid_date, pr.marked_absent_date, pr.amount_paid, pr.notes AS payment_notes
    FROM student s
    LEFT JOIN payment_record pr ON pr.student_id = s.id AND pr.month = ?
    LEFT JOIN billing_group bg ON bg.id = s.billing_group_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY s.last_name, s.first_name
  `).all(month, ...params);

  // A student can have Math with one teacher and Reading with another, so
  // this is a small display string (all distinct active teachers), not a
  // filter key -- the filter above already scoped by teacherId/group. The
  // same query also drives the Math/Reading/Both subject icon on the
  // Payments tab (Aug 20 follow-up) -- each active enrollment's subject is
  // just carried along here rather than queried a second time. `e.id` is
  // carried along too as of Aug 25 -- the Payments tab's "tag absent" action
  // needs the actual enrollment id(s) to flip, not just the subject name.
  const teacherRows = await db.prepare(`
    SELECT e.id, e.student_id, e.subject, t.nickname, t.legal_name
    FROM subject_enrollment e LEFT JOIN teacher t ON t.id = e.teacher_id
    WHERE e.status = 'Active'
  `).all();
  const teachersByStudent = {};
  for (const r of teacherRows) {
    (teachersByStudent[r.student_id] = teachersByStudent[r.student_id] || []).push(r);
  }

  const today = todayInfo().date;
  const counts = await activeSubjectCounts(db, rows.map((r) => r.student_id));
  const receiptsByStudent = await receiptsForStudentsMonth(db, rows.map((r) => r.student_id), month);
  let out = await Promise.all(rows.map(async (r) => {
    const summary = await computePaymentSummary(db, r.student_id, r.grade, counts[r.student_id], month);
    const list = teachersByStudent[r.student_id] || [];
    const teacherLabel = [...new Set(list.map((t) => t.nickname || t.legal_name).filter(Boolean))].join(', ') || 'Unassigned';
    const subjects = [...new Set(list.map((t) => t.subject).filter(Boolean))].sort();
    // One entry per active subject_enrollment id (Aug 25, "tag absent" from
    // Payments) -- deliberately kept separate from `subjects` above rather
    // than reusing it, since `subjects` is just a deduped display string and
    // the tag-absent picker needs the real, individually-checkable rows
    // (id + subject) to send back to the server.
    const activeEnrollments = list
      .map((t) => ({ id: t.id, subject: t.subject }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
    return {
      student_id: r.student_id, last_name: r.last_name, first_name: r.first_name, grade: r.grade,
      teacher_label: teacherLabel, subjects, active_enrollments: activeEnrollments,
      needs_attention: !!r.needs_attention, needs_attention_note: r.needs_attention_note,
      // Aug 27 follow-up -- the frontend needs to know a row's billing group
      // (and who else is in it) at the moment a receipt is dropped, so it
      // can offer "just this student, or split across the whole group" --
      // this join was missing from listPayments before (listRoster already
      // had it), so a grouped student's own Payments row had no way to know
      // it belonged to a group at all.
      billing_group_id: r.billing_group_id || null, billing_group_name: r.billing_group_name || null,
      month,
      soa1_sent_date: r.soa1_sent_date || null, soa2_sent_date: r.soa2_sent_date || null,
      soa3_sent_date: r.soa3_sent_date || null, soa4_sent_date: r.soa4_sent_date || null,
      paid_date: r.paid_date || null, marked_absent_date: r.marked_absent_date || null,
      amount_paid: r.amount_paid === null || r.amount_paid === undefined ? null : r.amount_paid,
      payment_notes: r.payment_notes || null,
      due_date: payments.dueDateForMonth(month),
      amount_due: summary.amountDue, tuition_flagged: summary.tuitionFlagged,
      tuition_rate: summary.rate, subject_count: summary.subjectCount,
      previous_balance: summary.previousBalance, advance_applied: summary.advanceApplied,
      remaining_balance: summary.remainingBalance,
      status: summary.status, status_label: summary.statusLabel,
      reconciled: summary.reconciled, reconciled_note: summary.reconciledNote,
      overdue: payments.isOverdue(summary.status, summary.remainingBalance, month, today),
      receipts: receiptsByStudent[r.student_id] || [],
    };
  }));
  if (query.status) out = out.filter((r) => r.status === query.status);
  return out;
}

// ---- Payment receipts (Aug 27 follow-up) -------------------------------
// A teacher drags a receipt screenshot onto a student's Payments row; it's
// saved to disk, OCR'd best-effort, and stored here as its own row (see the
// payment_receipt table comment in lib/db.js for why this is a separate
// table from payment_record rather than a column on it). Joanne then
// verifies/flags/rejects each one from the new Payment Verification tab --
// only a verified receipt's amount actually lands in payment_record.

function receiptRowForClient(r) {
  return {
    id: r.id, student_id: r.student_id, month: r.month,
    reference_number: r.reference_number || null,
    amount: r.amount === null || r.amount === undefined ? null : r.amount,
    paid_date: r.paid_date || null,
    status: r.status, review_note: r.review_note || null,
    extracted_reference: r.extracted_reference || null,
    extracted_amount: r.extracted_amount === null || r.extracted_amount === undefined ? null : r.extracted_amount,
    extracted_date: r.extracted_date || null,
    ocr_error: r.ocr_error || null,
    uploaded_by: r.uploaded_by || null,
    uploaded_at: r.uploaded_at, reviewed_at: r.reviewed_at || null,
    // Aug 27 follow-up -- non-null when this receipt was created as part of
    // a whole-billing-group upload (see saveGroupReceiptUploadWithUndo).
    // Every row sharing this id came from the same physical screenshot; the
    // frontend uses it to cluster them into one combined Verification-queue
    // card instead of showing the same image once per group member.
    group_upload_id: r.group_upload_id || null,
  };
}

// Batch-loads every receipt for a set of students in one month, grouped by
// student_id -- same "one query, group in JS" shape listPayments already
// uses for teacher/subject data above, rather than one query per row.
async function receiptsForStudentsMonth(db, studentIds, month) {
  const out = {};
  for (const id of studentIds) out[id] = [];
  if (!studentIds.length) return out;
  const placeholders = studentIds.map(() => '?').join(',');
  const rows = await db.prepare(
    `SELECT * FROM payment_receipt WHERE month = ? AND student_id IN (${placeholders}) ORDER BY uploaded_at DESC`
  ).all(month, ...studentIds);
  for (const r of rows) (out[r.student_id] = out[r.student_id] || []).push(receiptRowForClient(r));
  return out;
}

// The Payment Verification tab's queue: every receipt still awaiting a
// decision (pending_review) or already flagged for follow-up, oldest first
// so Joanne naturally works through them in the order they came in.
// Rejected/verified receipts are deliberately excluded from the live queue
// -- they're done, and stay visible only via the student's own Payments
// row/edit panel from here on, not cluttering the working queue.
async function listPendingReceipts(db) {
  const rows = await db.prepare(`
    SELECT pr.*, s.first_name, s.last_name
    FROM payment_receipt pr JOIN student s ON s.id = pr.student_id
    WHERE pr.status IN ('pending_review', 'flagged')
    ORDER BY (pr.status = 'flagged'), pr.uploaded_at ASC
  `).all();
  return rows.map((r) => ({
    ...receiptRowForClient(r),
    first_name: r.first_name, last_name: r.last_name,
  }));
}

// Calls OCR.space with a base64 image and returns { rawText, error }.
// Deliberately never throws -- an OCR failure (no key configured, network
// error, rate limit, bad response shape) degrades to "no extraction," not
// a failed upload. The receipt still saves and shows up in Joanne's queue;
// reference/amount/date are just left blank for whoever uploaded it (or
// Joanne) to fill in by hand, same "flag rather than guess" fallback used
// everywhere else in this app.
function callOcrSpace(base64DataUri) {
  return new Promise((resolve) => {
    if (!OCR_SPACE_API_KEY) {
      return resolve({ rawText: null, error: 'OCR not configured (no OCR_SPACE_API_KEY set).' });
    }
    const bodyParams = new URLSearchParams({
      base64Image: base64DataUri,
      language: 'eng',
      OCREngine: '2',
      scale: 'true',
    });
    const body = bodyParams.toString();
    const req = https.request(OCR_SPACE_ENDPOINT, {
      method: 'POST',
      headers: {
        apikey: OCR_SPACE_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 20000,
    }, (ocrRes) => {
      const chunks = [];
      ocrRes.on('data', (c) => chunks.push(c));
      ocrRes.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (parsed.IsErroredOnProcessing) {
            return resolve({ rawText: null, error: String(parsed.ErrorMessage || 'OCR.space reported an error.') });
          }
          const text = parsed.ParsedResults && parsed.ParsedResults[0] && parsed.ParsedResults[0].ParsedText;
          if (!text) return resolve({ rawText: null, error: 'OCR.space returned no text.' });
          resolve({ rawText: text, error: null });
        } catch (e) {
          resolve({ rawText: null, error: `Could not parse OCR.space response: ${e.message}` });
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ rawText: null, error: 'OCR.space request timed out.' }); });
    req.on('error', (e) => resolve({ rawText: null, error: `OCR.space request failed: ${e.message}` }));
    req.write(body);
    req.end();
  });
}

const RECEIPT_MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

// Shared by both the solo upload (saveReceiptUploadWithUndo) and the
// whole-group upload (saveGroupReceiptUploadWithUndo) below -- decodes and
// saves the image once, runs OCR once, and returns everything both callers
// need. Pulled out on the Aug 27 group-receipt follow-up specifically so a
// combined-family receipt only costs ONE OCR.space call and ONE saved file,
// not one per member.
async function writeReceiptFileAndRunOcr(filenamePrefix, dataUri) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri || '');
  if (!match) throw new Error('Expected a base64 image data URI.');
  const mimeType = match[1];
  const ext = RECEIPT_MIME_EXT[mimeType];
  if (!ext) throw new Error(`Unsupported image type: ${mimeType}. Use PNG, JPEG, or WebP.`);
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_RECEIPT_BYTES) {
    throw new Error(`Image is too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB) -- please upload under 8MB.`);
  }

  const filename = `${filenamePrefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const storedRef = await receiptStorage.saveReceiptFile(filename, buffer, mimeType);

  const { rawText, error } = await callOcrSpace(dataUri);
  const parsed = rawText ? ocr.parseReceiptText(rawText) : { referenceNumber: null, amount: null, date: null };

  return { filename: storedRef, mimeType, rawText, error, parsed };
}

// Saves an uploaded receipt (base64 data URI) to disk, best-effort OCRs it,
// and inserts the payment_receipt row -- undo-covered like every other
// write in this app (a mis-drag is one Ctrl+Z away from gone).
async function saveReceiptUploadWithUndo(db, studentId, month, dataUri, uploadedBy) {
  const { filename, mimeType, rawText, error, parsed } = await writeReceiptFileAndRunOcr(String(studentId), dataUri);

  const info = await db.prepare(`
    INSERT INTO payment_receipt
      (student_id, month, file_path, mime_type, ocr_raw_text, ocr_error,
       extracted_reference, extracted_amount, extracted_date,
       reference_number, amount, paid_date, status, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?)
    RETURNING id
  `).run(
    studentId, month, filename, mimeType, rawText || null, error || null,
    parsed.referenceNumber, parsed.amount, parsed.date,
    parsed.referenceNumber, parsed.amount, parsed.date,
    uploadedBy || null
  );
  const receipt = await db.prepare(`SELECT * FROM payment_receipt WHERE id = ?`).get(info.lastInsertRowid);
  const student = await db.prepare('SELECT * FROM student WHERE id = ?').get(studentId);
  await setLastUndo(db, {
    description: `uploaded a receipt for ${studentLabel(student)}`,
    steps: [{ type: 'delete_row', table: 'payment_receipt', id: receipt.id }],
  });
  return receipt;
}

// Aug 27 follow-up -- one receipt covering an entire billing group (see the
// group_upload_id column comment in lib/db.js for the real-world bug this
// fixes: three siblings, one combined transfer, previously credited in
// full to each of them independently). Saves the image and runs OCR ONCE,
// then inserts one independent payment_receipt row per member -- each row
// is otherwise identical in shape and behavior to a solo upload (its own
// id, own status, own Verify/Flag/Reject/Delete, own per-row undo
// coverage if acted on individually later) -- only `group_upload_id` ties
// them together, purely so the Verification queue can offer one combined
// review action. `splits` is an array of { studentId, amount } the caller
// has already resolved (defaulted from each member's own tuition due,
// possibly hand-adjusted) -- members not included (e.g. a sibling this
// particular receipt doesn't cover) simply get no row created for them.
async function saveGroupReceiptUploadWithUndo(db, groupId, month, dataUri, uploadedBy, splits) {
  const group = await db.prepare(`SELECT * FROM billing_group WHERE id = ?`).get(groupId);
  if (!group) throw new Error('Billing group not found.');

  const memberRows = await db.prepare(`SELECT id FROM student WHERE billing_group_id = ?`).all(groupId);
  // Number(...) here matters beyond style: a Postgres integer column can come
  // back as a string depending on the driver (see lib/pg-lite.js's header --
  // real `pg` parses plain integers to JS numbers, but this app's local-only
  // fallback client doesn't), and Set.has() never coerces types, so this
  // Set has to hold the same JS type cleanSplits compares against below.
  const memberIds = new Set(memberRows.map((r) => Number(r.id)));
  const cleanSplits = (Array.isArray(splits) ? splits : [])
    .map((s) => ({ studentId: Number(s.studentId), amount: Number(s.amount) }))
    .filter((s) => memberIds.has(s.studentId) && Number.isFinite(s.amount) && s.amount > 0);
  if (!cleanSplits.length) {
    throw new Error('Enter at least one member\'s share before uploading.');
  }

  const { filename, mimeType, rawText, error, parsed } = await writeReceiptFileAndRunOcr(`group${groupId}`, dataUri);
  const groupUploadId = crypto.randomBytes(8).toString('hex');

  const insertStmt = db.prepare(`
    INSERT INTO payment_receipt
      (student_id, month, file_path, mime_type, ocr_raw_text, ocr_error,
       extracted_reference, extracted_amount, extracted_date,
       reference_number, amount, paid_date, status, uploaded_by, group_upload_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?)
    RETURNING id
  `);
  const steps = [];
  const created = [];
  for (const split of cleanSplits) {
    const info = await insertStmt.run(
      split.studentId, month, filename, mimeType, rawText || null, error || null,
      parsed.referenceNumber, parsed.amount, parsed.date,
      parsed.referenceNumber, split.amount, parsed.date,
      uploadedBy || null, groupUploadId
    );
    steps.push({ type: 'delete_row', table: 'payment_receipt', id: info.lastInsertRowid });
    const receiptRow = await db.prepare(`SELECT * FROM payment_receipt WHERE id = ?`).get(info.lastInsertRowid);
    created.push(receiptRowForClient(receiptRow));
  }

  await setLastUndo(db, {
    description: `uploaded a group receipt for the "${group.name}" billing group (${created.length} student${created.length === 1 ? '' : 's'})`,
    steps,
  });
  return { groupUploadId, receipts: created };
}

function round2Local(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Adds a verified receipt's amount into the student's (student_id, month)
// payment_record.amount_paid -- additive, not a replace, since a month can
// have more than one verified receipt (two partial payments). Only sets
// paid_date if the record doesn't already have one, consistent with
// paid_date's existing meaning elsewhere as "a payment landed this month"
// rather than "the most recent payment's date." This is the ONLY place a
// receipt's amount ever touches payment_record -- pending/flagged/rejected
// receipts never reach here (see verifyReceiptWithUndo below).
async function addVerifiedAmountToPaymentRecord(db, studentId, month, amountToAdd, paidDateGuess) {
  const existing = await db.prepare(`SELECT * FROM payment_record WHERE student_id = ? AND month = ?`).get(studentId, month);
  const newAmount = round2Local((existing && existing.amount_paid ? existing.amount_paid : 0) + amountToAdd);
  const paidDate = (existing && existing.paid_date) ? existing.paid_date : (paidDateGuess || null);
  await db.prepare(`
    INSERT INTO payment_record (student_id, month, paid_date, amount_paid, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, month) DO UPDATE SET
      paid_date = COALESCE(payment_record.paid_date, excluded.paid_date),
      amount_paid = ?,
      updated_at = CURRENT_TIMESTAMP
  `).run(studentId, month, paidDate, newAmount, newAmount);
}

// Verify: requires a final amount and paid date (reference number is
// encouraged but not required -- some legitimate transfers genuinely don't
// show one clearly). Folds the amount into payment_record (see above) and
// marks the receipt verified. Both writes are one undo entry, so Ctrl+Z
// correctly reverses the balance change together with the status flip
// rather than leaving them out of sync.
async function verifyReceiptWithUndo(db, receiptId, body) {
  const receipt = await db.prepare(`SELECT * FROM payment_receipt WHERE id = ?`).get(receiptId);
  if (!receipt) throw new Error('Receipt not found.');
  if (receipt.status === 'verified') throw new Error('This receipt has already been verified.');

  const referenceNumber = body.referenceNumber !== undefined ? (body.referenceNumber || null) : receipt.reference_number;
  const amount = body.amount !== undefined && body.amount !== null && body.amount !== ''
    ? Number(body.amount) : receipt.amount;
  const paidDate = body.paidDate !== undefined ? (body.paidDate || null) : receipt.paid_date;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter the amount received before verifying.');
  }
  if (!paidDate) {
    throw new Error('Enter the date paid before verifying.');
  }

  const previousReceipt = { ...receipt };
  const previousPayment = await db.prepare(`SELECT * FROM payment_record WHERE student_id = ? AND month = ?`)
    .get(receipt.student_id, receipt.month);

  await db.prepare(`
    UPDATE payment_receipt
    SET reference_number = ?, amount = ?, paid_date = ?, status = 'verified',
        review_note = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(referenceNumber, amount, paidDate, body.note || null, receiptId);
  await addVerifiedAmountToPaymentRecord(db, receipt.student_id, receipt.month, amount, paidDate);

  const student = await db.prepare('SELECT * FROM student WHERE id = ?').get(receipt.student_id);
  const newPayment = await db.prepare(`SELECT * FROM payment_record WHERE student_id = ? AND month = ?`)
    .get(receipt.student_id, receipt.month);
  await setLastUndo(db, {
    description: `verified a receipt for ${studentLabel(student)}`,
    steps: [
      previousPayment
        ? { type: 'restore_row', table: 'payment_record', row: previousPayment }
        : { type: 'delete_row', table: 'payment_record', id: newPayment.id },
      { type: 'restore_row', table: 'payment_receipt', row: previousReceipt },
    ],
  });
  return db.prepare(`SELECT * FROM payment_receipt WHERE id = ?`).get(receiptId);
}

// Aug 27 follow-up -- verifies every not-yet-verified receipt sharing one
// group_upload_id in a single action, splitting the payment across members
// by whatever amount each was assigned (see saveGroupReceiptUploadWithUndo).
// Same validation and same addVerifiedAmountToPaymentRecord() choke point
// as the single-receipt verifyReceiptWithUndo above -- this is genuinely
// just that function looped over N rows with ONE combined undo entry at
// the end (same batching pattern as addBillingGroupMembersWithUndo), so
// Ctrl+Z reverses every member's balance change together, not one at a
// time. A row already verified before this call (e.g. handled separately
// via the single-receipt endpoint) is left untouched and excluded.
async function verifyReceiptGroupWithUndo(db, groupUploadId, body) {
  const rows = await db.prepare(`SELECT * FROM payment_receipt WHERE group_upload_id = ?`).all(groupUploadId);
  if (!rows.length) throw new Error('Group receipt not found.');
  const pending = rows.filter((r) => r.status !== 'verified');
  if (!pending.length) throw new Error('Every receipt in this group has already been verified.');

  const referenceNumber = body.referenceNumber !== undefined ? (body.referenceNumber || null) : pending[0].reference_number;
  const paidDate = body.paidDate !== undefined ? (body.paidDate || null) : pending[0].paid_date;
  if (!paidDate) throw new Error('Enter the date paid before verifying.');

  const amountById = {};
  for (const a of (Array.isArray(body.amounts) ? body.amounts : [])) {
    amountById[Number(a.receiptId)] = Number(a.amount);
  }
  for (const r of pending) {
    const amt = amountById[r.id] !== undefined ? amountById[r.id] : r.amount;
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new Error('Enter a valid amount for every member before verifying.');
    }
  }

  const steps = [];
  for (const r of pending) {
    const amount = amountById[r.id] !== undefined ? amountById[r.id] : r.amount;
    const previousReceipt = { ...r };
    const previousPayment = await db.prepare(`SELECT * FROM payment_record WHERE student_id = ? AND month = ?`)
      .get(r.student_id, r.month);

    await db.prepare(`
      UPDATE payment_receipt
      SET reference_number = ?, amount = ?, paid_date = ?, status = 'verified',
          review_note = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(referenceNumber, amount, paidDate, body.note || null, r.id);
    await addVerifiedAmountToPaymentRecord(db, r.student_id, r.month, amount, paidDate);

    const newPayment = await db.prepare(`SELECT * FROM payment_record WHERE student_id = ? AND month = ?`)
      .get(r.student_id, r.month);
    steps.push(
      previousPayment
        ? { type: 'restore_row', table: 'payment_record', row: previousPayment }
        : { type: 'delete_row', table: 'payment_record', id: newPayment.id }
    );
    steps.push({ type: 'restore_row', table: 'payment_receipt', row: previousReceipt });
  }

  const group = await db.prepare(`
    SELECT bg.* FROM billing_group bg JOIN student s ON s.billing_group_id = bg.id WHERE s.id = ?
  `).get(pending[0].student_id);
  await setLastUndo(db, {
    description: `verified a group receipt for ${group ? `"${group.name}"` : 'a billing group'} (${pending.length} student${pending.length === 1 ? '' : 's'})`,
    steps,
  });
  const finalRows = await db.prepare(`SELECT * FROM payment_receipt WHERE group_upload_id = ?`).all(groupUploadId);
  return finalRows.map(receiptRowForClient);
}

// Flag/reject: no payment_record change -- these are explicitly "not yet
// trustworthy," so nothing about the student's paid amount/balance should
// move. A note is required for both (Joanne's reason for not verifying,
// e.g. "amount differs from expected"), shown right on the queue and later
// on the student's own Payments row.
async function setReceiptDecisionWithUndo(db, receiptId, status, note) {
  if (status !== 'flagged' && status !== 'rejected') throw new Error('Invalid decision.');
  const receipt = await db.prepare(`SELECT * FROM payment_receipt WHERE id = ?`).get(receiptId);
  if (!receipt) throw new Error('Receipt not found.');
  if (receipt.status === 'verified') throw new Error('This receipt has already been verified.');
  if (!note || !note.trim()) throw new Error(`A note is required to ${status === 'flagged' ? 'flag' : 'reject'} a receipt.`);

  const previousReceipt = { ...receipt };
  await db.prepare(`UPDATE payment_receipt SET status = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(status, note.trim(), receiptId);
  const student = await db.prepare('SELECT * FROM student WHERE id = ?').get(receipt.student_id);
  await setLastUndo(db, {
    description: `${status === 'flagged' ? 'flagged' : 'rejected'} a receipt for ${studentLabel(student)}`,
    steps: [{ type: 'restore_row', table: 'payment_receipt', row: previousReceipt }],
  });
  return db.prepare(`SELECT * FROM payment_receipt WHERE id = ?`).get(receiptId);
}

// Group version of setReceiptDecisionWithUndo above -- same "no
// payment_record change, one note required" rules, applied to every
// not-yet-verified receipt sharing a group_upload_id, one combined undo
// entry for the whole batch.
async function setReceiptGroupDecisionWithUndo(db, groupUploadId, status, note) {
  if (status !== 'flagged' && status !== 'rejected') throw new Error('Invalid decision.');
  if (!note || !note.trim()) throw new Error(`A note is required to ${status === 'flagged' ? 'flag' : 'reject'} a receipt.`);
  const rows = await db.prepare(`SELECT * FROM payment_receipt WHERE group_upload_id = ?`).all(groupUploadId);
  if (!rows.length) throw new Error('Group receipt not found.');
  const pending = rows.filter((r) => r.status !== 'verified');
  if (!pending.length) throw new Error('Every receipt in this group has already been verified.');

  const steps = [];
  for (const r of pending) {
    const previousReceipt = { ...r };
    await db.prepare(`UPDATE payment_receipt SET status = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(status, note.trim(), r.id);
    steps.push({ type: 'restore_row', table: 'payment_receipt', row: previousReceipt });
  }
  const group = await db.prepare(`
    SELECT bg.* FROM billing_group bg JOIN student s ON s.billing_group_id = bg.id WHERE s.id = ?
  `).get(pending[0].student_id);
  await setLastUndo(db, {
    description: `${status === 'flagged' ? 'flagged' : 'rejected'} a group receipt for ${group ? `"${group.name}"` : 'a billing group'} (${pending.length} student${pending.length === 1 ? '' : 's'})`,
    steps,
  });
  const finalRows = await db.prepare(`SELECT * FROM payment_receipt WHERE group_upload_id = ?`).all(groupUploadId);
  return finalRows.map(receiptRowForClient);
}

// Deletes a receipt outright (e.g. dragged the wrong file). Deliberately
// leaves the file on disk even though the DB row goes away -- undo restores
// the row, and an orphaned image file is a harmless disk-space cost, while
// deleting a file that a subsequent undo can't bring back would not be.
// Only allowed before verification -- once verified it's part of the
// student's real payment history and should be corrected via a new
// receipt/manual entry, not silently removed.
async function deleteReceiptWithUndo(db, receiptId) {
  const receipt = await db.prepare(`SELECT * FROM payment_receipt WHERE id = ?`).get(receiptId);
  if (!receipt) throw new Error('Receipt not found.');
  if (receipt.status === 'verified') throw new Error('A verified receipt cannot be deleted -- correct it with a new entry instead.');
  await db.prepare(`DELETE FROM payment_receipt WHERE id = ?`).run(receiptId);
  const student = await db.prepare('SELECT * FROM student WHERE id = ?').get(receipt.student_id);
  await setLastUndo(db, {
    description: `deleted a receipt for ${studentLabel(student)}`,
    // 'insert_row', not 'restore_row' -- the receipt row was fully DELETEd
    // above, not edited in place. 'restore_row' runs an UPDATE (see
    // restoreRow()), which is for undoing an edit on a row that's still
    // there; against a row that no longer exists it matches nothing and
    // silently does nothing. 'insert_row' re-creates the row with its
    // original id, the same mechanism every other full-delete undo in
    // this app already uses (deleteStudentWithUndo, deleteEnrollmentWithUndo,
    // deleteBillingGroupWithUndo). Found and fixed during the Postgres
    // migration's own end-to-end testing (task #45) -- pre-existing, not
    // introduced by that migration; see README/roadmap for the repro.
    steps: [{ type: 'insert_row', table: 'payment_receipt', row: receipt }],
  });
}

// Aug 21 -- the new Absent tab's own list, deliberately separate from
// listPayments above (that stays keyed to *Active* enrollments only, the
// payment-lapse comeback signal; this is the "formally reported absent"
// signal -- see the roadmap note about not conflating the two). One row
// per student with roster_status = 'Absent', subjects/teacher pulled from
// whatever subject_enrollment rows they have (Absent, in every case
// today) the same "distinct list, not a filter key" way listPayments
// already does it for Active ones.
// Absence risk signals (Aug 21) -- gathers the raw numbers lib/risk.js's
// computeRiskFlags() needs, then hands off the actual threshold logic to
// that pure module. Kept as its own function (rather than inlined into
// listAbsentStudents below) so it can also be called for a single student
// from the edit panel's context without re-running the whole list query.
async function getRiskFlagsForStudent(db, studentId, asOfDate) {
  let visits = null;
  let visitsMonth = null;
  // Whether this student has ANY attendance history at all (any date) --
  // see lib/risk.js's computeRiskFlags for why this guard matters: the
  // attendance table this comes from has never actually been used in
  // practice, so a bare 0-visit count can't be trusted as a real signal
  // yet. Checked once per student regardless of asOfDate, since it's cheap
  // and used purely as a trust gate on the attendance flag below.
  const historyRow = await db.prepare(`
    SELECT COUNT(*) AS n
    FROM attendance a
    JOIN schedule_slot ss ON ss.id = a.schedule_slot_id
    JOIN subject_enrollment e ON e.id = ss.enrollment_id
    WHERE e.student_id = ?
  `).get(studentId);
  const hasAttendanceHistory = !!(historyRow && Number(historyRow.n) > 0);

  if (asOfDate) {
    visitsMonth = risk.monthBefore(asOfDate);
    const row = await db.prepare(`
      SELECT COUNT(*) AS n
      FROM attendance a
      JOIN schedule_slot ss ON ss.id = a.schedule_slot_id
      JOIN subject_enrollment e ON e.id = ss.enrollment_id
      WHERE e.student_id = ? AND a.arrived = 1 AND substr(a.date, 1, 7) = ?
    `).get(studentId, visitsMonth);
    visits = row ? Number(row.n) : 0;
  }

  const enrollmentDates = await db.prepare(
    `SELECT subject, date_enrolled FROM subject_enrollment WHERE student_id = ? AND date_enrolled IS NOT NULL`
  ).all(studentId);
  const firstKisBySubject = {};
  const kisRows = await db.prepare(
    `SELECT subject, MIN(cycle) AS first_kis_cycle FROM ashr_award WHERE student_id = ? AND result = 'KIS' GROUP BY subject`
  ).all(studentId);
  for (const r of kisRows) {
    firstKisBySubject[r.subject] = r.first_kis_cycle;
  }
  const enrollments = enrollmentDates.map((e) => ({
    subject: e.subject,
    dateEnrolled: e.date_enrolled,
    firstKisCycle: firstKisBySubject[e.subject] || null,
  }));

  return risk.computeRiskFlags({ visits, visitsMonth, hasAttendanceHistory, enrollments, asOfDate });
}

// Same-day follow-up (Aug 21, Nina: "absent for the month of AUGUST -- then
// have a dropdown to see historical absents"): defaults to the current
// active month, with an explicit 'all' escape hatch for "everyone
// currently absent, regardless of when." Deliberately the simple version
// of "history" she chose over a full absence-event log: this filters by
// the month of each student's (single, most-recent) absent_reported_date,
// so it's a real month-by-month view with no new schema -- but a
// reactivated-then-re-absent student's older absence months are no longer
// visible once their date is overwritten, and a student who came back for
// good simply drops out of every month's view, past ones included. That
// tradeoff was discussed and chosen explicitly; a full event log is the
// documented upgrade path if the gap ever matters in practice.
//
// Aug 25 follow-up (Nina: "i need to show historical data so the past 4
// months"): a SECOND, genuinely different notion of "month" than the one
// above. The `month` filter above answers "which snapshot am I looking
// at" (which month were they reported absent in). `months_absent`/
// `bucket` below answer "how long has it been, as of right now" -- the
// Phase 9/10 roadmap's 4-month re-registration window (1/2/3/4 months
// still within the no-fee window, 5+ outside it). Always computed against
// TODAY's active month regardless of which historical `month` was
// requested, same reference point listComebackCandidates already uses for
// the equivalent payment-lapse concept on the Payments tab -- these are
// two different absence concepts (formally reported absent vs. payment
// lapse) that were already kept deliberately separate (see the comeback-
// list comment below), so the bucket math is duplicated in spirit, not
// shared code, on purpose.
async function listAbsentStudents(db, query) {
  const clauses = [`s.roster_status = 'Absent'`];
  const params = [];
  const month = query.month || await getActiveMonth(db);
  if (month !== 'all') {
    clauses.push(`substr(s.absent_reported_date, 1, 7) = ?`);
    params.push(month);
  }
  if (query.q) {
    clauses.push(`(s.last_name ILIKE ? OR s.first_name ILIKE ? OR (s.first_name || ' ' || s.last_name) ILIKE ?)`);
    const like = `%${query.q}%`;
    params.push(like, like, like);
  }
  if (query.grade) {
    clauses.push(`s.grade = ?`);
    params.push(query.grade);
  }
  if (query.teacherId) {
    clauses.push(`EXISTS (SELECT 1 FROM subject_enrollment e2 WHERE e2.student_id = s.id AND e2.teacher_id = ?)`);
    params.push(Number(query.teacherId));
  }
  if (query.subject) {
    clauses.push(`EXISTS (SELECT 1 FROM subject_enrollment e2 WHERE e2.student_id = s.id AND e2.subject = ?)`);
    params.push(query.subject);
  }
  const rows = await db.prepare(`
    SELECT s.id AS student_id, s.last_name, s.first_name, s.grade,
           s.absent_reported_date, s.absent_source_note
    FROM student s
    WHERE ${clauses.join(' AND ')}
    ORDER BY s.absent_reported_date DESC, s.last_name, s.first_name
  `).all(...params);

  const enrollmentRows = await db.prepare(`
    SELECT e.student_id, e.subject, t.nickname, t.legal_name
    FROM subject_enrollment e LEFT JOIN teacher t ON t.id = e.teacher_id
  `).all();
  const byStudent = {};
  for (const r of enrollmentRows) {
    (byStudent[r.student_id] = byStudent[r.student_id] || []).push(r);
  }

  // "As of right now," not "as of the historical `month` being viewed" --
  // see the function comment above. `bucket` mirrors listComebackCandidates'
  // 1-4-months-vs-past-window split, just at per-month granularity instead
  // of one combined "within window" bucket, since that's what Nina asked
  // to see here: '0' (this month), '1'..'4', 'outside' (5+ months, past the
  // no-re-registration-fee window), or 'unknown' for the rare row with no
  // absent_reported_date on record (flagged rather than guessed at).
  const todaysActiveMonth = await getActiveMonth(db);

  let out = await Promise.all(rows.map(async (r) => {
    const list = byStudent[r.student_id] || [];
    const teacherLabel = [...new Set(list.map((t) => t.nickname || t.legal_name).filter(Boolean))].join(', ') || 'Unassigned';
    const subjects = [...new Set(list.map((t) => t.subject).filter(Boolean))].sort();
    const { flags, checked, worksheetsTracked, attendanceTracked } = await getRiskFlagsForStudent(db, r.student_id, r.absent_reported_date);
    let monthsAbsent = null;
    let bucket = 'unknown';
    if (r.absent_reported_date) {
      monthsAbsent = Math.max(0, payments.monthsBetween(r.absent_reported_date.slice(0, 7), todaysActiveMonth));
      bucket = monthsAbsent >= 5 ? 'outside' : String(monthsAbsent);
    }
    return {
      student_id: r.student_id, last_name: r.last_name, first_name: r.first_name, grade: r.grade,
      teacher_label: teacherLabel, subjects,
      absent_reported_date: r.absent_reported_date || null,
      absent_source_note: r.absent_source_note || null,
      risk_flags: flags,
      risk_checked: checked,
      worksheets_tracked: worksheetsTracked,
      attendance_tracked: attendanceTracked,
      months_absent: monthsAbsent,
      absent_bucket: bucket,
    };
  }));
  if (query.bucket) out = out.filter((r) => r.absent_bucket === query.bucket);
  return out;
}

// Months to offer in the Absent tab's history dropdown: every distinct
// month that appears in a currently-Absent student's absent_reported_date,
// plus the current active month even if nobody's been reported absent yet
// this month (same "always include the active month" rule listPaymentMonths
// uses) -- so the dropdown never looks broken/empty on a quiet month.
async function listAbsentMonths(db) {
  const rows = await db.prepare(
    `SELECT DISTINCT substr(absent_reported_date, 1, 7) AS m FROM student
     WHERE roster_status = 'Absent' AND absent_reported_date IS NOT NULL`
  ).all();
  const months = rows.map((r) => r.m).filter(Boolean);
  const active = await getActiveMonth(db);
  if (!months.includes(active)) months.push(active);
  return months.sort();
}

// Every student with at least one Active enrollment, bucketed by how long
// it's been since their last recorded payment (across all history, not just
// the active month): current (excluded entirely -- paid this month or
// later), 1-4 months (the "invite back, no re-registration fee" window),
// more than 4 months (past that window), or no payment ever on record
// (can't compute a window without a baseline -- flagged rather than
// guessed, listed separately so nothing silently vanishes).
//
// "Last paid" is now amount-aware (Aug 20 follow-up): a month only counts as
// paid if its computed status actually nets out to 'paid' or 'advance' (paid
// in full or more), not just because *a* paid_date was logged that month --
// a partially-paid month no longer masquerades as fully caught up here.
async function listComebackCandidates(db) {
  const activeMonth = await getActiveMonth(db);
  const activeStudents = await db.prepare(`
    SELECT DISTINCT s.id AS student_id, s.last_name, s.first_name, s.grade
    FROM student s
    JOIN subject_enrollment e ON e.student_id = s.id
    WHERE e.status = 'Active'
  `).all();
  const counts = await activeSubjectCounts(db, activeStudents.map((s) => s.student_id));
  const recordedMonthRows = await db.prepare(`SELECT DISTINCT student_id, month FROM payment_record`).all();
  const monthsByStudent = {};
  for (const r of recordedMonthRows) {
    (monthsByStudent[r.student_id] = monthsByStudent[r.student_id] || []).push(r.month);
  }
  const lastPaidByStudent = {};
  for (const s of activeStudents) {
    const months = (monthsByStudent[s.student_id] || []).slice().sort();
    let lastPaid = null;
    for (const m of months) {
      const summary = await computePaymentSummary(db, s.student_id, s.grade, counts[s.student_id], m);
      if (summary.status === 'paid' || summary.status === 'advance') lastPaid = m;
    }
    if (lastPaid) lastPaidByStudent[s.student_id] = lastPaid;
  }

  const comeback = [];
  const pastWindow = [];
  const noHistory = [];
  for (const s of activeStudents) {
    const lastPaid = lastPaidByStudent[s.student_id];
    if (!lastPaid) {
      noHistory.push({ ...s });
      continue;
    }
    const monthsAbsent = payments.monthsBetween(lastPaid, activeMonth);
    if (monthsAbsent <= 0) continue; // paid this month (or later) -- currently active, not absent
    const entry = { ...s, last_paid_month: lastPaid, months_absent: monthsAbsent };
    if (monthsAbsent <= 4) comeback.push(entry);
    else pastWindow.push(entry);
  }
  const byRecency = (a, b) => a.months_absent - b.months_absent || a.last_name.localeCompare(b.last_name);
  comeback.sort(byRecency);
  pastWindow.sort(byRecency);
  noHistory.sort((a, b) => a.last_name.localeCompare(b.last_name));
  return { activeMonth, comeback, pastWindow, noHistory };
}

// Upserts the (student, month) payment_record row plus the student's
// needs_attention flag together, from one form submission -- deliberately
// ONE endpoint covering both tables (not two separate calls), for the same
// reason the enrollment edit panel uses a combined /full save: two separate
// API calls for what's really one user-facing "Save" would mean only the
// second call's undo survives. The form always sends the complete current
// state of every field (pre-filled when the panel opens), so this is a real
// upsert, not a partial patch -- an omitted SOA/paid/absent date means "the
// user cleared this field", not "leave whatever was there."
async function upsertPaymentAndAttention(db, studentId, body) {
  const month = body.month || await getActiveMonth(db);
  let amountPaid = null;
  if (body.amountPaid !== undefined && body.amountPaid !== null && body.amountPaid !== '') {
    amountPaid = Number(body.amountPaid);
    if (!Number.isFinite(amountPaid) || amountPaid < 0) {
      throw new Error('amountPaid must be a non-negative number.');
    }
  }
  await db.prepare(`
    INSERT INTO payment_record
      (student_id, month, soa1_sent_date, soa2_sent_date, soa3_sent_date, soa4_sent_date,
       paid_date, marked_absent_date, amount_paid, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, month) DO UPDATE SET
      soa1_sent_date = excluded.soa1_sent_date,
      soa2_sent_date = excluded.soa2_sent_date,
      soa3_sent_date = excluded.soa3_sent_date,
      soa4_sent_date = excluded.soa4_sent_date,
      paid_date = excluded.paid_date,
      marked_absent_date = excluded.marked_absent_date,
      amount_paid = excluded.amount_paid,
      notes = excluded.notes,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    studentId, month,
    body.soa1SentDate || null, body.soa2SentDate || null, body.soa3SentDate || null, body.soa4SentDate || null,
    body.paidDate || null, body.markedAbsentDate || null, amountPaid, body.notes || null
  );
  await db.prepare(`UPDATE student SET needs_attention = ?, needs_attention_note = ? WHERE id = ?`)
    .run(body.needsAttention ? 1 : 0, body.needsAttentionNote || null, studentId);
  return db.prepare(`SELECT * FROM payment_record WHERE student_id = ? AND month = ?`).get(studentId, month);
}

async function upsertPaymentAndAttentionWithUndo(db, studentId, body) {
  const month = body.month || await getActiveMonth(db);
  const previousPayment = await db.prepare(`SELECT * FROM payment_record WHERE student_id = ? AND month = ?`).get(studentId, month);
  const previousStudent = await snapshotRow(db, 'student', studentId);
  const record = await upsertPaymentAndAttention(db, studentId, body);
  const steps = [];
  steps.push(previousPayment
    ? { type: 'restore_row', table: 'payment_record', row: previousPayment }
    : { type: 'delete_row', table: 'payment_record', id: record.id });
  if (previousStudent) steps.push({ type: 'restore_row', table: 'student', row: previousStudent });
  const label = previousStudent ? studentLabel(previousStudent) : 'a student';
  await setLastUndo(db, {
    description: `updated ${label}'s ${monthLabel(month)} payment record`,
    steps,
  });
  return record;
}

// Aug 21 -- the Absent tab's write path: report a currently-Active student
// absent, or bring an Absent student back to Active. Reactivating leaves
// absent_reported_date/absent_source_note as-is (history preserved, "never
// delete") rather than clearing them -- if the student is reported absent
// again later, that next report overwrites them with the new date/note,
// same one-shot-of-history tradeoff already accepted for the Aug 21 import.
//
// Same-day v2 (per Nina: "a student in both subjects can choose to stop
// math only so they will be absent in math -- i want to automatically mark
// them on the roster as well"): "report absent" is scoped to the specific
// subject enrollment the edit panel was opened for, not the whole student.
// It always flips that one enrollment to Absent on the Roster (the
// "automatically mark them on the roster" part), and ONLY promotes the
// whole student to roster_status='Absent' (onto the Absent tab) if that was
// their last remaining Active enrollment -- a student who drops Math but
// keeps Reading stays a normal Active student, visible as Absent-in-Math
// on the Roster like any other individually-dropped subject, same as the
// Dia/Disamburun cleanup earlier. Reactivating is unchanged: student-level
// only, since which subject(s) to re-enroll in is a separate manual
// decision (teacher/schedule/level all need setting up fresh either way).
//
// Same-day v3 (per Nina: "I don't want to tag anyone inactive... it's
// either absent or active"): subject_enrollment.status itself now only
// ever says 'Active' or 'Absent' -- the old three-value vocabulary
// (Active/Inactive/Dropped) is gone (see migrateSubjectStatusVocabulary in
// lib/db.js). This function's own logic didn't need to change at all: it
// was already written as "not Active" rather than checking for a specific
// off-value, so the rename was purely a schema/label change.
// Aug 25 follow-up (per Nina: "in the payments tab i want a way to tag
// students absent"): this used to only ever flip ONE subject_enrollment at
// a time, because the Roster's edit panel is always scoped to a single
// enrollment row. The Payments tab bills a student as one combined row
// though, so tagging someone absent from there can mean several of their
// active subjects at once (confirmed with Nina: default to all of them
// checked, let her uncheck the one that's still coming). `enrollmentId`
// became `enrollmentIds` (always an array now) to cover both -- the route
// below normalizes the Roster's existing single-id call into a one-element
// array, so this function's own logic is unchanged either way: flip
// whichever enrollments were passed, then the same "any Active left?"
// check promotes the whole student to roster_status='Absent' only once
// none remain, exactly as before.
async function setAbsentStatus(db, studentId, action, note, enrollmentIds) {
  if (action !== 'report' && action !== 'reactivate') {
    throw new Error(`Unknown action "${action}" -- expected "report" or "reactivate".`);
  }
  if (action === 'report') {
    if (enrollmentIds && enrollmentIds.length) {
      const placeholders = enrollmentIds.map(() => '?').join(',');
      await db.prepare(`UPDATE subject_enrollment SET status = 'Absent' WHERE id IN (${placeholders}) AND student_id = ?`)
        .run(...enrollmentIds, studentId);
    }
    const remainingActiveRow = await db.prepare(
      `SELECT COUNT(*) AS n FROM subject_enrollment WHERE student_id = ? AND status = 'Active'`
    ).get(studentId);
    const remainingActive = Number(remainingActiveRow.n);
    if (remainingActive === 0) {
      const today = todayInfo().date;
      await db.prepare(`UPDATE student SET roster_status = 'Absent', absent_reported_date = ?, absent_source_note = ? WHERE id = ?`)
        .run(today, note || null, studentId);
    }
  } else {
    await db.prepare(`UPDATE student SET roster_status = 'Active' WHERE id = ?`).run(studentId);
  }
}

async function setAbsentStatusWithUndo(db, studentId, action, note, enrollmentIds) {
  const previousStudent = await snapshotRow(db, 'student', studentId);
  if (!previousStudent) return false;
  const ids = (action === 'report' && enrollmentIds) ? enrollmentIds : [];
  const previousEnrollments = (await Promise.all(ids.map((id) => snapshotRow(db, 'subject_enrollment', id)))).filter(Boolean);
  await setAbsentStatus(db, studentId, action, note, ids);
  const steps = [{ type: 'restore_row', table: 'student', row: previousStudent }];
  for (const pe of previousEnrollments) steps.push({ type: 'restore_row', table: 'subject_enrollment', row: pe });
  const subjectsLabel = previousEnrollments.length
    ? ` (${previousEnrollments.map((e) => e.subject).join(', ')})`
    : '';
  await setLastUndo(db, {
    description: action === 'report'
      ? `reported ${studentLabel(previousStudent)}${subjectsLabel} absent`
      : `marked ${studentLabel(previousStudent)} active again`,
    steps,
  });
  return true;
}

// Same-day follow-up (Nina: "I want it to be editable by the teacher") --
// the retention note is no longer locked in at the moment of reporting.
// This updates ONLY absent_source_note, deliberately leaving roster_status
// and absent_reported_date untouched -- editing the note to add context
// later (e.g. "talked to mom, she says they'll come back in Sept") should
// never silently reset "absent since" to today, the way calling
// setAbsentStatus('report') again would. Works regardless of current
// roster_status, so the note can be updated before, during, or after a
// student is actually marked Absent.
async function updateAbsentNoteWithUndo(db, studentId, note) {
  const previousStudent = await snapshotRow(db, 'student', studentId);
  if (!previousStudent) return false;
  await db.prepare(`UPDATE student SET absent_source_note = ? WHERE id = ?`).run(note || null, studentId);
  await setLastUndo(db, {
    description: `updated ${studentLabel(previousStudent)}'s retention note`,
    steps: [{ type: 'restore_row', table: 'student', row: previousStudent }],
  });
  return true;
}

// Bulk SOA/paid marking (Aug 19) -- Nina asked for a way to mark a whole
// batch of students at once, matching how SOAs actually go out in practice
// (one message to a whole group chat, not one text per parent). Only ever
// touches ONE column across all selected students -- deliberately narrow,
// not a general bulk-edit tool -- so there's no ambiguity about what "bulk"
// means here. Reuses the same upsert-by-column approach as the single-
// student payments endpoint, and the same generic step-based undo
// mechanism: one combined last_undo entry covers every affected row, so a
// single Undo click reverses the whole batch, not just the last row in it.
const BULK_PAYMENT_ACTIONS = {
  soa1: { column: 'soa1_sent_date', label: 'SOA1 sent' },
  soa2: { column: 'soa2_sent_date', label: 'SOA2 sent' },
  soa3: { column: 'soa3_sent_date', label: 'SOA3 sent' },
  soa4: { column: 'soa4_sent_date', label: 'SOA4 sent' },
  paid: { column: 'paid_date', label: 'paid' },
};

async function bulkUpdatePayments(db, body) {
  const action = BULK_PAYMENT_ACTIONS[body.action];
  if (!action) throw new Error(`Unknown bulk payment action: "${body.action}".`);
  const month = body.month || await getActiveMonth(db);
  const date = body.date || todayInfo().date;
  if (!date) throw new Error('date is required.');
  const studentIds = Array.isArray(body.studentIds)
    ? [...new Set(body.studentIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  if (!studentIds.length) throw new Error('No students selected.');

  const selectStmt = db.prepare(`SELECT * FROM payment_record WHERE student_id = ? AND month = ?`);
  const steps = [];
  let updated = 0;
  const skipped = [];

  if (body.action === 'paid') {
    // "Mark paid" now means "bring this student's own remaining balance for
    // the month to zero" -- computed individually per student (rate x their
    // own active-subject count, plus any previous balance/advance credit),
    // never one shared literal number, since a bulk-selected group can mix
    // grades and subject loads freely. Students whose tuition can't be
    // computed (grade missing/unrecognized) are skipped rather than marked
    // paid against an unknown amount -- flagged back to the caller so the
    // UI can surface exactly who needs a manual look.
    const counts = await activeSubjectCounts(db, studentIds);
    const gradeStmt = db.prepare(`SELECT grade FROM student WHERE id = ?`);
    const upsertPaid = db.prepare(`
      INSERT INTO payment_record (student_id, month, paid_date, amount_paid, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(student_id, month) DO UPDATE SET
        paid_date = excluded.paid_date,
        amount_paid = excluded.amount_paid,
        updated_at = CURRENT_TIMESTAMP
    `);
    for (const studentId of studentIds) {
      const studentRow = await gradeStmt.get(studentId);
      const summary = await computePaymentSummary(db, studentId, studentRow ? studentRow.grade : null, counts[studentId] || 0, month);
      if (summary.tuitionFlagged) {
        skipped.push(studentId);
        continue;
      }
      const previous = await selectStmt.get(studentId, month);
      await upsertPaid.run(studentId, month, date, summary.netDueAfterAdvance);
      const record = await selectStmt.get(studentId, month);
      steps.push(previous
        ? { type: 'restore_row', table: 'payment_record', row: previous }
        : { type: 'delete_row', table: 'payment_record', id: record.id });
      updated += 1;
    }
  } else {
    const upsertStmt = db.prepare(`
      INSERT INTO payment_record (student_id, month, ${action.column}, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(student_id, month) DO UPDATE SET
        ${action.column} = excluded.${action.column},
        updated_at = CURRENT_TIMESTAMP
    `);
    for (const studentId of studentIds) {
      const previous = await selectStmt.get(studentId, month);
      await upsertStmt.run(studentId, month, date);
      const record = await selectStmt.get(studentId, month);
      steps.push(previous
        ? { type: 'restore_row', table: 'payment_record', row: previous }
        : { type: 'delete_row', table: 'payment_record', id: record.id });
      updated += 1;
    }
  }

  if (!updated) throw new Error('No students were updated (all selected students were skipped).');

  await setLastUndo(db, {
    description: `bulk-marked ${action.label} for ${updated} student${updated === 1 ? '' : 's'} (${monthLabel(month)})`,
    steps,
  });

  return { updated, month, action: body.action, date, skipped };
}

async function createStudent(db, body) {
  const stmt = db.prepare(
    `INSERT INTO student (last_name, first_name, grade, birthday, guardian_name, guardian_relationship, contact_number)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id`
  );
  const info = await stmt.run(
    body.lastName, body.firstName, body.grade || null, body.birthday || null,
    body.guardianName || null, body.guardianRelationship || null, body.contactNumber || null
  );
  const studentId = Number(info.lastInsertRowid);
  if (body.enrollment) {
    await createEnrollment(db, studentId, body.enrollment);
  }
  return studentId;
}

function scheduleReviewFlag(slots) {
  if (!slots || !slots.length) return 0; // no schedule entered yet isn't itself a data problem
  return slots.some((s) => !s.day || !s.time) ? 1 : 0;
}

async function createEnrollment(db, studentId, e) {
  const slots = e.scheduleSlots || [];
  const stmt = db.prepare(`
    INSERT INTO subject_enrollment
      (student_id, subject, teacher_id, current_level, current_page,
       goal_level, goal_page, goal_award,
       schedule_days, schedule_time, submission_mode, date_enrolled, status,
       needs_teacher_review, needs_schedule_review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `);
  const info = await stmt.run(
    studentId, e.subject, e.teacherId || null, e.currentLevel || null, e.currentPage || null,
    e.goalLevel || null, e.goalPage || null, e.goalAward || null,
    e.scheduleDays || null, e.scheduleTime || null, e.submissionMode || null,
    e.dateEnrolled || null, e.status || 'Active', e.teacherId ? 0 : 1,
    scheduleReviewFlag(slots)
  );
  const id = Number(info.lastInsertRowid);
  await replaceSlots(db, id, slots);
  return id;
}

// billingGroupId rides along in this same combined student save (Aug 25
// follow-up) rather than needing its own "Save" click -- picking a value
// in a <select> is already one deliberate, complete action (unlike free
// text, there's no "half-typed" state to worry about saving prematurely),
// so it fits the panel's normal Save-button flow instead of the retention
// note's separate-button pattern. Full undo coverage comes for free: the
// caller already snapshots/restores the whole student row either way.
async function updateStudent(db, id, body) {
  await db.prepare(`
    UPDATE student SET last_name = ?, first_name = ?, grade = ?, birthday = ?,
      guardian_name = ?, guardian_relationship = ?, contact_number = ?, billing_group_id = ?
    WHERE id = ?
  `).run(
    body.lastName, body.firstName, body.grade || null, body.birthday || null,
    body.guardianName || null, body.guardianRelationship || null, body.contactNumber || null,
    body.billingGroupId || null,
    id
  );
}

async function updateEnrollment(db, id, body) {
  const needsReview = body.teacherId ? 0 : 1;
  const slots = body.scheduleSlots || [];
  await db.prepare(`
    UPDATE subject_enrollment SET
      subject = ?, teacher_id = ?, current_level = ?, current_page = ?,
      goal_level = ?, goal_page = ?, goal_award = ?,
      schedule_days = ?, schedule_time = ?, submission_mode = ?, date_enrolled = ?,
      status = ?, needs_teacher_review = ?, needs_schedule_review = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    body.subject, body.teacherId || null, body.currentLevel || null, body.currentPage || null,
    body.goalLevel || null, body.goalPage || null, body.goalAward || null,
    body.scheduleDays || null, body.scheduleTime || null, body.submissionMode || null,
    body.dateEnrolled || null, body.status || 'Active', needsReview,
    scheduleReviewFlag(slots), id
  );
  await replaceSlots(db, id, slots);
  // If a real current level was just set through this edit, clear any stale
  // needs_level_review flag right away rather than waiting for the next
  // server restart to recompute it (see lib/db.js's startup recompute for
  // the flag's normal source of truth).
  if (body.currentLevel) {
    await db.prepare(`UPDATE subject_enrollment SET needs_level_review = 0 WHERE id = ?`).run(id);
  }
}

// ---- undo-wrapped mutation entry points (Aug 19) -------------------------
// These wrap the plain create/update functions above with a snapshot-then-
// mutate step, so the route handlers below just call one of these instead
// of manually capturing state. Kept separate from the plain functions
// (rather than baking undo into createStudent/updateEnrollment/etc.
// directly) so those stay simple and testable on their own, and so it's
// obvious at a glance which mutations are undo-covered.

// Add-student is one call from the client (student + nested enrollment
// created together), so undoing it just means deleting both new rows --
// there's no "previous state" to restore since nothing existed before.
async function createStudentWithUndo(db, body) {
  const studentId = await createStudent(db, body);
  const enrollment = await db.prepare(
    `SELECT id FROM subject_enrollment WHERE student_id = ? ORDER BY id DESC LIMIT 1`
  ).get(studentId);
  const steps = [];
  if (enrollment) {
    steps.push({ type: 'delete_by', table: 'schedule_slot', column: 'enrollment_id', value: enrollment.id });
    steps.push({ type: 'delete_row', table: 'subject_enrollment', id: enrollment.id });
  }
  steps.push({ type: 'delete_row', table: 'student', id: studentId });
  const subject = body.enrollment ? body.enrollment.subject : null;
  await setLastUndo(db, {
    description: `added ${body.lastName}, ${body.firstName}${subject ? ` (${subject})` : ''}`,
    steps,
  });
  return studentId;
}

// The edit panel saves student info and enrollment info together as one
// user-facing action (even though they're two separate tables), so this
// captures both -- plus the enrollment's schedule slots, since those get
// fully wiped and reinserted by replaceSlots() on every enrollment save,
// not just updated in place.
async function updateStudentAndEnrollmentWithUndo(db, studentId, enrollmentId, studentBody, enrollmentBody) {
  const previousStudent = await snapshotRow(db, 'student', studentId);
  const previousEnrollment = await snapshotRow(db, 'subject_enrollment', enrollmentId);
  const previousSlots = await snapshotSlots(db, enrollmentId);
  await updateStudent(db, studentId, studentBody);
  await updateEnrollment(db, enrollmentId, enrollmentBody);
  if (previousStudent && previousEnrollment) {
    await setLastUndo(db, {
      description: `edited ${studentLabel(previousStudent)}'s ${previousEnrollment.subject} enrollment`,
      steps: [
        { type: 'restore_row', table: 'student', row: previousStudent },
        { type: 'restore_row', table: 'subject_enrollment', row: previousEnrollment },
        { type: 'restore_slots', enrollmentId, slots: previousSlots },
      ],
    });
  }
}

async function updateMonthlyProgressWithUndo(db, id, body) {
  const previous = await snapshotRow(db, 'monthly_progress', id);
  await updateMonthlyProgress(db, id, body);
  if (previous) {
    const student = await db.prepare(`SELECT last_name, first_name FROM student WHERE id = ?`).get(previous.student_id);
    await setLastUndo(db, {
      description: `corrected ${student ? studentLabel(student) : 'a student'}'s ${previous.subject || ''} ${previous.month} record`.replace(/\s+/g, ' ').trim(),
      steps: [{ type: 'restore_row', table: 'monthly_progress', row: previous }],
    });
  }
}

async function updateAshrAwardWithUndo(db, id, body) {
  const previous = await snapshotRow(db, 'ashr_award', id);
  await updateAshrAward(db, id, body);
  if (previous) {
    const student = await db.prepare(`SELECT last_name, first_name FROM student WHERE id = ?`).get(previous.student_id);
    await setLastUndo(db, {
      description: `corrected ${student ? studentLabel(student) : 'a student'}'s ${previous.subject} ${previous.cycle} ASHR record`,
      steps: [{ type: 'restore_row', table: 'ashr_award', row: previous }],
    });
  }
}

// Permanently removes one subject enrollment (e.g. a mistaken duplicate,
// same shape as the Dia/Disamburun rows cleaned up by hand a few minutes
// earlier -- this is the general-purpose version of that one-off fix, per
// Nina's "can we add a delete function" request). Only subject_enrollment's
// own child rows are affected: schedule_slot (keyed by enrollment_id) and,
// transitively, any attendance rows keyed to those slots.
// monthly_progress/ashr_award/payment_record are keyed by student_id, not
// enrollment_id, so they're untouched -- the student's other subject (if
// any) and payment history stay intact. Covered by the same one-level Undo
// as every other edit here.
async function deleteEnrollmentWithUndo(db, enrollmentId) {
  const enrollmentRow = await snapshotRow(db, 'subject_enrollment', enrollmentId);
  if (!enrollmentRow) return false;
  const student = await db.prepare(`SELECT * FROM student WHERE id = ?`).get(enrollmentRow.student_id);
  const slots = await db.prepare(`SELECT * FROM schedule_slot WHERE enrollment_id = ?`).all(enrollmentId);
  const slotIds = slots.map((s) => s.id);
  const attendanceRows = slotIds.length
    ? await db.prepare(`SELECT * FROM attendance WHERE schedule_slot_id IN (${slotIds.map(() => '?').join(',')})`).all(...slotIds)
    : [];

  if (slotIds.length) {
    await db.prepare(`DELETE FROM attendance WHERE schedule_slot_id IN (${slotIds.map(() => '?').join(',')})`).run(...slotIds);
  }
  await db.prepare(`DELETE FROM schedule_slot WHERE enrollment_id = ?`).run(enrollmentId);
  await db.prepare(`DELETE FROM subject_enrollment WHERE id = ?`).run(enrollmentId);

  await setLastUndo(db, {
    description: `deleted ${student ? studentLabel(student) : 'a student'}'s ${enrollmentRow.subject} enrollment`,
    steps: [
      { type: 'insert_row', table: 'subject_enrollment', row: enrollmentRow },
      ...slots.map((s) => ({ type: 'insert_row', table: 'schedule_slot', row: s })),
      ...attendanceRows.map((a) => ({ type: 'insert_row', table: 'attendance', row: a })),
    ],
  });
  return true;
}

// Permanently removes a student and everything tied to them -- every
// subject enrollment (+ their schedule/attendance rows), monthly_progress,
// ashr_award, and payment_record. For a kid who's fully withdrawn from the
// center, not just dropped one subject (see deleteEnrollmentWithUndo above
// for that narrower case). Also covered by the one-level Undo.
async function deleteStudentWithUndo(db, studentId) {
  const studentRow = await snapshotRow(db, 'student', studentId);
  if (!studentRow) return false;

  const enrollments = await db.prepare(`SELECT * FROM subject_enrollment WHERE student_id = ?`).all(studentId);
  const enrollmentIds = enrollments.map((e) => e.id);
  const slots = enrollmentIds.length
    ? await db.prepare(`SELECT * FROM schedule_slot WHERE enrollment_id IN (${enrollmentIds.map(() => '?').join(',')})`).all(...enrollmentIds)
    : [];
  const slotIds = slots.map((s) => s.id);
  const attendanceRows = slotIds.length
    ? await db.prepare(`SELECT * FROM attendance WHERE schedule_slot_id IN (${slotIds.map(() => '?').join(',')})`).all(...slotIds)
    : [];
  const progress = await db.prepare(`SELECT * FROM monthly_progress WHERE student_id = ?`).all(studentId);
  const awards = await db.prepare(`SELECT * FROM ashr_award WHERE student_id = ?`).all(studentId);
  const paymentRows = await db.prepare(`SELECT * FROM payment_record WHERE student_id = ?`).all(studentId);

  if (slotIds.length) {
    await db.prepare(`DELETE FROM attendance WHERE schedule_slot_id IN (${slotIds.map(() => '?').join(',')})`).run(...slotIds);
  }
  if (enrollmentIds.length) {
    await db.prepare(`DELETE FROM schedule_slot WHERE enrollment_id IN (${enrollmentIds.map(() => '?').join(',')})`).run(...enrollmentIds);
  }
  await db.prepare(`DELETE FROM subject_enrollment WHERE student_id = ?`).run(studentId);
  await db.prepare(`DELETE FROM monthly_progress WHERE student_id = ?`).run(studentId);
  await db.prepare(`DELETE FROM ashr_award WHERE student_id = ?`).run(studentId);
  await db.prepare(`DELETE FROM payment_record WHERE student_id = ?`).run(studentId);
  await db.prepare(`DELETE FROM student WHERE id = ?`).run(studentId);

  await setLastUndo(db, {
    description: `deleted student ${studentLabel(studentRow)}`,
    steps: [
      { type: 'insert_row', table: 'student', row: studentRow },
      ...enrollments.map((e) => ({ type: 'insert_row', table: 'subject_enrollment', row: e })),
      ...slots.map((s) => ({ type: 'insert_row', table: 'schedule_slot', row: s })),
      ...attendanceRows.map((a) => ({ type: 'insert_row', table: 'attendance', row: a })),
      ...progress.map((p) => ({ type: 'insert_row', table: 'monthly_progress', row: p })),
      ...awards.map((a) => ({ type: 'insert_row', table: 'ashr_award', row: a })),
      ...paymentRows.map((p) => ({ type: 'insert_row', table: 'payment_record', row: p })),
    ],
  });
  return true;
}

// ---- Billing Groups (Aug 25 follow-up, roadmap Phase 4) ------------------
// Students who share one combined SOA and one billing relationship/payer,
// per kumon-master-platform-specification.md Part 8 -- doesn't merge
// students academically, doesn't touch teacher/schedule/level/tuition rate
// (rule #28). Current-state only for this first build: no month-by-month
// history of past group membership yet (see the schema comment in
// lib/db.js for why that's a deliberately separate, later item). SOA
// generation itself (Phase 5) is also out of scope here -- this is just
// the group entity and who's currently in which one.

// Each group comes back with its member list so the tab can render
// everything in one request. Ungrouped students aren't listed here at all
// -- "no group" isn't itself a group -- they're reached instead through
// searchUngroupedStudents below, the picker used to add someone to a group.
// Aug 25, same-day follow-up: each member row now also carries which
// subjects they're Active in and what their tuition would be per month --
// Nina asked to see both right on the Billing Groups card. Reuses the exact
// same source (Active subject_enrollment rows) and rate table
// (lib/tuition.js, the same one the Payments tab's "Tuition" column uses)
// rather than a second implementation, so the two tabs can never disagree
// on what a student owes. Deliberately just the plain monthly amount due --
// not folded into computePaymentSummary's fuller due/paid/balance
// reconciliation, since a billing group card isn't the place to also show
// payment status (that stays the Payments tab's job).
async function listBillingGroups(db) {
  const groups = await db.prepare(`SELECT * FROM billing_group ORDER BY name`).all();
  const members = await db.prepare(`
    SELECT id AS student_id, last_name, first_name, grade, billing_group_id
    FROM student WHERE billing_group_id IS NOT NULL
    ORDER BY last_name, first_name
  `).all();
  const subjectRows = await db.prepare(`
    SELECT student_id, subject FROM subject_enrollment WHERE status = 'Active'
  `).all();
  const subjectsByStudent = {};
  for (const r of subjectRows) {
    (subjectsByStudent[r.student_id] = subjectsByStudent[r.student_id] || []).push(r.subject);
  }
  const byGroup = {};
  for (const m of members) {
    const subjects = [...new Set(subjectsByStudent[m.student_id] || [])].sort();
    const tuitionInfo = tuition.computeTuitionDue(ashr.normalizeGrade(m.grade), subjects.length);
    (byGroup[m.billing_group_id] = byGroup[m.billing_group_id] || []).push({
      student_id: m.student_id, last_name: m.last_name, first_name: m.first_name, grade: m.grade,
      subjects, amount_due: tuitionInfo.amountDue, tuition_flagged: tuitionInfo.flagged,
    });
  }
  // Group total (Aug 25, same-day follow-up: Nina asked for a combined
  // monthly amount per group) -- sum of the known member amounts only.
  // A member whose tuition couldn't be computed (unrecognized grade) is
  // counted separately as "flagged" rather than silently treated as ₱0,
  // same "flag rather than guess" rule the individual amount already
  // follows -- the UI surfaces the flagged count alongside the total so
  // it's clear the total may be incomplete rather than looking final.
  return groups.map((g) => {
    const members = byGroup[g.id] || [];
    const known = members.filter((m) => m.amount_due !== null);
    const flaggedCount = members.length - known.length;
    return {
      id: g.id, name: g.name, notes: g.notes,
      members,
      total_amount_due: known.reduce((sum, m) => sum + m.amount_due, 0),
      total_flagged_count: flaggedCount,
    };
  });
}

// Combined Family SOA (Phase 5, roadmap item 11/12) -- for one billing
// group + one month, each member's real payment picture (tuition due,
// previous balance, amount paid, remaining balance) via the exact same
// computePaymentSummary() the Payments tab itself uses, never a second
// calculation path -- so a group's SOA and each member's own Payments row
// can never disagree. This is a READ-ONLY rollup: it does not record a
// payment or touch payment_record at all, deliberately staying on the
// individual-student-tuition -> billing-group-view side of the "never let
// a billing group invent/allocate tuition" architecture rule (Master Spec
// Part 8 item 24-29, Part 9 item 41-42's still-open Group Payment
// Allocation question). Per Nina's Aug 25 scoping answers: no SOA
// sender/responsible-teacher field yet (no role system to enforce it), and
// no generated/sent status is stored -- this always computes fresh from
// current data.
//
// Same known limitation as every other month-aware view in this app
// (Payments tab, computePaymentSummary itself): there is no per-month
// snapshot of grade/subjects yet (Phase 14), so a past month's tuition
// figures reflect each student's CURRENT grade/active subjects, not
// necessarily what was true that month. Surfaced in the API response as
// `historicalCaveat` so the UI can show it plainly rather than hide it.
//
// Aug 27 follow-up: the standalone "SOA" tab that used to call this
// directly via GET /api/billing-groups/:id/soa was deleted per Nina (the
// Payments tab's per-row "⬇ SOA" button covers the same need in fewer
// clicks), and that HTTP route was removed along with it. This function
// itself stays -- getStudentSoa() below still delegates to it for the
// group case, so it's reached internally, just no longer directly by URL.
async function getBillingGroupSoa(db, groupId, month) {
  const group = await db.prepare(`SELECT * FROM billing_group WHERE id = ?`).get(groupId);
  if (!group) return null;
  const activeMonthNow = await getActiveMonth(db);
  const resolvedMonth = month || activeMonthNow;
  const isCurrentMonth = resolvedMonth === activeMonthNow;

  const memberRows = await db.prepare(`
    SELECT id AS student_id, last_name, first_name, grade
    FROM student WHERE billing_group_id = ?
    ORDER BY last_name, first_name
  `).all(groupId);

  const subjectRows = await db.prepare(`
    SELECT student_id, subject FROM subject_enrollment WHERE status = 'Active'
  `).all();
  const subjectsByStudent = {};
  for (const r of subjectRows) {
    (subjectsByStudent[r.student_id] = subjectsByStudent[r.student_id] || []).push(r.subject);
  }
  const counts = await activeSubjectCounts(db, memberRows.map((m) => m.student_id));

  const members = await Promise.all(memberRows.map(async (m) => {
    const subjects = [...new Set(subjectsByStudent[m.student_id] || [])].sort();
    const summary = await computePaymentSummary(db, m.student_id, m.grade, counts[m.student_id] || 0, resolvedMonth);
    return {
      student_id: m.student_id, last_name: m.last_name, first_name: m.first_name,
      subjects, ...summary,
    };
  }));

  const known = members.filter((m) => !m.tuitionFlagged);
  const totals = {
    amountDue: round2(known.reduce((sum, m) => sum + (m.amountDue || 0), 0)),
    previousBalance: round2(known.reduce((sum, m) => sum + m.previousBalance, 0)),
    amountPaid: round2(known.reduce((sum, m) => sum + m.amountPaid, 0)),
    remainingBalance: round2(known.reduce((sum, m) => sum + m.remainingBalance, 0)),
    flaggedCount: members.length - known.length,
  };

  return {
    group: { id: group.id, name: group.name, notes: group.notes },
    month: resolvedMonth, monthLabel: monthLabel(resolvedMonth),
    isCurrentMonth,
    members, totals,
    historicalCaveat: !isCurrentMonth,
  };
}

// One-click SOA from the Payments tab (Aug 25, same-day follow-up to the
// SOA tab above) -- per Nina: beside each Payments row, generate the
// group's combined SOA if that student belongs to a billing group,
// otherwise an individual SOA for just them. Deliberately just a thin
// dispatcher in front of getBillingGroupSoa() for the group case, so the
// "group" and "solo" documents can never compute tuition differently --
// the solo case below reuses the exact same computePaymentSummary() call
// and is shaped identically (a `group` of one member) so the frontend's
// existing render/PNG-export code needs no branching to handle either.
async function getStudentSoa(db, studentId, month) {
  const student = await db.prepare(`SELECT * FROM student WHERE id = ?`).get(studentId);
  if (!student) return null;

  if (student.billing_group_id) {
    const groupSoa = await getBillingGroupSoa(db, student.billing_group_id, month);
    return { ...groupSoa, scope: 'group' };
  }

  const activeMonthNow = await getActiveMonth(db);
  const resolvedMonth = month || activeMonthNow;
  const isCurrentMonth = resolvedMonth === activeMonthNow;
  const subjectRows = await db.prepare(`
    SELECT subject FROM subject_enrollment WHERE student_id = ? AND status = 'Active'
  `).all(studentId);
  const subjects = [...new Set(subjectRows.map((r) => r.subject))].sort();
  const activeCount = subjects.length;
  const summary = await computePaymentSummary(db, studentId, student.grade, activeCount, resolvedMonth);
  const member = {
    student_id: student.id, last_name: student.last_name, first_name: student.first_name,
    subjects, ...summary,
  };
  const totals = member.tuitionFlagged
    ? { amountDue: 0, previousBalance: 0, amountPaid: round2(member.amountPaid), remainingBalance: round2(member.remainingBalance), flaggedCount: 1 }
    : { amountDue: round2(member.amountDue), previousBalance: round2(member.previousBalance), amountPaid: round2(member.amountPaid), remainingBalance: round2(member.remainingBalance), flaggedCount: 0 };

  return {
    group: { id: null, name: `${student.last_name}, ${student.first_name}` },
    month: resolvedMonth, monthLabel: monthLabel(resolvedMonth),
    isCurrentMonth,
    members: [member], totals,
    historicalCaveat: !isCurrentMonth,
    scope: 'individual',
  };
}

// Backs the "add a member" picker on the Billing Groups tab -- scoped to
// students who (a) aren't already in a group (one current group per
// student, rule #24) and (b) are currently Active, since a group only
// matters for someone actively being billed. Requires a real search term
// rather than dumping ~1,000 students on an empty query -- this is a
// typeahead picker, not a table.
async function searchUngroupedStudents(db, q) {
  const trimmed = (q || '').trim();
  if (!trimmed) return [];
  const like = `%${trimmed}%`;
  return db.prepare(`
    SELECT id AS student_id, last_name, first_name, grade
    FROM student
    WHERE billing_group_id IS NULL AND roster_status = 'Active'
      AND (last_name ILIKE ? OR first_name ILIKE ? OR (first_name || ' ' || last_name) ILIKE ?)
    ORDER BY last_name, first_name
    LIMIT 25
  `).all(like, like, like);
}

async function createBillingGroup(db, name, notes) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Billing group name is required.');
  const info = await db.prepare(`INSERT INTO billing_group (name, notes) VALUES (?, ?) RETURNING id`).run(trimmed, notes || null);
  return Number(info.lastInsertRowid);
}

async function createBillingGroupWithUndo(db, name, notes) {
  const id = await createBillingGroup(db, name, notes);
  await setLastUndo(db, {
    description: `created billing group "${(name || '').trim()}"`,
    steps: [{ type: 'delete_row', table: 'billing_group', id }],
  });
  return id;
}

async function updateBillingGroup(db, id, name, notes) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Billing group name is required.');
  await db.prepare(`UPDATE billing_group SET name = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(trimmed, notes || null, id);
}

async function updateBillingGroupWithUndo(db, id, name, notes) {
  const previous = await snapshotRow(db, 'billing_group', id);
  if (!previous) return false;
  await updateBillingGroup(db, id, name, notes);
  await setLastUndo(db, {
    description: `edited billing group "${previous.name}"`,
    steps: [{ type: 'restore_row', table: 'billing_group', row: previous }],
  });
  return true;
}

// Deleting a group unassigns its members rather than leaving them orphaned
// or blocking the delete outright -- same "never silently destroy real
// data, but don't get in the way either" spirit as the rest of this app.
// Each member's billing_group_id is cleared to NULL (back to "billed
// individually") before the group row itself is removed, since node:sqlite
// enforces the billing_group_id -> billing_group(id) foreign key by
// default and deleting a still-referenced row would fail -- same class of
// issue migrateSubjectStatusVocabulary's table-rebuild hit earlier (see
// that function's comment in lib/db.js), just avoided here by ordering the
// two statements correctly instead of needing a PRAGMA toggle. Undo
// restores the group FIRST, then each member's full row, so a member's
// restored billing_group_id always has a group to point at by the time
// its own step runs -- same parent-then-children step ordering
// deleteStudentWithUndo above already uses.
async function deleteBillingGroupWithUndo(db, groupId) {
  const groupRow = await snapshotRow(db, 'billing_group', groupId);
  if (!groupRow) return false;
  const members = await db.prepare(`SELECT * FROM student WHERE billing_group_id = ?`).all(groupId);
  await db.prepare(`UPDATE student SET billing_group_id = NULL WHERE billing_group_id = ?`).run(groupId);
  await db.prepare(`DELETE FROM billing_group WHERE id = ?`).run(groupId);
  await setLastUndo(db, {
    description: `deleted billing group "${groupRow.name}"${members.length ? ` (${members.length} student${members.length === 1 ? '' : 's'} unassigned)` : ''}`,
    steps: [
      { type: 'insert_row', table: 'billing_group', row: groupRow },
      ...members.map((m) => ({ type: 'restore_row', table: 'student', row: m })),
    ],
  });
  return true;
}

// Assigns (or clears, if groupId is null/omitted) one student's billing
// group. Used from both the Billing Groups tab's own add/remove-member
// actions and the shared edit panel's Billing Group field (Roster/
// Payments), so every surface that changes this shares one undo-covered
// path instead of drifting apart.
async function setStudentBillingGroupWithUndo(db, studentId, groupId) {
  const previous = await snapshotRow(db, 'student', studentId);
  if (!previous) return false;
  await db.prepare(`UPDATE student SET billing_group_id = ? WHERE id = ?`).run(groupId || null, studentId);
  const groupRow = groupId ? await db.prepare(`SELECT name FROM billing_group WHERE id = ?`).get(groupId) : null;
  await setLastUndo(db, {
    description: groupRow
      ? `added ${studentLabel(previous)} to billing group "${groupRow.name}"`
      : `removed ${studentLabel(previous)} from their billing group`,
    steps: [{ type: 'restore_row', table: 'student', row: previous }],
  });
  return true;
}

// Multi-add (Aug 25, same-day follow-up) -- Nina asked for the add-member
// dropdown to support picking several students before committing, so
// staff don't have to reopen/re-search it one student at a time. One
// combined undo entry covers the whole batch, same pattern as
// bulkUpdatePayments above and deleteBillingGroupWithUndo's multi-step
// undo -- a single Undo click reverses every student added in this call,
// not just the last one. Silently skips any id that no longer resolves to
// a real student (e.g. a stale id from a slow client) rather than failing
// the whole batch over one bad row.
async function addBillingGroupMembersWithUndo(db, groupId, studentIds) {
  const group = await db.prepare(`SELECT * FROM billing_group WHERE id = ?`).get(groupId);
  if (!group) return null;
  const ids = Array.isArray(studentIds)
    ? [...new Set(studentIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  if (!ids.length) throw new Error('No students selected.');
  const selectStudent = db.prepare(`SELECT * FROM student WHERE id = ?`);
  const updateStmt = db.prepare(`UPDATE student SET billing_group_id = ? WHERE id = ?`);
  const steps = [];
  let added = 0;
  for (const studentId of ids) {
    const before = await selectStudent.get(studentId);
    if (!before) continue;
    await updateStmt.run(groupId, studentId);
    steps.push({ type: 'restore_row', table: 'student', row: before });
    added += 1;
  }
  if (!added) throw new Error('No students were added.');
  await setLastUndo(db, {
    description: `added ${added} student${added === 1 ? '' : 's'} to billing group "${group.name}"`,
    steps,
  });
  return { added };
}

// ---- request routing ----------------------------------------------------

async function handleApi(req, res, url) {
  const db = wrapDb(await getDb());
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  try {
    if (parts[1] === 'teachers' && req.method === 'GET') {
      return sendJson(res, 200, await listTeachers(db));
    }
    // Billing Groups (Aug 25 follow-up, roadmap Phase 4) -- deliberately
    // named 'billing-groups', not 'groups', since /api/groups above already
    // means something else entirely (a teacher's team_group ordering).
    // 'search-students' has to come before the generic /billing-groups/:id
    // routes below, same reason /api/absent/months comes before /api/absent.
    if (parts[1] === 'billing-groups' && parts[2] === 'search-students' && req.method === 'GET') {
      return sendJson(res, 200, await searchUngroupedStudents(db, url.searchParams.get('q')));
    }
    if (parts[1] === 'billing-groups' && req.method === 'GET') {
      return sendJson(res, 200, await listBillingGroups(db));
    }
    if (parts[1] === 'billing-groups' && !parts[2] && req.method === 'POST') {
      const body = await readBody(req);
      const id = await createBillingGroupWithUndo(db, body.name, body.notes);
      return sendJson(res, 201, { id });
    }
    // Multi-add has to come before the generic /billing-groups/:id PUT
    // (rename) below -- same "more specific route first" ordering as
    // search-students above, since parts[3] === 'members' would otherwise
    // also satisfy that generic route's parts[2]-is-truthy check.
    if (parts[1] === 'billing-groups' && parts[2] && parts[3] === 'members' && req.method === 'PUT') {
      const body = await readBody(req);
      const result = await addBillingGroupMembersWithUndo(db, Number(parts[2]), body.studentIds);
      if (!result) return sendJson(res, 404, { error: 'billing group not found' });
      return sendJson(res, 200, result);
    }
    // Whole-group receipt upload (Aug 27 follow-up) -- one screenshot,
    // split across members. Has to come before the generic /billing-groups/:id
    // PUT below for the same "specific route first" reason as 'members' above.
    if (parts[1] === 'billing-groups' && parts[2] && parts[3] === 'receipts' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const result = await saveGroupReceiptUploadWithUndo(
          db, Number(parts[2]), body.month || await getActiveMonth(db), body.dataUri, body.uploadedBy, body.splits
        );
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    if (parts[1] === 'billing-groups' && parts[2] && req.method === 'PUT') {
      const body = await readBody(req);
      const ok = await updateBillingGroupWithUndo(db, Number(parts[2]), body.name, body.notes);
      if (!ok) return sendJson(res, 404, { error: 'billing group not found' });
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'billing-groups' && parts[2] && req.method === 'DELETE') {
      const ok = await deleteBillingGroupWithUndo(db, Number(parts[2]));
      if (!ok) return sendJson(res, 404, { error: 'billing group not found' });
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'students' && parts[2] && parts[3] === 'billing-group' && req.method === 'PUT') {
      const body = await readBody(req);
      const groupId = body.groupId ? Number(body.groupId) : null;
      const ok = await setStudentBillingGroupWithUndo(db, Number(parts[2]), groupId);
      if (!ok) return sendJson(res, 404, { error: 'student not found' });
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'levels' && req.method === 'GET') {
      return sendJson(res, 200, await listLevels(db, url.searchParams.get('subject')));
    }
    if (parts[1] === 'groups' && req.method === 'GET') {
      return sendJson(res, 200, GROUP_ORDER);
    }
    if (parts[1] === 'months' && req.method === 'GET') {
      return sendJson(res, 200, await listMonths(db));
    }
    if (parts[1] === 'active-month' && req.method === 'GET') {
      return sendJson(res, 200, await activeMonthInfo(db));
    }
    if (parts[1] === 'close-month' && req.method === 'POST') {
      return sendJson(res, 200, await closeActiveMonth(db));
    }
    if (parts[1] === 'monthly-progress' && req.method === 'GET') {
      const q = Object.fromEntries(url.searchParams.entries());
      if (!q.month) return sendJson(res, 400, { error: 'month is required' });
      return sendJson(res, 200, await listMonthlyProgress(db, q));
    }
    if (parts[1] === 'monthly-progress' && parts[2] && req.method === 'PUT') {
      const body = await readBody(req);
      if (!await checkAdminPassword(db, body.password)) {
        return sendJson(res, 401, { error: 'Incorrect admin password.' });
      }
      await updateMonthlyProgressWithUndo(db, Number(parts[2]), body);
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'ashr' && parts[2] === 'cycles' && req.method === 'GET') {
      return sendJson(res, 200, await ashrCycles(db));
    }
    if (parts[1] === 'ashr' && parts[2] === 'lock' && req.method === 'POST') {
      return sendJson(res, 200, await lockAshrCycle(db));
    }
    if (parts[1] === 'ashr' && parts[2] && req.method === 'PUT') {
      const body = await readBody(req);
      if (!await checkAdminPassword(db, body.password)) {
        return sendJson(res, 401, { error: 'Incorrect admin password.' });
      }
      await updateAshrAwardWithUndo(db, Number(parts[2]), body);
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'ashr' && req.method === 'GET') {
      const q = Object.fromEntries(url.searchParams.entries());
      return sendJson(res, 200, await listAshr(db, q));
    }
    if (parts[1] === 'payments' && parts[2] === 'months' && req.method === 'GET') {
      return sendJson(res, 200, await listPaymentMonths(db));
    }
    if (parts[1] === 'payments' && parts[2] === 'comeback-list' && req.method === 'GET') {
      return sendJson(res, 200, await listComebackCandidates(db));
    }
    if (parts[1] === 'payments' && parts[2] === 'bulk' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        return sendJson(res, 200, await bulkUpdatePayments(db, body));
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    // Receipt upload/verification routes (Aug 27 follow-up) -- all under
    // /api/payments/receipts/... except the upload itself, which is nested
    // under the student id (/api/payments/:studentId/receipts). Both have
    // to come before the generic /payments/:id PUT/GET below, same reason
    // the SOA route already has to (no parts[3]/parts[4] guard there).
    if (parts[1] === 'payments' && parts[2] === 'receipts' && parts[3] === 'pending' && req.method === 'GET') {
      return sendJson(res, 200, await listPendingReceipts(db));
    }
    if (parts[1] === 'payments' && parts[2] === 'receipts' && parts[3] && parts[4] === 'image' && req.method === 'GET') {
      const receipt = await db.prepare(`SELECT * FROM payment_receipt WHERE id = ?`).get(Number(parts[3]));
      if (!receipt) return sendJson(res, 404, { error: 'Receipt not found.' });
      const image = await receiptStorage.readReceiptFile(receipt.file_path, receipt.mime_type);
      if (!image) {
        return sendJson(res, 404, { error: 'Receipt image not found in storage.' });
      }
      res.writeHead(200, { 'Content-Type': image.contentType, 'Cache-Control': 'private, max-age=3600' });
      return image.stream.pipe(res);
    }
    // Group-receipt verify/flag/reject (Aug 27 follow-up) -- one combined
    // action across every member sharing a group_upload_id. Checked before
    // the single-receipt routes below purely for readability; there's no
    // actual ambiguity between the two (parts[3] here is the literal
    // 'group', not a numeric receipt id) so the ordering isn't load-bearing.
    if (parts[1] === 'payments' && parts[2] === 'receipts' && parts[3] === 'group' && parts[4] && parts[5] === 'verify' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        return sendJson(res, 200, await verifyReceiptGroupWithUndo(db, parts[4], body));
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    if (parts[1] === 'payments' && parts[2] === 'receipts' && parts[3] === 'group' && parts[4] && (parts[5] === 'flag' || parts[5] === 'reject') && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const status = parts[5] === 'flag' ? 'flagged' : 'rejected';
        return sendJson(res, 200, await setReceiptGroupDecisionWithUndo(db, parts[4], status, body.note));
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    if (parts[1] === 'payments' && parts[2] === 'receipts' && parts[3] && parts[4] === 'verify' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        return sendJson(res, 200, await verifyReceiptWithUndo(db, Number(parts[3]), body));
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    if (parts[1] === 'payments' && parts[2] === 'receipts' && parts[3] && (parts[4] === 'flag' || parts[4] === 'reject') && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const status = parts[4] === 'flag' ? 'flagged' : 'rejected';
        return sendJson(res, 200, await setReceiptDecisionWithUndo(db, Number(parts[3]), status, body.note));
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    if (parts[1] === 'payments' && parts[2] === 'receipts' && parts[3] && !parts[4] && req.method === 'DELETE') {
      try {
        await deleteReceiptWithUndo(db, Number(parts[3]));
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    if (parts[1] === 'payments' && parts[2] && parts[3] === 'receipts' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const receipt = await saveReceiptUploadWithUndo(db, Number(parts[2]), body.month || await getActiveMonth(db), body.dataUri, body.uploadedBy);
        return sendJson(res, 200, receiptRowForClient(receipt));
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    // One-click SOA from a Payments row -- has to come before the generic
    // /payments/:id PUT and GET below, since those have no parts[3] check
    // and would otherwise swallow this URL too.
    if (parts[1] === 'payments' && parts[2] && parts[3] === 'soa' && req.method === 'GET') {
      const soa = await getStudentSoa(db, Number(parts[2]), url.searchParams.get('month'));
      if (!soa) return sendJson(res, 404, { error: 'student not found' });
      return sendJson(res, 200, soa);
    }
    if (parts[1] === 'payments' && parts[2] && req.method === 'PUT') {
      const body = await readBody(req);
      const record = await upsertPaymentAndAttentionWithUndo(db, Number(parts[2]), body);
      return sendJson(res, 200, record);
    }
    if (parts[1] === 'payments' && req.method === 'GET') {
      const q = Object.fromEntries(url.searchParams.entries());
      return sendJson(res, 200, await listPayments(db, q));
    }
    if (parts[1] === 'absent' && parts[2] === 'months' && req.method === 'GET') {
      return sendJson(res, 200, await listAbsentMonths(db));
    }
    if (parts[1] === 'absent' && req.method === 'GET') {
      const q = Object.fromEntries(url.searchParams.entries());
      return sendJson(res, 200, await listAbsentStudents(db, q));
    }
    if (parts[1] === 'students' && parts[2] && parts[3] === 'absent-status' && req.method === 'PUT') {
      const body = await readBody(req);
      // Roster's edit panel still sends a single `enrollmentId` (it's always
      // scoped to one subject row); the Payments tab's Aug 25 "tag absent"
      // action sends `enrollmentIds` (plural, an array) since one billing
      // row can cover more than one active subject. Normalize both into the
      // array setAbsentStatusWithUndo now expects.
      const enrollmentIds = Array.isArray(body.enrollmentIds)
        ? body.enrollmentIds.map(Number).filter(Boolean)
        : (body.enrollmentId ? [Number(body.enrollmentId)] : []);
      const ok = await setAbsentStatusWithUndo(db, Number(parts[2]), body.action, body.note, enrollmentIds);
      if (!ok) return sendJson(res, 404, { error: 'student not found' });
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'students' && parts[2] && parts[3] === 'absent-note' && req.method === 'PUT') {
      const body = await readBody(req);
      const ok = await updateAbsentNoteWithUndo(db, Number(parts[2]), body.note);
      if (!ok) return sendJson(res, 404, { error: 'student not found' });
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'admin' && parts[2] === 'change-password' && req.method === 'POST') {
      const body = await readBody(req);
      if (!await checkAdminPassword(db, body.currentPassword)) {
        return sendJson(res, 401, { error: 'Current password is incorrect.' });
      }
      if (!body.newPassword || String(body.newPassword).length < 4) {
        return sendJson(res, 400, { error: 'New password must be at least 4 characters.' });
      }
      await setAdminPassword(db, body.newPassword);
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'attendance' && parts[2] === 'today' && req.method === 'GET') {
      return sendJson(res, 200, await attendanceToday(db));
    }
    if (parts[1] === 'attendance' && parts[2] === 'toggle' && req.method === 'POST') {
      const body = await readBody(req);
      const scheduleSlotId = Number(body.scheduleSlotId);
      if (!scheduleSlotId) return sendJson(res, 400, { error: 'scheduleSlotId is required' });
      return sendJson(res, 200, await toggleAttendance(db, scheduleSlotId));
    }
    if (parts[1] === 'timeslots' && req.method === 'GET') {
      return sendJson(res, 200, await listTimeSlots(db));
    }
    if (parts[1] === 'calendar' && req.method === 'GET') {
      const q = Object.fromEntries(url.searchParams.entries());
      return sendJson(res, 200, await calendar(db, q));
    }
    if (parts[1] === 'enrollments' && req.method === 'GET') {
      const q = Object.fromEntries(url.searchParams.entries());
      return sendJson(res, 200, await listEnrollments(db, q));
    }
    if (parts[1] === 'students' && req.method === 'POST') {
      const body = await readBody(req);
      const id = await createStudentWithUndo(db, body);
      return sendJson(res, 201, { id });
    }
    if (parts[1] === 'students' && parts[2] && req.method === 'PUT') {
      const body = await readBody(req);
      await updateStudent(db, Number(parts[2]), body);
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'students' && parts[2] && parts[3] === 'progress' && req.method === 'GET') {
      return sendJson(res, 200, await studentProgress(db, Number(parts[2])));
    }
    if (parts[1] === 'students' && parts[2] && parts[3] === 'enrollments' && req.method === 'POST') {
      const body = await readBody(req);
      const id = await createEnrollment(db, Number(parts[2]), body);
      return sendJson(res, 201, { id });
    }
    // Combined student+enrollment save, used by the edit panel so both
    // halves of one user-facing "Save" count as a single undo-able action
    // instead of two separate ones (see updateStudentAndEnrollmentWithUndo).
    if (parts[1] === 'enrollments' && parts[2] && parts[3] === 'full' && req.method === 'PUT') {
      const body = await readBody(req);
      await updateStudentAndEnrollmentWithUndo(
        db, Number(body.studentId), Number(parts[2]), body.student, body.enrollment
      );
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'enrollments' && parts[2] && req.method === 'PUT') {
      const body = await readBody(req);
      await updateEnrollment(db, Number(parts[2]), body);
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'enrollments' && parts[2] && req.method === 'DELETE') {
      const ok = await deleteEnrollmentWithUndo(db, Number(parts[2]));
      if (!ok) return sendJson(res, 404, { error: 'enrollment not found' });
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'students' && parts[2] && req.method === 'DELETE') {
      const ok = await deleteStudentWithUndo(db, Number(parts[2]));
      if (!ok) return sendJson(res, 404, { error: 'student not found' });
      return sendJson(res, 200, { ok: true });
    }
    if (parts[1] === 'undo' && req.method === 'GET') {
      const undo = await getLastUndo(db);
      return sendJson(res, 200, { available: !!undo, description: undo ? undo.description : null });
    }
    if (parts[1] === 'undo' && req.method === 'POST') {
      const description = await applyUndo(db);
      if (!description) return sendJson(res, 200, { ok: false, message: 'Nothing to undo.' });
      return sendJson(res, 200, { ok: true, description });
    }
    return sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: String(err.message || err) });
  }
}

function serveStatic(req, res, url) {
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url);
  } else {
    serveStatic(req, res, url);
  }
}

// ---- Server bootstrap (Aug 27 follow-up, task #46: Vercel routing) ------
// Local dev / this sandbox: plain node:http, exactly the same server this
// app has always run on `npm start` -- unchanged by anything below.
//
// On Vercel: this same file (server.js) is one of the filenames Vercel's
// zero-config Express detection looks for, and detection is keyed on
// finding a file at that name that imports the `express` package and
// either exports the app or calls app.listen() -- this file does both
// (exports the app below; the local-dev branch still calls the
// equivalent of app.listen() via http.createServer + .listen()). Once
// detected, Vercel wraps the whole app as a single Vercel Function and
// handles the translation between its platform request format and this
// classic req/res code itself -- no manual protocol adapter needed here,
// and no vercel.json either (this really is zero-config, confirmed
// against Vercel's own docs before writing this). Static files
// (public/index.html, app.js, styles.css) are served two different ways
// depending on where this runs: locally, serveStatic() above reads them
// off disk on every request, same as always; on Vercel, files under
// public/** are served directly by Vercel's own CDN and typically never
// reach this code at all -- serveStatic() only matters there as a
// same-behavior fallback for a genuinely unmatched path. See the
// README's Vercel-deployment section for the full reasoning.
//
// Same require-with-fallback pattern used for `pg` and `@vercel/blob`
// earlier in this migration: this sandbox has no npm registry access to
// install `express`, so a plain `node server.js` here always takes the
// http.createServer path below, regardless of this branch -- only a real
// Vercel deploy (or `vercel dev`/`vc dev`, which does have real npm
// access) ever takes the Express path.
let ExpressCtor;
try {
  ExpressCtor = require('express');
} catch {
  ExpressCtor = null;
}

if (require.main === module) {
  // `node server.js` / `npm start` -- always the plain http server,
  // whether or not `express` happens to be installed, so local behavior
  // never silently depends on which path a real Vercel deploy will take.
  http.createServer(handleRequest).listen(PORT, () => {
    console.log(`Kumon roster app running at http://localhost:${PORT}`);
  });
} else if (ExpressCtor) {
  // Required as a module with `express` available -- the Vercel path.
  // This exported `app` is what Vercel's Express detection wraps as a
  // Function; app.use with no path mounts handleRequest as a catch-all
  // for every method and path, matching this app's own single-dispatcher
  // design (there's no Express routing/middleware feature actually in
  // use here -- express exists solely so Vercel recognizes this as a
  // deployable backend, per its own documented zero-config detection).
  const app = ExpressCtor();
  app.use(handleRequest);
  module.exports = app;
} else {
  // Required as a module without `express` (e.g. a local test script
  // importing pieces of this file directly) -- nothing to wrap an app
  // around, so export the raw pieces instead.
  module.exports = { handleApi, serveStatic, handleRequest };
}
