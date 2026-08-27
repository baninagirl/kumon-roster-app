-- Postgres schema for the Kumon roster app, converted from lib/db.js's
-- SQLite SCHEMA + every self-healing ALTER TABLE that has landed since.
-- This is the FINAL, current shape of the app's data as of Aug 27, 2026 --
-- not a replay of every incremental migration step (those were SQLite-
-- specific workarounds, e.g. the subject_enrollment rebuild to drop
-- 'Inactive' from its CHECK constraint; Postgres just gets the end result
-- directly).
--
-- Kept mechanical on purpose: INTEGER 0/1 "boolean" columns stay INTEGER
-- (not converted to real BOOLEAN) so the app layer's existing 0/1 reads
-- and writes don't all need to change in the same pass as the DB engine
-- itself. Timestamp-ish columns stay TEXT, defaulting to the same
-- 'YYYY-MM-DD HH:MM:SS' shape SQLite's CURRENT_TIMESTAMP produced, so any
-- string comparison/sort the app already relies on keeps working.
--
-- Safe to re-run: every CREATE TABLE is IF NOT EXISTS and every ADD COLUMN
-- uses Postgres's native IF NOT EXISTS support (much simpler than the
-- PRAGMA table_info() existence checks the SQLite version needed).

CREATE TABLE IF NOT EXISTS teacher (
  id SERIAL PRIMARY KEY,
  legal_name TEXT NOT NULL,
  nickname TEXT,
  role TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  team_group TEXT
);

CREATE TABLE IF NOT EXISTS curriculum_level (
  code TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL,
  subject TEXT CHECK(subject IN ('Math','Reading') OR subject IS NULL)
);

CREATE TABLE IF NOT EXISTS student (
  id SERIAL PRIMARY KEY,
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  grade TEXT,
  grade_raw TEXT,
  birthday TEXT,
  guardian_name TEXT,
  guardian_relationship TEXT,
  contact_number TEXT,
  needs_attention INTEGER NOT NULL DEFAULT 0,
  needs_attention_note TEXT,
  roster_status TEXT NOT NULL DEFAULT 'Active',
  absent_source_note TEXT,
  absent_reported_date TEXT,
  billing_group_id INTEGER,
  created_at TEXT DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS billing_group (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
);

DO $$ BEGIN
  ALTER TABLE student ADD CONSTRAINT fk_student_billing_group
    FOREIGN KEY (billing_group_id) REFERENCES billing_group(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS subject_enrollment (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES student(id),
  subject TEXT NOT NULL CHECK(subject IN ('Math','Reading')),
  teacher_id INTEGER REFERENCES teacher(id),
  current_level TEXT,
  current_page INTEGER,
  current_level_raw TEXT,
  goal_level TEXT,
  goal_page INTEGER,
  goal_level_raw TEXT,
  goal_award TEXT CHECK(goal_award IN ('KIS','Bronze','Silver','Gold','ASF') OR goal_award IS NULL),
  schedule_days TEXT,
  schedule_time TEXT,
  submission_mode TEXT CHECK(submission_mode IN ('KC','Paper') OR submission_mode IS NULL),
  date_enrolled TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Absent')),
  needs_teacher_review INTEGER NOT NULL DEFAULT 0,
  needs_schedule_review INTEGER NOT NULL DEFAULT 0,
  needs_level_review INTEGER NOT NULL DEFAULT 0,
  source_note TEXT,
  created_at TEXT DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS schedule_slot (
  id SERIAL PRIMARY KEY,
  enrollment_id INTEGER NOT NULL REFERENCES subject_enrollment(id),
  day_of_week TEXT NOT NULL CHECK(day_of_week IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  time24 TEXT,
  mode TEXT CHECK(mode IN ('RI','IC') OR mode IS NULL) DEFAULT 'IC',
  needs_mode_review INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_enrollment_student ON subject_enrollment(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_teacher ON subject_enrollment(teacher_id);
CREATE INDEX IF NOT EXISTS idx_slot_enrollment ON schedule_slot(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_slot_day ON schedule_slot(day_of_week);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  schedule_slot_id INTEGER NOT NULL REFERENCES schedule_slot(id),
  date TEXT NOT NULL,
  arrived INTEGER NOT NULL DEFAULT 1,
  marked_at TEXT DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE(schedule_slot_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_slot ON attendance(schedule_slot_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

CREATE TABLE IF NOT EXISTS monthly_progress (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES student(id),
  subject TEXT CHECK(subject IN ('Math','Reading') OR subject IS NULL),
  month TEXT NOT NULL,
  teacher_id INTEGER REFERENCES teacher(id),
  teacher_label TEXT,
  goal_level TEXT,
  goal_page INTEGER,
  goal_level_raw TEXT,
  goal_award TEXT CHECK(goal_award IN ('KIS','Bronze','Silver','Gold','ASF') OR goal_award IS NULL),
  actual_level TEXT,
  actual_page INTEGER,
  actual_level_raw TEXT,
  source_sheet TEXT,
  source_file TEXT,
  edited_at TEXT,
  UNIQUE(student_id, subject, month)
);
CREATE INDEX IF NOT EXISTS idx_monthly_progress_student ON monthly_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_monthly_progress_month ON monthly_progress(month);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS ashr_award (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES student(id),
  subject TEXT NOT NULL CHECK(subject IN ('Math','Reading')),
  cycle TEXT NOT NULL,
  grade_at_cycle TEXT,
  level_raw TEXT,
  result TEXT NOT NULL,
  teacher_id INTEGER REFERENCES teacher(id),
  teacher_label TEXT,
  source TEXT NOT NULL DEFAULT 'backfill' CHECK(source IN ('backfill','computed','corrected')),
  source_sheet TEXT,
  source_file TEXT,
  edited_at TEXT,
  created_at TEXT DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE(student_id, subject, cycle)
);
CREATE INDEX IF NOT EXISTS idx_ashr_student ON ashr_award(student_id);
CREATE INDEX IF NOT EXISTS idx_ashr_cycle ON ashr_award(cycle);

CREATE TABLE IF NOT EXISTS payment_record (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES student(id),
  month TEXT NOT NULL,
  soa1_sent_date TEXT,
  soa2_sent_date TEXT,
  soa3_sent_date TEXT,
  soa4_sent_date TEXT,
  paid_date TEXT,
  marked_absent_date TEXT,
  amount_paid NUMERIC,
  notes TEXT,
  updated_at TEXT DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE(student_id, month)
);
CREATE INDEX IF NOT EXISTS idx_payment_student ON payment_record(student_id);
CREATE INDEX IF NOT EXISTS idx_payment_month ON payment_record(month);

CREATE TABLE IF NOT EXISTS payment_receipt (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES student(id),
  month TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  ocr_raw_text TEXT,
  ocr_error TEXT,
  extracted_reference TEXT,
  extracted_amount NUMERIC,
  extracted_date TEXT,
  reference_number TEXT,
  amount NUMERIC,
  paid_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK(status IN ('pending_review','verified','flagged','rejected')),
  review_note TEXT,
  uploaded_by TEXT,
  uploaded_at TEXT DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
  reviewed_at TEXT,
  group_upload_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_receipt_student_month ON payment_receipt(student_id, month);
CREATE INDEX IF NOT EXISTS idx_receipt_status ON payment_receipt(status);
CREATE INDEX IF NOT EXISTS idx_receipt_group_upload ON payment_receipt(group_upload_id);

-- Defensive self-heal, matching the app's existing philosophy: safe to
-- re-run against a database that already has these columns (Postgres
-- natively supports IF NOT EXISTS on ADD COLUMN, so this needs no
-- PRAGMA-style existence check the way the SQLite version did).
ALTER TABLE student ADD COLUMN IF NOT EXISTS grade_raw TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS needs_attention INTEGER NOT NULL DEFAULT 0;
ALTER TABLE student ADD COLUMN IF NOT EXISTS needs_attention_note TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS roster_status TEXT NOT NULL DEFAULT 'Active';
ALTER TABLE student ADD COLUMN IF NOT EXISTS absent_source_note TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS absent_reported_date TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS billing_group_id INTEGER;
ALTER TABLE teacher ADD COLUMN IF NOT EXISTS team_group TEXT;
ALTER TABLE subject_enrollment ADD COLUMN IF NOT EXISTS goal_level TEXT;
ALTER TABLE subject_enrollment ADD COLUMN IF NOT EXISTS goal_page INTEGER;
ALTER TABLE subject_enrollment ADD COLUMN IF NOT EXISTS goal_level_raw TEXT;
ALTER TABLE subject_enrollment ADD COLUMN IF NOT EXISTS goal_award TEXT;
ALTER TABLE subject_enrollment ADD COLUMN IF NOT EXISTS needs_level_review INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_progress ADD COLUMN IF NOT EXISTS edited_at TEXT;
ALTER TABLE monthly_progress ADD COLUMN IF NOT EXISTS goal_award TEXT;
ALTER TABLE ashr_award ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES teacher(id);
ALTER TABLE curriculum_level ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE schedule_slot ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'IC';
ALTER TABLE schedule_slot ADD COLUMN IF NOT EXISTS needs_mode_review INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payment_record ADD COLUMN IF NOT EXISTS amount_paid NUMERIC;
ALTER TABLE payment_receipt ADD COLUMN IF NOT EXISTS group_upload_id TEXT;
