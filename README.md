# Kumon Iligan City Learning Center — Student & Subject-Enrollment Roster

This is the **first page** of the operations platform: the foundation everything
else (schedules, monthly progress, billing, materials, ASHR, payroll headcount,
and the end-of-month audit) will eventually build on top of. See the project's
`kumon-platform-brief.md` and `kumon-data-model-analysis.md` for the full
reasoning behind starting here.

## What this is

A small, self-contained web app: one roster table of every student and their
subject enrollments (Math and/or Reading are tracked separately), with search,
filters, and an edit panel — plus a center-wide **Weekly Calendar** tab. It
already comes seeded with a cleaned-up version of your real roster, extracted
from the 5 teacher workbooks you sent.

The data model follows the correction from our last conversation: **Curriculum
Level is the backbone, Teacher is just an editable attribute.** Reassigning a
teacher never touches a student's level history.

### Recording this month's Goal and Actual, and closing a month (Aug 19)

Every enrollment now has a **Goal level/page** field (in the edit panel, and
as a column on the Roster table) alongside the existing Current level/page
("Actual") — the same Goal/Actual pair your original monthly REPORT sheets
tracked, now editable for the month you're actually in instead of only
showing up as read-only history for Jan–Jul.

- A green status bar above the Roster toolbar always shows which month is
  currently live ("Recording data for August 2026") — the app starts on
  August 2026, the month right after the Jan–Jul backfill.
- Teachers set a **Goal** for their students at the start of the month, and
  update **Current level (actual)** as students progress through it, exactly
  like before — just in the app instead of a spreadsheet cell.
- When the month is actually finished, click **"Close [Month]"** in that same
  status bar. This saves every student's Goal and Actual at that moment as
  the month's permanent history (joining Jan–Jul in the month picker and each
  student's history), clears the Goal field so next month starts blank, and
  advances the status bar to the next month. **Current level/page is *not*
  reset** — it carries forward as the student's real ongoing position, same
  as your source sheets did month to month.
- Closing is safe to click again if you're ever unsure it went through — it
  re-saves over the same month rather than creating a duplicate entry.
- **There's no login/role system yet** (that's on the list of future pages),
  so anyone using the app can click "Close month" — for now, that just means
  agreeing as a team on who does it and when, same as you would with any
  shared spreadsheet action today.
- **Note for existing installs**: unlike the Jan–Jul history update, this one
  self-heals on startup like the group/attendance update did — just restart
  the app (`npm start`) to pick it up, no `npm run reset-db` needed and no
  data lost.

### Tidying up the toolbar and admin actions (Aug 19)

The Goal-tracking and history-editing updates above added several new
controls to the Roster page. On review, two of them — "Close month" and
"Change password" — carry meaningfully more weight than a normal edit
(rewriting permanent history, changing who can edit it) but were sitting
right next to everyday buttons with no visual distinction, and the toolbar
itself had grown to nine controls in a single row. This pass cleans both up
without changing what either does:

- **Admin actions now live in one place.** Click **"Manage →"** in the
  green status bar above the Roster table to open a dedicated panel with
  "Close month" and "Change password" together, separated from the
  day-to-day roster view. The old inline "Change password" prompt (a plain
  browser popup) is gone — the new form shows validation errors and success
  confirmation right in the panel instead. (There was briefly a second
  "Admin" button in the top-right doing the same thing — removed as
  redundant, since "Manage →" already covers it.)
- **The toolbar now shows only the filters used daily** — Search, Subject,
  Teacher, Group, and the month picker. Day, Time Slot, and Status are
  tucked behind a **"More filters"** button, which shows how many of them
  are currently active (e.g. "More filters (1 active)") so it's obvious at
  a glance if one's been left on. (A "Needs teacher review only" checkbox
  briefly lived here too, alongside a same-day "Needs level review only"
  one — both removed at Nina's request; unassigned-teacher rows are still
  visible via the highlighted row and "Unassigned — needs review" label in
  the Teacher column, just without a dedicated filter checkbox.)
- Nothing about how filtering, closing a month, or changing the password
  *works* has changed — this is layout only.
- **Known limitation**: "Manage →" lives in the status bar on the **Roster**
  tab, so it's not currently reachable while you're on the Weekly Calendar
  tab — you'd need to switch tabs first. Worth revisiting if that turns out
  to be annoying in practice.
- **Note for existing installs**: no database changes in this update, so a
  normal restart (`npm start`) is all that's needed.

### Correcting a closed month's history, with a password (Aug 19)

Once a month is closed, its Goal/Actual becomes permanent history — but
mistakes happen, so there's a way to fix a record after the fact without
reopening the whole month:

- Every historical record — in a student's **Monthly progress history**
  section, and in the roster-wide **month picker** view — now has a small
  **Edit** link.
- Editing asks for the **admin password** before saving. **The very first
  time you start the app after this update, it prints the starting password
  to the terminal** (something like `First run: the admin password... is set
  to "kumon2026"`) — use **"Manage →"** above the Roster table to set your
  own as soon as you can.
- Whoever has the password can fix a Goal, Actual, or Teacher on any closed
  month's record. A corrected row is marked **"corrected after import"** so
  it's clear at a glance it was touched after the fact, not part of the
  original import or close-out.
- **This is a light gate, not a real login system** — one shared password,
  checked per edit, with no per-teacher accounts or audit log of *who* made
  a change (just *that* it was changed, and when). That's intentional for
  now: enough to stop casual/accidental edits to closed history, not meant
  to be bulletproof. A real Teacher/Admin login system is still on the list
  of future pages.
- **Note for existing installs**: self-heals like the Goal-tracking update
  above — just restart the app, no reset-db needed.

### Monthly progress history (Aug 19)

Your original workbooks had a January sheet, a February sheet, a March sheet,
and so on per teacher — each one a snapshot of where every student stood that
month. That history is now inside the app instead of scattered across
per-teacher, per-month tabs:

- Every currently active (August) student now carries their **January
  through July** goal/actual level+page history, pulled from each teacher's
  monthly REPORT sheet for that student and re-attached here — **6,587
  monthly records** across 991 students.
- To see one student's full history: open them from the Roster tab (click
  **Edit**) and scroll down to **"Monthly progress history"** — a small
  table per subject, one row per month, showing the goal set, what was
  actually reached, and who was teaching them that month.
- To see the **whole roster** as of a past month: use the new **month
  dropdown** in the Roster toolbar ("Current (live)" by default) — pick
  January through July and the table switches to a read-only snapshot of
  that month (Student / Grade / Subject / Goal / Actual / Teacher). Search,
  Subject, Teacher, and Group filters all still work in this view; Day,
  Time, Status, and "Needs review" are greyed out since a past month doesn't
  carry that data. Switch back to "Current (live)" to edit again.
- A student's history follows *them*, not whichever teacher happens to be
  assigned today — if they changed teachers mid-year, or were taught by
  someone who has since left the center, that month's row still shows
  correctly with that teacher's name, even though there's no longer a live
  teacher record to match it to.
- **What's included**: only students who are part of the current (August)
  roster. About 542 additional names appeared in earlier months' sheets but
  aren't in the app at all (they'd left before August) — their history
  wasn't pulled in, since there's no current student record for it to attach
  to. If any of them should actually still be active, let me know and I can
  add them back in along with their history.
- **Data fix**: three of Hamid & Jea's combined monthly sheets (January,
  March, April) had names Excel had silently truncated at its 31-character
  sheet-name limit, so the month name itself got cut short (e.g. "...REPORT
  (JANU") — an early pass missed these because it was matching on the full
  month name. Caught and fixed before this history was attached, so those
  three months are now included for them too. (April also had two
  extra single-teacher sheets that turned out to be exact-duplicate copies
  of each other; the combined sheet was used instead, matching how every
  other month is structured.)
- **Note for existing installs**: unlike the group/attendance update above,
  this one adds a large amount of new seed data, so it needs an actual
  reseed — run `npm run reset-db` after updating (this replaces the
  database with fresh seed data, so any manual edits you've made in the app
  since your last reseed will be lost; export or note anything important
  first).

### Level groups, group calendar views, and daily attendance (Aug 19)

Five fixed **level groups** are now built in, matching how the center is
actually organized:

- **7A-3A61** — Sugar, Mira, KC, GB, Queenie
- **3A71-A** — Jess
- **BCD** — Jofel, Lycka, Jea and Hamid
- **EFG** — Francis
- **H-O** — Ericson, Mark

This is fixed metadata (which teacher belongs to which group), not something
extracted from a spreadsheet, so it lives directly in `lib/db.js` as a
`TEACHER_GROUPS` mapping and a new `team_group` column on `teacher`. The app
self-heals this on every startup — if you're updating from an older version
of the app, it adds the column and re-applies the mapping automatically, no
manual migration or `npm run reset-db` needed.

- Both the **Roster** and **Weekly Calendar** tabs now have a **Group**
  filter next to the Teacher filter (selecting one clears the other) — so
  you can view a whole team's students together, not just one teacher or
  the whole center.
- The **center-wide calendar** (no teacher or group filter) now colors chips
  by **group** instead of subject, so you can see the five teams at a
  glance — the teacher's name still shows on every chip, same as before. Any
  filtered view (one teacher, or one group's several teachers) still colors
  by subject (green = Math, blue = Reading), since a single flat group color
  wouldn't tell you anything there.

**Daily attendance marking**: today's column on the calendar is highlighted,
and every chip in it gets a small circle you can click to cross a student
off as arrived. Below the calendar, a **"Not arrived today"** panel lists
everyone still unmarked for today — grouped by teacher, respecting whatever
Teacher/Group filter is currently active — so at the end of the day each
teacher can see exactly who to follow up with. Attendance is tracked
per class-slot per calendar date, so it naturally resets each day; there's
no separate step to clear it.

### Schedule tagging, filtering, and the Weekly Calendar

Every enrollment's schedule is now stored as structured day + time slots
(a `schedule_slot` row per weekly meeting time) instead of free text, so it
can be filtered and rendered on a calendar:

- On the **Roster** tab, use the new **day** and **time slot** dropdowns
  (next to subject/teacher/status) to segregate students by e.g. "Monday" or
  "4:00 PM", same way the other filters work.
- The edit panel's schedule field is now a **Mon–Sun checkbox + time picker**
  instead of free text — check a day to reveal its time field.
- The **Weekly Calendar** tab (next to Roster) shows the whole center's
  weekly grid, one column per day, chips color-coded by subject (green =
  Math, blue = Reading), struck-through for inactive teachers. Use the
  teacher dropdown above it to switch between the center-wide view and any
  single teacher's personal week.
- The calendar is **always live** — it's rendered directly from the same
  `schedule_slot` data the roster edits, not a separate calendar table. Edit
  a student's schedule and save; the calendar reflects it immediately on next
  view, with no extra sync step.
- **85 of 1,598 enrollments (5.3%)** have schedule text that couldn't be
  cleanly parsed into day+time (e.g. mismatched day/time counts in the
  source) and are flagged `needs_schedule_review` — same "flag rather than
  guess" philosophy as the teacher-review flag. These show up with their
  original free-text schedule until you fix them in the picker.
- **A note on AM/PM**: a number of source cells recorded a bare time like
  "1:30" or "9:00" with no AM/PM marker (sometimes because a teacher typed
  it straight into an Excel time cell, which silently defaults an unmarked
  entry to AM). Since this center never runs classes 1–7 AM on any day, any
  unmarked hour in that range is treated as PM. Unmarked hours 8–11 are left
  as typed, since real Saturday-morning classes exist in that range — those
  are exactly as ambiguous as the source data itself, so if any land on a
  weekday instead of Saturday, worth a glance while you're in the app.

### ASHR — Advanced Student Honor Roll (Aug 19)

A new **ASHR** tab, next to Roster and Weekly Calendar. ASHR is Kumon's
twice-yearly award program (an August cutoff and a February cutoff) that
compares each student's curriculum level against a published qualifying-level
table for their grade, earning KIS / Bronze / Silver / Gold / ASF tiers.

- **Grades are now standardized platform-wide**: PK3, PK2, PK1, K, P1–P11,
  replacing the inconsistent "P4" / "4" / "1ST" / bare "PK" values from the
  source sheets. This rolled out everywhere, not just ASHR — the Roster
  table, edit panel, and filters all show the standardized form now. The
  original value from the source is preserved underneath (`grade_raw`, never
  overwritten) so nothing is destroyed, but the app displays and reasons
  about the clean version. **P12–P14 are real, valid, older grades** — they
  just fall outside these particular award rules and always show N/A for
  ASHR, same as PK3 (see below).
- **Real August 2025 and February 2026 ASHR history**, pulled from the
  "ASHR QUALIFYING LIST" sheets buried in your five workbooks — **325
  awards matched** to current (August 2026) students (161 for Aug 2025, 164
  for Feb 2026), covering both Math and Reading. 246 names in those sheets
  didn't match a current student and weren't pulled in — consistent with the
  ~542 already-known "left before August" group from the monthly-history
  backfill, spot-checked to confirm it's real departures, not a name-matching
  bug.
- **Cycle pills** at the top of the tab switch between February 2026, August
  2025, and the current in-progress cycle (August 2026, marked "live
  preview"). Past cycles show the real, permanent record; the live cycle
  shows a preview computed right now from each student's current recorded
  level — nothing is saved until you lock it in.
- **Both Math and Reading are computed live** for the in-progress cycle (see
  "Reading goes live" below for how the one remaining notation question got
  resolved).
- **"Lock in [cycle]"** — a new button in the admin panel ("Manage →" →
  ASHR) — saves the current live preview (Math and Reading) as that cycle's
  permanent record, then advances to the next cycle. Mirrors "Close month":
  not password-gated (only *editing* an already-locked record is), and it
  always advances, so it's a one-way action — only click it once the cycle
  is actually over.
- **"Double Award"** — qualifying for the same tier as last cycle shows as
  "Double Award" instead of a repeat of the tier name, matching the literal
  label your source sheets already use (no second certificate, but it's
  still tracked).
- **Editing a locked ASHR record** is supported on the backend (same
  password gate as correcting closed-month history) but doesn't have a
  dedicated panel in the UI yet — a natural next step once this first cut
  has been used for a cycle or two, same as how history-editing followed the
  initial Goal/Actual build.
- **Note for existing installs**: this adds new seed data (the 325 backfilled
  awards) the same way the Jan–Jul monthly-progress backfill did, so it needs
  an actual reseed — run `npm run reset-db` after updating. The grade
  standardization itself self-heals on every startup with no data loss.

### Same-day follow-up: Reading goes live (Aug 19)

You confirmed the one open question from the ASHR build above — "A1 100" and
"AI 100" mean the same thing on the Reading flyer — so Reading is now
computed live too, same as Math:

- Any bare digit ("A1", "D2") immediately after a level letter is read as
  the equivalent Roman-numeral sub-level marker ("AI", "DII") — this matches
  how the real source data already mixes both notations for the same
  students (e.g. "D1 190" and "DI 190" both show up in the real roster for
  different kids at the same level).
- **Level I** is a special case, since its own letter doubles as the
  Roman-numeral-I marker — "I" + "I" or "I" + "II" is genuinely hard to
  read. Used the hyphenated form the February flyer itself uses for this
  ("I-I 100" / "I-II 100") as the standard internal notation.
- **Two cells in the August Reading flyer read like typos** once
  cross-checked against the very consistent pattern in every other cell
  (and against how the February flyer spells out the identical case): grade
  7's Gold column showed "J1 100" even though J doesn't sub-split anywhere
  else it appears — read as "J 100". Grade 9's Bronze column showed "II 100"
  where the pattern calls for "I-II 100" (the February flyer spells out its
  own equivalent cell in full) — read as "I-II 100". Flag it if either of
  those reads wrong in practice — an easy one-line fix in `lib/ashr.js` if so.
- The live-preview banner, the Admin panel's ASHR note, and the "Lock in"
  action all dropped their "Math only" language — locking in now saves both
  subjects' qualifying students.
- No data model or migration changes — this was a computation-logic-only
  update, so a normal restart picks it up.

### ASHR tab: teacher filter, in-tab editing, award filter, double-award toggle (Aug 19)

You asked for four things on the ASHR tab so teachers can self-check their
own students without leaving that screen:

- **Teacher filter** — a new "All teachers" dropdown, same as the Roster
  tab's. This needed `ashr_award` to gain a `teacher_id` column (it only had
  a free-text `teacher_label` before, which isn't reliably filterable). A
  one-time self-heal migration adds the column and backfills it for every
  existing row by matching `teacher_label` against a real teacher's nickname
  or legal name, case-insensitively, after stripping a leading "Ms"/"Sir"/
  "Mr"/"Mrs" honorific (the ASHR source sheets label teachers as "MS JESS" /
  "SIR GB" where the rest of the app just says "JESS" / "GB"). A handful of
  older rows stay unmatched on purpose rather than guessing: departed
  teachers no longer in the roster ("MS KIARA", "MS WEDA", "MS TRIXIE", "MS
  SWEET", "MS MARIZ"), and a couple of combined-label rows ("MS JEA", "SIR
  HAMID") that can't be confidently mapped to the single combined "JEA AND
  HAMID" teacher record the roster actually has. Those rows just show no
  teacher for filtering purposes, same as any other unmatched record
  elsewhere in the app.
- **Edit from within the ASHR tab** — every row now has an Edit button.
  Clicking it on a *live preview* row opens the normal student edit panel
  (since a live row is just a computed reflection of that student's current
  enrollment — editing it means editing the enrollment). Clicking it on a
  *locked* historical row opens a new password-gated correction panel
  (mirroring the existing "edit a closed month" panel), for fixing an
  already-recorded award after the fact.
- **Award/result filter** — a new dropdown to show only one tier at a time
  (KIS, Bronze, Silver, Gold, ASF, Completer, Double Award).
- **"Show double awardees" toggle** — checked by default (so nothing
  changes unless you touch it); unchecking it hides anyone whose result is
  "Double Award" for that cycle.

All four filters combine with each other and with the existing
search/subject/grade filters. No source data was touched — this only adds a
column to the app's own database and some UI.

### "Goal" is now the award, not the level (Aug 19)

You pointed out that "Goal is the award, not the level" — the "Goal level"
field on a student's live enrollment was tracking a target curriculum
position, but the goal you actually mean is a target ASHR award (KIS,
Bronze, Silver, Gold, ASF) for the cycle. The live "Goal level / Goal page"
fields are gone, replaced by a single **Goal award** dropdown.

- **What changed**: the edit panel's "Goal level" pair is now one "Goal
  award" select. The Roster table's Goal column now shows a colored award
  badge (same styling as the ASHR tab) instead of a level+page string.
  "Close month" now archives `goal_award` into history instead of a level.
- **What didn't change, on purpose**: "Actual" is untouched — it still
  tracks the student's real completed curriculum level/page, exactly as
  before, since that's what feeds ASHR computation and matches your real
  source spreadsheets. Only *Goal* changed meaning.
- **Your real Jan–Jul history is untouched**: those months' Goal was
  genuinely level-based in the original spreadsheets (literal `<MONTH>
  GOAL` columns), so that historical fact is preserved exactly as recorded
  — old months still display "goal level, page" the same as before. Going
  forward, any newly closed month stores an award instead. The Goal column
  and the historical-record edit panel both understand either kind and show
  whichever one a given month actually has (a new `goal_award` column sits
  alongside the old `goal_level`/`goal_page`/`goal_level_raw` columns on
  both `subject_enrollment` and `monthly_progress` — nothing was dropped or
  rewritten, self-heals on restart, no reset needed).
- A quick note on timing, since you asked: the month shown in "Goal award
  (August 2026)" only advances when someone runs **"Close month"** from the
  Admin panel — it does **not** advance automatically on the calendar date.
  If August 30 comes and goes and nobody closes the month, that label stays
  "August 2026" indefinitely (even into next year) until it's manually
  closed. This was a deliberate choice from the original Goal/Actual build
  — closing is a manual admin action so someone can double-check before it
  becomes permanent history — but it does mean the app won't remind you on
  its own; worth building a habit (or a scheduled reminder) around closing
  each month once real usage starts.

### "Actual" values that aren't really levels now show as not yet recorded (Aug 19)

You spotted a Roster row showing a raw date/time ("2026-08-12 00:00:00")
under Actual instead of a level or "not yet recorded" — that value came
straight from the source spreadsheet's ACTUAL/LWU cell for that student,
which had a date in it instead of a level code (most likely an
achievement-test date, not a curriculum position). These rows now just show
**"not yet recorded"**, the same as any other student with nothing entered
yet — no special styling, no warning.

- **6 enrollments** across the whole roster have this. They look completely
  normal in the Roster — no filter checkbox for them either, per your
  request.
- Fixing one is simple: open its Edit panel and set the real current
  level/page like normal.
- Self-heals on restart, no reset-db needed.

### Undo last edit (Aug 19)

You asked for a "ctrl z function or a history tab" — we talked it through
and went with the simple version: a one-level **undo last edit**, not a
full history tab.

- **Where it is**: an **Undo** button appears at the top-right of the
  toolbar right after you make a covered change, showing what it would
  undo (e.g. "Undo: edited Dela Cruz, Juan"). It disappears once there's
  nothing to undo. **Ctrl+Z** (or Cmd+Z on Mac) does the same thing, as
  long as you're not actively typing in a text field (so it never fights
  your browser's normal undo while you're mid-edit in a box).
- **What it covers**: adding a student/enrollment, editing a
  student/enrollment, correcting a past month's history, and correcting an
  ASHR award — the everyday single-record edits.
- **What it deliberately doesn't cover**: Close month, Lock in cycle,
  attendance toggles, and changing the admin password. Those are bigger,
  multi-record actions where a "one-click undo" could be misleading right
  after you've moved on to other things, so making any of those clears the
  pending undo instead of leaving a stale one sitting there.
- **One level only, no redo**: only the single most recent covered edit can
  be undone, and only once. Making another covered edit (or one of the
  actions above) replaces or clears whatever was pending.

### Level + page display: "3A130" everywhere, not "3A page 130" or "3A 130" (Aug 19)

Small formatting fix, applied everywhere a level and page show up together
(Roster's Actual column, the Goal column, the edit panel, monthly/historical
views): it's now one glued string with no space and no "page" word, e.g.
**"3A130"**. Only the *display* changed — nothing about how levels/pages are
stored, matched, or compared was touched, and a source cell's original raw
text (`current_level_raw` etc.) is never rewritten.

### Payments — tuition tracking, Statement of Account, and a come-back list (Aug 19)

You described a real day-to-day problem: no way to track whether a family
has paid for the month, whether a teacher's sent out the Statement of
Account reminders, or to tell the difference between a student who's
genuinely not coming back and one who just paid *really* late — which
matters because absent rate is tied to teacher incentives, and because
reporting a student as absent to head office when they actually paid late
creates a real mismatch. New **Payments** tab, plus a compact status badge
right on the Roster so it doesn't require switching tabs to see at a glance.

**Billing is per student, once a month** — one payment status covers all of
a student's enrolled subjects together (Math + Reading), matching how a
family pays one combined Kumon fee, not two separate ones.

**Statement of Account cadence**, per what you described: SOA1 goes out the
15th, SOA2 the 20th, SOA3 the 25th, SOA4 the 30th — the 25th is also the
actual tuition due date. The edit panel labels each date field with its day
so this doesn't have to be memorized.

**Three statuses**: **Unpaid** (nothing recorded yet, or SOA reminders sent
but no payment), **Absent (reported)** (a teacher has marked the student
"finally absent" — what actually gets reported to head office), and
**Paid**. A row only exists once something's actually been recorded for
that student that month — an untouched month just reads "Unpaid" by
default, same as how attendance already works.

**Late payment doesn't silently overwrite an absent report.** If a payment
comes in *after* a student was already marked "finally absent" for that
month (your example: a parent paying on the 15th of the next month), both
dates stay on the record — the status flips to **Paid**, but a small
**"late"** tag stays next to it (hover for the detail: paid on X, was
reported absent on Y). Nothing about what was already reported to head
office gets rewritten; the mismatch is just visible at a glance instead of
buried.

**Come-back list (4-month re-registration window)**: a toggle on the
Payments tab shows every currently-enrolled student who hasn't paid, sorted
into three groups computed from their last recorded payment — **within
window (1–4 months)**, the group eligible to come back without paying
registration again; **past 4 months**, who'd need to re-register; and **no
payment ever on record**, which shows up honestly rather than being
silently dropped or guessed at (this will mostly be everyone at first,
since payment tracking is brand new — the list fills in as months of real
data accumulate). This is also where the "historical absence data" you
asked about lives: payment records persist by month indefinitely (closing a
month doesn't touch them, so late payments can still be reconciled after
the fact), and the Payments tab has its own month picker to look at any past
month, same idea as the Roster's.

**"Needs attention" flag**: separate from payment entirely — for retention
concerns, like a parent hinting they might stop, or a student who needs
extra encouragement so their progress doesn't stall. Set from the same edit
panel as the payment record (a checkbox + a short note), shows as a small
red flag on both the Payments tab and the Roster, hover for the note.

**Not password-gated.** Unlike closed-month/ASHR corrections, this is
routine, frequent, teacher-facing data entry, not a correction to permanent
locked history — so there's no admin password prompt in the way. It is
covered by "Undo last edit" like the other everyday edit surfaces.

- **Known limitation**: the Payments tab's month picker only lists months
  that already have at least one payment record (plus whichever month is
  currently active) — there's no way yet to jump to a past month that has
  zero payment activity recorded. Not a problem in practice for reconciling
  a recent late payment (there's usually already *some* activity that
  month), but worth knowing if you ever want to backfill a truly untouched
  month.
- Self-heals on restart, no reset-db needed — new `payment_record` table
  plus two new columns on `student` (`needs_attention`,
  `needs_attention_note`).

### Bulk-marking SOA / paid on the Payments tab (Aug 19, same-day follow-up)

You asked for a way to update SOA reminders in bulk, since they actually go
out as one message to a whole group chat, not one text per parent. Every row
on the Payments tab now has a checkbox, plus a "select all" checkbox in the
header that selects everyone currently shown by your filters (so filtering
to one teacher or group first, then "select all", covers "mark SOA1 sent for
my whole class" in two clicks). Once anything's checked, a bar appears above
the table: pick which one thing to mark — SOA1/2/3/4 sent, or Paid — pick a
date (defaults to today, but you can pick a different one, e.g. backfilling
yesterday's SOA1), and Apply.

It only ever touches the one field you picked — marking SOA1 for a group
doesn't disturb anyone's existing SOA2/paid/absent data. Selecting anything
new (search, filter, or switching months) clears the checkboxes first, so
there's no risk of bulk-marking students you can no longer even see on
screen. Covered by "Undo last edit" the same as everything else — one click
reverses the whole batch, not just the last row.

### ASHR wasn't reflecting a Roster level edit — fixed for Math (Aug 19, same-day follow-up)

You noticed that editing a student's level on the Roster didn't show up on
the ASHR tab. Confirmed the underlying cause and fixed it for Math.

Every tab already re-fetches fresh data the moment you switch to it — that
part was already working. The actual bug was narrower: the ASHR live
preview was reading a *frozen* copy of each student's level (captured once,
at the original data import) instead of the live one you actually edit on
the Roster. Editing a level on the Roster always updated the live copy
correctly — it just never made it into ASHR's calculation. Fixed for Math:
an edited Math level now reflects on the ASHR tab immediately, no extra
step needed.

**Reading is a separate, deeper issue — flagged, not silently fixed.**
While verifying this fix against your real data, found that about 51
Reading enrollments have a pre-existing data problem from the original
import: the level's sub-marker (the "1"/"2" or "I"/"II" that follows a
Reading letter, e.g. the "1" in "D1") got recorded into the *page number*
field instead of a real page — so a genuine "D1, page 190" record shows
internally as "level D, page 1," and the real page 190 isn't captured
anywhere except the original raw import text. Applying the same fix to
Reading would have started trusting that broken page number instead of the
still-correct original text, which would have been a step backward, not
forward — so Reading was deliberately left as-is rather than guessed at.
Net effect (as of Aug 19): editing a *Math* student's level now reflects on
ASHR right away; editing a *Reading* student's level doesn't yet, until this
deeper data issue gets a real fix. Bringing this to you directly rather than
picking a fix myself, since it touches real recorded data for real
students.

### Reading now real-time too, plus the level list itself was wrong (Aug 20, same-day follow-up)

You corrected something important the next day: the Reading levels aren't
"a letter with a page-position sub-marker" the way I'd modeled them — every
letter grade A through I is really **two separate, complete Reading levels**
(AI and AII, BI and BII, ... HI and HII), each with its own full page range,
exactly the way Kumon's own "Table of Learning Topics" flyer lays them out.
That's a meaningfully different (and more accurate) model than what the
original data extraction assumed, so this went further than just finishing
yesterday's page-number fix.

**What was actually broken, once checked against the real level list:**
47 Reading enrollments (not the ~51 estimated yesterday — that first count
accidentally swept in a few unrelated cells where a teacher had written two
things in one box, e.g. an achievement-test date alongside the level) had a
level parsing problem, in one of two shapes:
- **Lost page number** (39 rows) — a level written with an attached digit
  sub-marker, like "D1 190", got read as level "D" page 1, dropping the real
  page 190 entirely (the digit got mistaken for the page).
- **Wrong letter entirely** (8 rows, all under Francis's group) — a level
  written with a hyphen, like "G-I 100", got read as level "I" — not just a
  wrong page, but two to three whole curriculum levels off from where that
  student actually is. Worth knowing: **this only affected what the Roster
  showed** — ASHR's live preview was, and always had been, reading the
  original correct raw text for Reading (that's the whole reason Reading was
  held back yesterday), so no ASHR award was ever computed wrong. Only the
  Roster's own "Current level" display was wrong for these 8 students.

**Fixed at the source, not patched over.** All 47 rows had their level and
page corrected directly, using each enrollment's own original import text as
the source of truth (never guessed) — spelled out to the correct canonical
form, e.g. "D1 190" → level "DI", page 190; "G-I 100" → level "GI", page 100.
This is a one-time correction, not something that re-runs and could ever
undo a level you've since edited yourself in the app — it's guarded so it
only ever applies once, and only to rows still holding their exact original
mis-parsed text.

**Reading is now real-time too.** With the level data now trustworthy, the
ASHR live preview switched Reading over to the same "read the live edited
field" behavior Math already had — editing a Reading student's level on the
Roster now shows up on the ASHR tab immediately, the same as Math.

**The Roster's level dropdown now offers real Reading levels.** Previously
it only ever showed Math-style bare letters (A, B, C...) no matter which
subject you were editing — there was genuinely no way to correctly enter a
Reading sub-level through the app before today. It's now subject-aware: pick
Reading and the dropdown shows AI/AII through HI/HII plus I-I/I-II (Level I's
own special case, since concatenating I + I is hard to read as "II" — this
already matched how ASHR computed Reading tiers internally), while Math
keeps its existing A-O list. The same fix applies to the level fields on the
historical-record correction panel.

Verified this thoroughly given it corrects real recorded data: re-derived
the correct level for every one of the 236 Reading enrollments that had both
a raw import value and a parsed level (not just the ones already suspected),
confirming exactly 47 needed correction and 189 were already right; diffed
the full ASHR output before and after this change across the real database
(same method that caught last night's near-miss) — of the 47 corrected rows,
36 showed only a cosmetic level-text change with the identical award result,
3 were already displaying identically (their source text happened to
already use the correct hyphen notation), and 8 correctly resolve to no
award either before or after (their real level, even corrected, doesn't
cross a qualifying threshold for their grade) — zero unexpected changes
anywhere else, zero changes to Math. A real edit-and-undo pass through the
actual UI confirmed a Reading level edit shows up on the Roster and ASHR
immediately, and Undo correctly reverts both together.

### Schedule times: a Saturday-PM bug, and the fix (Aug 20, same-day follow-up)

You flagged something real: some students' schedules showed a Saturday
session in the afternoon or evening, when the center is only open Saturdays
until noon. Traced it to a genuine parsing bug, not bad source data.

**The bug:** when a raw schedule-time cell held two times separated only by
a space — no slash, no line break, e.g. `"6:30 PM 10:30 AM"` — the schedule
parser (`lib/schedule.js`) only ever pulled the *first* time out of that
cell. With one time and two scheduled days, it broadcast that single time to
every day instead of pairing each day with its own time — so a Tue/Sat
student showed **both** days at 6:30 PM, when the source plainly carried a
second, correct time (10:30 AM) for Saturday that was simply getting
dropped. The same failure mode also hit a handful of weekday pairs, not just
Saturdays, wherever two distinct times shared one un-delimited cell — which
is why the re-scan checked every day, not only Saturday.

**Scope, checked precisely, not guessed:** re-parsed all 1,172 active
enrollments' raw schedule text with a corrected extractor (one that pulls
every time-like token out of a cell, not just the first) and diffed the
result against what was actually stored. 1,095 were already correct. 72
would change. Of those, 66 were clean, unambiguous fixes — you reviewed the
full list and approved applying them. The other 6 were deliberately left
alone and flagged instead of auto-corrected, because the source itself was
unreliable for those specific rows:
- Two rows where the raw cell held **two PM times and no AM time at all**
  (e.g. "6:00 PM 10:00 PM") — likely a typo in the original sheet, but not
  something to guess at.
- One row where the source itself marks a day `(IC/RI)` — genuinely
  ambiguous in the source, same issue as the RI/IC audit below.
- One row where the raw time was typed with a letter "O" in place of a
  digit ("4:3O PM"), making the parse unreliable regardless of this fix.
- One row where the fix corrects Saturday but a different, pre-existing
  issue (an implausible 2:00 AM Friday time) is untouched by it.

**Fixed at the source, guarded the same way as the Reading level repair.**
Applied by exact `schedule_slot.id`, with the update guarded on that row's
`time24` still matching what it was found as during the audit — if a
teacher had already hand-corrected one of these slots since, the guard
fails closed and that row is left alone rather than silently reverted. Runs
once, never re-applies.

Verified against the real database: before the fix, 94 active enrollments
had a Saturday slot after 12:00 PM; after, 38 remain (all outside the 66
applied here — either one of the 6 flagged rows, or an existing
"ambiguous, needs review" case unrelated to this bug, or a schedule that
was already correctly parsed as a genuine Saturday-afternoon booking).
Spot-checked several corrected rows directly against the database and
against the live `/api/calendar` output after starting the server — both
match the expected corrected times exactly.

### RI / IC (Remote Instruction / In-Center), confirmed in the source but not yet modeled (Aug 20)

Investigated whether RI/IC designations are really recorded per scheduled
day in the source spreadsheets, as opposed to being one flat property of an
enrollment. They are — confirmed directly: entries like `"MON (RI) FRI
(IC)"` and `"MON-FRI (RI) SAT (IC)"` appear throughout the schedule cells,
sometimes with a same-day time already tagged too. Not recorded consistently
across every teacher's sheet, though — some sheets mark it constantly,
others don't mark it at all. Per direction: where the source doesn't mark a
day, it defaults to IC unless explicitly marked RI. This hasn't been built
into the schema or UI yet — that's still pending as its own piece of work.

Also found, while looking: Mark's and Erickson's report sheets (the H-O
group) each have a hidden `"SUMMER TIME SCHED"` column with real, different
per-student time values, never extracted into the platform. Confirmed this
is outdated and should be ignored — the visible `SCHEDULE` column remains
the one in use.

### "Goal" is a target curriculum level again, reverting the Aug 19 award change (Aug 20, same-day follow-up)

The Master Platform Specification clarified that Goal was never meant to
become an ASHR award — that Aug 19 change was based on a real but
incomplete reading of what Nina meant. Her fuller direction: "the goal
should NOT be ASHR... return to the original concept of a student's
monthly academic goal... target level by the end of the month." Reverted
Goal back to level-based everywhere.

**What changed**: the live edit panel's "Goal award" dropdown is a "Goal
level" + "Goal page" pair again, subject-aware the same way "Current level
(actual)" already is (so a Reading enrollment gets Reading's Roman-numeral
levels, not Math's). The Roster table's Goal column and the historical
month-browsing views render it with the same "3A130" glued level+page
format used for Actual, instead of a tier badge. The historical-record edit
panel dropped its separate "Goal award" field and legacy-level framing —
Goal level/page is just the normal, only Goal field there now. "Close
month" archives `goal_level`/`goal_page`/`goal_level_raw` into
`monthly_progress` again, matching how the real Jan–Jul backfilled history
already stores Goal.

**No data migration needed**: checked first — zero enrollment or
monthly-progress rows had ever gotten a `goal_award` value written to them
in the roughly one day that field was live, so there was nothing to
convert back. The `goal_award` column stays on both tables (schema is
never dropped, same self-heal philosophy as everywhere else in this app)
but is now dormant — nothing reads or writes it going forward.

**Verified**: `node --check` on every changed file; a programmatic sweep
confirming every `el('...')` ID referenced in `app.js` still exists in
`index.html` (zero missing, 141/141); a full round-trip against an
isolated copy of the real database — set a goal level/page through the
live edit panel's route, confirmed it read back correctly, ran a real
"Close month," confirmed the goal archived into `monthly_progress` exactly
as entered and cleared for the new active month, and confirmed the
password-gated historical-edit route still rejects a wrong password
correctly (its underlying goal_level/goal_page logic was untouched by this
change, so this just reconfirms the route itself still works end to end).

### Goal award is back too, alongside Goal level — not a replacement this time (Aug 20, same-day follow-up)

Right after the level-only revert above, Nina asked for the award back too
— "i also want goal award :)". Since the last two changes had swapped Goal
between level and award, confirmed exactly what she meant before touching
anything: both fields, shown and editable together, in the same places
Goal level already appears (edit panel + Roster column), not a third swap.

**What changed**: the live edit panel now has a "Goal award" dropdown
(KIS/Bronze/Silver/Gold/ASF) sitting right below "Goal level / Goal page"
— two independent fields, not a toggle between them. The Roster table
gained a new **Award** column between Goal and Actual, rendered as the
same colored tier badge the ASHR tab already uses. The roster-wide
month-browsing view and each student's per-subject monthly-history table
both gained the same Award column. The historical-record edit panel's
"Goal award" field is back too, alongside (not replacing) Goal level/page.
"Close month" now archives `goal_award` into `monthly_progress` again,
right alongside `goal_level`/`goal_page`/`goal_level_raw`, and clears all
four on the live enrollment for the new month.

**No schema change needed**: `goal_award` was never dropped when it went
dormant a few minutes earlier in the same day (see above) — this just
resumes reading and writing a column that was already sitting there,
`CHECK` constraint and all. The password-gated historical-correction
endpoint (`updateMonthlyProgress` in `server.js`) had actually never
stopped writing `goal_award` even while the field was hidden from the UI,
so no server-side change was needed there at all — only the endpoints that
had stopped *sending* an award value (`createEnrollment`, `updateEnrollment`,
`closeActiveMonth`, and the `listEnrollments` read query) needed updating.

**Verified**: `node --check` on every changed file; `el('...')` ID sweep
(143 referenced, 0 missing); a full round-trip against an isolated copy of
the real database — set both Goal level/page and Goal award together on
one enrollment through the live edit panel's actual save route, confirmed
both read back independently and correctly, ran a real "Close month" and
confirmed both archived together into `monthly_progress` and both cleared
correctly on the live enrollment for the new month, and confirmed the
password-gated historical-edit route still works with a `goalAward` value
included in the request body.

### Goal field labels: "Goal level (EOM)" and a live ASHR-cycle hint on "Goal award" (Aug 20, same-day follow-up)

Right after seeing the new Award field, Nina flagged the labeling as
confusing: "Goal level" was hinted with the current live month (e.g.
"(August 2026)"), and "Goal award" had no hint at all. She asked for "Goal
level (EOM)" — a static "end of month" label, since the field always just
means "by the end of whichever month is currently live" and doesn't need
the specific month spelled out redundantly next to the always-visible
status bar above it — and for "Goal award" to carry its own dynamic hint
showing which ASHR cycle it's targeting: "(August 2026)" right now, then
"(February 2027)" once that cycle actually gets locked in, matching Kumon's
real August/February award cadence.

**"Goal level" hint**: simplified to a static `(EOM)` baked directly into
`index.html` — the JS in `loadActiveMonth()` no longer touches this hint at
all (it still updates the status bar and Admin panel text, just not this
field).

**"Goal award" hint**: new `#goalAwardCycleHint` span, populated by a new
`updateGoalAwardCycleHint()` in `app.js` that reads the *live* (unlocked)
entry out of `state.ashr.cycles` — the exact same cycles list the ASHR tab
already fetches (`/api/ashr/cycles`, via `lib/ashr.js`'s existing
`cycleLabel()`/`nextAshrCycle()`). This is called every time cycles reload:
on page load, on switching to the ASHR tab, and — importantly — right after
a real "Lock in cycle" admin action, so the label flips from "August 2026"
to "February 2027" the moment that action actually runs, not on any
hardcoded calendar date. (Nina mentioned expecting to run it around
October; the app doesn't assume that — it just reflects whatever the real
active cycle is, whenever she gets to locking it in.)

**Deliberately scoped to the live edit panel only**: the historical-record
correction panel's "Goal award" field (`#h_goalAward`) was left without a
cycle hint — a past month's record doesn't have a clean "current live
cycle" to point at the way the live panel does, and guessing which cycle a
long-closed month's award was actually targeting isn't something to invent
without asking first.

**Verified**: `node --check` on all three changed files; `el('...')` ID
sweep (143 referenced, 0 missing, including the new `goalAwardCycleHint`);
a real end-to-end pass against an isolated copy of the real database —
confirmed `/api/ashr/cycles` reports the live cycle as `2026-08` /
"August 2026" today, opened the edit panel and confirmed both hints render
correctly ("(EOM)" and "(August 2026)"), then ran a real `/api/ashr/lock`
call and confirmed the *next* page load's edit panel correctly shows
"(February 2027)" instead — the hint tracking the real cycle state, not a
cached or hardcoded value.

### Goal field label alignment fix (Aug 20, same-day follow-up)

Nina flagged (via screenshot) that "Goal level (EOM)" and "Goal page
(1–200)" no longer lined up — the "Goal level" dropdown sat one line lower
than "Goal page"'s input. Root cause: each label is a column-direction flex
container, and its direct children each become their own stacked row — the
label text and the `(EOM)`/cycle-hint `<span>` were separate sibling nodes,
so they stacked as two rows instead of reading as one line, while "Goal
page" (a single text node, no hint span) stayed one row. Fixed by wrapping
the label text and its hint together inside one `<span class="field-label-text">`,
so they render as a single flex item again. Verified with a real Playwright
check: both dropdowns now sit at the exact same pixel `y` position.

### Weekly Calendar: subject-only coloring everywhere, blue=Math/red=Reading (Aug 20, same-day follow-up)

Picked up the next item from the Master Platform Specification: the
Weekly Calendar's chip coloring had two different rules depending on which
filter was active — the true center-wide view (no Teacher or Group filter)
colored chips by the student's team group (5 colors), while any filtered
view colored by subject instead (green=Math/blue=Reading at the time).
This meant the exact same chip could show a different color depending on
what you happened to have filtered to — the inconsistency Nina flagged
directly in the spec, and separately clarified (via the "Change M to Blue /
R to Reading" line in spec §6) as meaning this same calendar color rule,
not a Roster text-label change: **Math should be blue, Reading should be
red, everywhere, with no center-wide/filtered split.**

**What changed**: `loadCalendar()` in `app.js` now always colors chips by
`subjectClass()` (Math/Reading) — the `centerWide` branch and the
`groupSlug()` helper it depended on were removed outright, since they had
zero remaining callers once subject coloring became unconditional (same
"pure display helper with nothing to preserve" treatment as `fmtGoalAward()`
got during the Aug 19/20 Goal changes). The Day/Teacher/Group *filters*
themselves are completely unaffected — you can still filter the calendar to
one teacher or one group, only the chip color no longer changes based on
that.

**Color choice**: Math reuses the exact blue Reading used to have
(`#e9edfb` / `#3548a8` — already tested, no reason to invent a new blue).
Reading gets a new red (`#fbeaea` / `#b3261e`) — deliberately *not* the same
red already used for `.badge-dropped` / `.payment-badge.absent`
(`var(--danger)`), so a perfectly normal Reading session doesn't visually
read as an error or a dropped/absent student next to those. The five
`.cal-chip.group-*` CSS rules, now fully unused, were removed along with
the coloring logic that referenced them.

**Verified**: `node --check` on all three changed files; `el('...')` ID
sweep (143 referenced, 0 missing — no HTML ids changed in this pass); a
real Playwright pass against an isolated copy of the real database — the
center-wide view and a teacher-filtered view (JOFEL) both now render only
`cal-chip math` / `cal-chip reading` classes, zero `group-*` classes in
either; visual screenshots confirmed the same blue/red pair renders
identically in both views; a full regression check confirmed the Roster
(1,205 rows), ASHR (328 rows), and Payments (991 rows) tabs still return
their expected counts, since this was meant to be calendar-only; confirmed
the real production database was untouched (this was a pure frontend
change — no schema, no server route touched — verified by re-checking the
enrollment count directly against the real `data/roster.db` afterward).

## Same-day follow-up: RI/IC (Remote Instruction / In-Center) per scheduled day (Aug 20, 2026)

The next Master Platform Specification item picked up after the Weekly
Calendar color change: RI/IC as a real, editable part of the schedule
instead of just a confirmed-but-unbuilt fact. Phase 1 of the spec audit had
already confirmed this really is recorded per scheduled day in the source
data (103 rows had an explicit marker somewhere in the schedule cell), just
inconsistently across teachers' sheets, and confirmed the rule for when it's
not marked: defaults to IC (In-Center) unless a day is explicitly marked RI.

**Marker vocabulary, confirmed before building anything**: re-scanning the
actual raw extraction text (`extract/raw_enrollments.json`, the same text
stored in `subject_enrollment.schedule_days`) turned up a few different
spellings for the same two ideas, not just plain "(RI)"/"(IC)" — "(ONLINE)"
and "(PURE ONLINE)" (11 rows, all Queenie), and "F2F" (1 row, sometimes not
even parenthesized). Also found two rows with a literal, self-contradictory
"(IC/RI)" marker, and three rows with an unrecognized "(CV)" marker (Mira,
Sugar). Asked Nina directly rather than guessing: confirmed ONLINE/PURE
ONLINE = RI and F2F = IC (standard synonyms), and confirmed to leave both
the "(IC/RI)" and "(CV)" rows flagged for her review instead of picking a
side.

**Data model**: `schedule_slot` gained `mode` (`'RI'`/`'IC'`, defaults to
`'IC'`) and `needs_mode_review` (self-healing `ALTER TABLE`, same pattern as
every other migration in this app — the `DEFAULT 'IC'` backfills every
already-seeded slot to In-Center the moment the column is added, matching
the confirmed default rule with zero extra work).

**Parser** (`lib/schedule.js`, new `parseModePerDay()`): walks each raw
schedule-days line, splitting on `(...)` markers and attaching each marker
to whichever day token(s) immediately precede it on that line (so "MON (RI)
FRI (IC)" resolves Mon→RI, Fri→IC independently, while "TUES FRI (RI)"
resolves both Tue and Fri to RI, since nothing separates them from the one
marker). A day mentioned with no marker at all — the overwhelming majority
of the roster — resolves to IC. An unrecognized or literally ambiguous
marker resolves to `mode: null, flagged: true` instead of a guess.

**One-time backfill** (`backfillScheduleMode()` in `lib/db.js`, guarded by
an `app_state` flag so it only ever runs once): re-derives per-day mode from
each enrollment's original raw `schedule_days` text and applies it to the
matching `schedule_slot` row(s) by day. Run against the real production
database: 2,271 slots touched, 72 resolved to RI, 5 left flagged
(`needs_mode_review`) — matching the marker-vocabulary review above exactly
(2 "(IC/RI)" rows + 3 "(CV)" rows). Deliberately one-time and guarded, not a
recurring self-heal, for the same reason the Reading-level and
schedule-time repairs are: once the UI below lets a teacher set RI/IC by
hand, this must never silently revert that edit back to what the original
import text said.

**Known gap surfaced, not fixed here**: two enrollments (ARMA, LUIZ MIGUEL
— Math and Reading; DELFINADO, YVAM CZARINA — Math) use a compressed/range
day notation ("TTHF", "MON-FRI") that the day-tokenizer has never
understood, in either the original schedule extraction or this new mode
parser — those specific days were already missing from `schedule_slot`
before this feature, not something it introduces. Worth a manual fix
whenever someone's looking at those two students' schedules directly.

**UI — schedule editor**: each day row in the Mon–Sun schedule picker (in
the Roster edit panel) now has a small IC/RI dropdown next to its time
field, disabled until that day is checked, defaulting to IC. Saving an
enrollment always writes an explicit mode for every checked day — including
clearing `needs_mode_review` for a previously-flagged slot, since a real
save is no longer ambiguous.

**UI — Weekly Calendar**: a new "All modes / In-Center only / Remote
Instruction only" filter alongside the existing Teacher/Group filters.
Chips don't get a second color for mode — color is already spoken for by
subject (blue=Math/red=Reading) — instead an RI chip gets a small "RI" text
tag, and a flagged chip gets a small "?" tag with a tooltip explaining the
source was ambiguous. IC (the default/common case) gets no tag at all, to
keep the calendar's normal state visually clean.

**Verified before delivery**: `node --check` on all five changed/new files;
`el('...')` ID cross-check (0 missing, including the new `calModeFilter`
id); direct unit tests of `parseModePerDay()` against every real marker
pattern found in the source data (RI/IC/ONLINE/PURE ONLINE/F2F/CV/IC-RI, and
the multi-day-per-marker cases); a full backfill run against an isolated
copy of the real production database (never the production file) confirming
the exact counts above and confirming a second run is a no-op (guard
works); a real end-to-end save-and-undo cycle through the actual API — set
a slot's mode to RI, confirmed it read back correctly, undid the edit, and
confirmed the mode reverted along with the day/time; a full regression
check confirming Roster (1,205 rows), ASHR (328 rows), Payments (991 rows),
and calendar (2,222 rows) endpoints all still return their expected counts;
Playwright screenshots of the schedule editor (both an unmarked Math
enrollment showing IC/IC, and the same student's Reading enrollment showing
the correct pre-selected RI on Wednesday) and the Weekly Calendar (RI tags
and a flagged "?" tag both rendering correctly, filtering to RI-only
working); confirmed the real production database was untouched throughout,
since all mutation testing happened against an isolated `/tmp` copy that
was deleted afterward along with the test server process.

Delivered as an updated `kumon-roster-app-with-ashr.zip` (same filename,
replaces the Weekly-Calendar-color version delivered earlier).

## Same-day follow-up: real tuition amounts on the Payments tab (Aug 20, 2026)

Right after RI/IC landed, Nina asked to move on to tuition/billing groups/SOA
— confirmed via `AskUserQuestion` as a three-tier scope (tuition + amounts;
+ billing groups; + a full consolidated SOA document), and she picked the
smallest first slice: **tuition + real amounts**, no billing groups or SOA
document yet. This turns the Aug 19 Payments tab from a boolean-ish "has
this been marked paid" tracker into a real Amount Due / Amount Paid /
Remaining Balance / Advance-Credit / Previous Balance picture, per the Aug
20 Master Platform Specification's Parts 7 and 9 and Non-Negotiable Rules
15-17 and 37-40.

**New pure module** (`lib/tuition.js`, mirrors `lib/ashr.js`/`lib/payments.js`
— no database access): the confirmed rate table (₱2,200/subject/month for
PK1-PK3/K/Grades 1-6, ₱2,350/subject/month for Grade 7 through College,
reusing `lib/ashr.js`'s existing `normalizeGrade()` so every feature agrees
on what a grade string means) and `computeTuitionDue(normalizedGrade,
activeSubjectCount)`, which returns `amountDue: null` (flagged, not guessed)
for a missing or unrecognized grade rather than silently treating it as ₱0.
Checked against every real grade value in the production database (`P1`-
`P14`, `PK1`-`PK3`, `K`, and `null`) — the below/above-Grade-7 split lands
exactly where expected for all of them, including grades above the ASHR
tables' own P11 ceiling (P12-P14), since the tuition rule is a single
`>= Grade 7` threshold, not a bounded table like ASHR's. 28 active students
currently have no grade on record at all — each now shows a small "?" flag
next to their tuition amount instead of a misleading ₱0, both on the
Payments tab and in the edit panel.

**Full monthly summary** (`computePaymentSummary()` in `server.js`,
db-backed, calls into `lib/tuition.js` and an amount-aware rewrite of
`lib/payments.js`'s `resolvePaymentStatus()`): tuition due (rate × count of
currently *Active* subject enrollments), a previous balance carried forward,
any advance/credit auto-applied from a prior month's overpayment, the
amount actually paid this month, and the resulting remaining balance and
status — now genuinely five states (**Paid**, **Partially Paid**,
**Advance / Credit**, **Unpaid**, **Absent (reported)**) instead of the old
three. The paid-late-after-reported-absent reconciliation behavior from Aug
19 is unchanged — both dates are still kept, never silently overwritten,
now only firing when the amounts actually net out to fully paid.

**Previous balance only looks one month back**, and only if that prior
month already has a `payment_record` row — deliberately bounded rather than
walking arbitrarily into the past. `payment_record` didn't exist before Aug
19, 2026, so retroactively inventing a multi-month debt history for months
nothing was ever recorded in would be a guess, not a fact. From Sept 2026
onward the chain is real: verified end-to-end against the real production
database (isolated copy) — a ₱2,000 partial payment against a ₱4,400 due
correctly showed ₱2,400 remaining; a ₱5,000 payment against the same ₱4,400
due correctly showed "Advance / Credit" with ₱600 credit, and creating a
September record for the same student correctly auto-applied that ₱600
against September's own ₱4,400 due (₱3,800 net); a second student paid
₱1,000 of a ₱2,200 due in August and, with nothing paid in September,
correctly carried the ₱1,200 shortfall forward as a real previous-balance
debt (₱1,200 + ₱2,200 = ₱3,400 owed).

**Legacy rows aren't rewritten, just read differently**: a `payment_record`
row from before this feature (Aug 19-20) has `paid_date` set but
`amount_paid` still `NULL` — before amounts existed, "Paid" could only ever
have meant the full amount was received, so `effectiveAmountPaid()` reads
that specific combination as "paid in full" *at computation time only*,
never writing a guessed number back into the row. Verified directly: a
manually-inserted legacy-shaped row (`paid_date` set, `amount_paid` NULL)
correctly resolved to "Paid" with the full computed amount; adding a
`marked_absent_date` to the same row correctly triggered the existing
"reconciled, paid late" note.

**Bulk "Mark paid" now means "bring this student's own balance to zero"**,
computed individually per selected student (their own rate × their own
active-subject count, plus any previous balance/advance credit) — never one
shared literal number, since a bulk-selected group can freely mix grades
and subject loads. A student whose tuition can't be computed (grade
missing/unrecognized) is skipped rather than marked paid against an unknown
amount, and the skipped student IDs come back in the response so the UI can
surface exactly who needs a manual look. Verified: bulk-marked 3 selected
students (2 ordinary + 1 flagged) — the 2 ordinary students were each set
to their own correct due amount, the flagged student was left completely
untouched, and the bulk action's combined undo reverted both marked
students byte-for-byte.

**Come-back list is now amount-aware**: "last paid month" used to mean
"any month with a `paid_date` logged," which would have wrongly treated a
partial payment as fully caught up. It now only counts a month where the
computed status actually resolves to `paid` or `advance`.

**UI**: three new Payments-tab columns (**Tuition**, **Paid**, **Balance** —
balance in red when still owed, green "credit" when a student has overpaid),
the summary strip now shows all five statuses, the status filter gained
Partially Paid and Advance / Credit, and the edit panel's old single "Paid
on" field became a **Tuition & payment amount** section (a read-only
computed breakdown — due, previous balance, advance applied, total
currently owed — plus an editable "Amount paid this month" number field)
with "Marked finally absent on" moved into its own **Attendance reporting**
section, keeping payment amounts and absence reporting visibly distinct per
Rule 14 ("attendance and payment status are separate"). The Roster and
monthly-history payment badges pick up the richer status set automatically,
since they share the same `attachPaymentStatus()`/`computePaymentSummary()`
path as the Payments tab now (previously they only read `paid_date`/
`marked_absent_date` directly).

**Known caveat, stated plainly rather than silently**: tuition due for
*any* month — including Jan-Jul 2026 history, from before payment tracking
existed — is always computed from the student's **current** grade and
**current** Active subject enrollments, since this app has no historical
snapshot of grade/subjects per month yet. A past month's displayed "amount
due" reflects today's roster, not that month's.

**Explicitly out of scope for this pass** (Nina's own choice via
`AskUserQuestion`): billing groups (grouping multiple students under one
payer/SOA sender), the consolidated SOA document itself, and the "Group
Payment Allocation" open question from the Master Platform Specification —
none of these are guessed at or partially built; they're the next two
tiers of the same scoping question, ready whenever Nina wants to continue.

**Verified before delivery**: `node --check` on every changed/new file
(`lib/tuition.js`, `lib/payments.js`, `lib/db.js`, `server.js`,
`public/app.js`); `el('...')` ID cross-check between `app.js` and
`index.html` found 146 unique referenced IDs, 0 missing; the rate-table
check against every real grade value in the production database (above);
the full amount-math walkthrough above (partial, advance/credit, previous
balance carrying forward, legacy-row fallback, reconciliation) run against
an isolated copy of the real production database, never the production
file; bulk-paid + its undo, including the flagged-student skip; a full
regression check confirming Roster (1,205 rows), the Payments list (991
students, 28 correctly flagged), monthly-progress history (March 2026, 892
rows), and ASHR (Aug 2025 cycle, 161 rows) all still return their expected
shapes; Playwright screenshots of the Payments tab (columns, summary strip,
edit panel with the tuition breakdown, the bulk bar), the status filter,
and the Roster tab confirmed to show the richer badge on a real fresh page
load; confirmed the real production database was untouched throughout
(byte-for-byte identical `md5sum` before and after), since all mutation
testing happened against an isolated `/tmp` copy that was deleted
afterward along with the test server process.

Delivered as an updated `kumon-roster-app-with-ashr.zip` (same filename,
replaces the RI/IC version delivered earlier).

## Same-day follow-up: merged 17 duplicate student records (Aug 20, 2026)

Right after the tuition-amounts feature shipped, Nina noticed some two-subject
students were showing up as two separate ₱2,200 charges instead of one
combined ₱4,400, and asked why. Investigated against the real production
database rather than guessing: the tuition math itself was correct (grade +
active subject count on a given student record) -- the actual cause was that
some students exist as **two separate `student` rows**, the same real kid
entered under two slightly different name spellings on two different
teachers' original source sheets (almost always a missing/extra middle name
or initial, e.g. "FARZANA" vs "FARZANA M."), one row holding just Math and
the other holding just Reading. This was the exact same near-duplicate-record
issue flagged as a heads-up back on Aug 19 (Farzana Abdulcarim was literally
the example used then) -- not acted on at the time since it was out of scope,
now confirmed to have a real billing impact.

**Scope of the problem**: found 31 near-duplicate name pairs/groups in the
991-student roster. Of those, 18 had the exact split-Math/Reading-across-two-
records pattern described above (checked by comparing each pair's active
subject enrollments). Presented the full list to Nina with identifying
details (grade, teacher, subject) for her to confirm which were genuinely the
same kid vs. coincidentally similar names (e.g. siblings) -- her call, not
guessed at, since the two records' schedule/teacher/history could legitimately
differ for two different real children.

**Nina confirmed 17 of the 18 as the same student** (13 originally flagged as
confident, plus 4 more she confirmed by name: Johaiber, Zishan, Naveen,
Nailah). The 18th (Barago -- three near-duplicate records, not just two, with
two of them having overlapping monthly-progress months that don't cleanly
combine) was left out and flagged back to her for a closer look, since a
clean merge wasn't possible without deciding which record's conflicting
month-by-month data is correct.

**Merge mechanics**: for each confirmed pair, moved every child row --
`subject_enrollment`, `monthly_progress`, `ashr_award`, `payment_record` --
from the duplicate record onto the surviving one (not just the subject
enrollment; losing monthly-progress or ASHR history in a merge would have
been its own data-loss bug), OR'd in `needs_attention` if only the duplicate
had it set, then deleted the now-empty duplicate `student` row. Verified
before touching real data: exactly one of the 17 pairs (this was actually
checked across all 18, including the deferred Barago case) would have hit a
`monthly_progress` unique-constraint collision on a blind merge -- that
turned out to be Barago, reinforcing that it needed to be held out rather
than merged.

**"Surviving" record chosen per Nina's instruction** -- whichever of the two
records already had more monthly-progress/ASHR history attached, ties broken
toward the lower id (the earlier-created record). This is a real, if minor,
judgment call: it means the kept name is whichever spelling happened to be
on the more-populated record, not necessarily the "more correct" spelling --
worth a glance if a name looks off after this.

**Implementation**: this is real per-student data, so it follows the same
one-time, explicitly-enumerated, guarded-migration pattern as the Aug 20
Reading-level and schedule-time repairs (`lib/db.js`) -- a hardcoded list of
17 `{dup, keep}` name pairs, matched by **exact `(last_name, first_name)`
string**, not by numeric id, so this stays correct even against a freshly
reseeded database where ids could land differently. Gated by the
`duplicate_students_merged_2026_08_20` `app_state` key so it can only ever
run once; if a named record has since been edited or already merged, the
lookup simply finds nothing and that pair is skipped (not force-applied) --
same "fails closed" precedent as the other repairs. Self-healing: existing
installs pick this up on their next restart, no `reset-db` needed.

**Verified before applying**: built and ran the exact merge logic against an
isolated `/tmp` copy of the real production database first (not the real
file) -- confirmed all 17 canonical records ended up with both Math and
Reading correctly active, all 6,587 `monthly_progress` rows and all 325
`ashr_award` rows preserved (just consolidated onto 974 students instead of
991, since only child rows move, none are dropped), all 17 duplicate rows
actually gone, and the live app (via a real API call against the merged
copy) showing Farzana Abdulcarim and Zishan Mangotara each as one row with
the correct combined ₱4,400 due and both teachers listed. Only after that
passed was the guarded migration wired into `lib/db.js` and re-verified the
same way, plus confirmed a second run against an already-merged database is
a true no-op (idempotent, no error, no double-processing) and confirmed the
real production database was backed up (`data/backups/`, excluded from the
delivered zip) before the migration touched it for real.

Delivered as an updated `kumon-roster-app-with-ashr.zip` (same filename,
replaces the tuition-amounts version delivered a few minutes earlier).

## Same-day follow-up: Barago + Abañeta, and a wider accent-aware re-scan (Aug 20, 2026)

Nina answered on the deferred Barago case ("yup its a subbking" -- confirming
Christianne Pia is a different, older sibling, not a duplicate) and separately
caught a second duplicate herself while reviewing the live Payments tab:
"ABANETA, EURACE JAKE JR." (Francis, Math) and "ABAÑETA, EURACE JAKE JR."
(Lycka, Reading) are the same student.

**Barago, resolved**: merged "Christianne Noelle Mae" (id 427, Math) into
"Christianne Noelle Mae S." (id 793, Reading) -- same grade (P3), same
2023-05-21 enrollment date, names differing only by the trailing "S.".
Verified the two records' `monthly_progress` history has zero month
collisions on their own (the collision that blocked the original pass was
entirely between Christianne Pia and Christianne Noelle Mae S. -- i.e.
between the two real, distinct siblings' own Reading histories, which is
expected and itself further evidence Christianne Pia is a real separate
student). "Christianne Pia" (id 792) was left completely untouched.
Implemented as `mergeBarago()` in `lib/db.js`, its own guarded one-time
migration (own `app_state` key) rather than added to the original 17-pair
list, specifically because that first migration had already run against this
database by the time this confirmation came back -- reusing its key would
have made this pair a permanent no-op.

**Abañeta, resolved, and why it was missed the first time**: the original
near-duplicate scan matched students by *exact* `last_name` string equality,
so "ABANETA" and "ABAÑETA" (plain N vs Ñ) never grouped together, even though
they're the same name. Merged "ABANETA" (id 770, Math, Francis) into
"ABAÑETA" (id 269, Reading, Lycka) -- same grade (P4), zero
`monthly_progress` collisions, `mergeAbaneta()` following the identical
guarded one-time-migration pattern with its own key.

**Wider re-scan prompted by this miss**: re-ran the near-duplicate search
with the last name normalized to strip diacritics (`ABAÑETA` -> `ABANETA`
for comparison purposes only, never for display/storage) before grouping,
*and* checked every pair within a name-group individually rather than only
whole-group patterns -- the earlier method could miss a genuine split pair
sitting inside a larger group that also contains an unrelated sibling (e.g.
a 3-student "LABAO" group where two of the three are a genuine Math/Reading
split and the third is a real, different sibling with both subjects already
-- the whole-group check saw "someone here already has both subjects" and
never looked at the sub-pair). This surfaced **4 further candidates**, all
same-grade, single-subject-each, near-identical names, zero
`monthly_progress` collisions if merged: Macumbal (Muhammad/Mohammad Arassad,
grade P4), Labao (Mohammed/Mohammad Zeyadh, grade P7, identical schedule day
and time on both records), Cervantes (Ricky / Ricky D., grade P7), and
Villadolid (Lucas / Lucas L., grade P12). None of these four were merged
without Nina's confirmation, same discipline as the original 18 -- presented
back to her with identifying details rather than guessed at.

**Verified before applying (both merges)**: same isolated-`/tmp`-copy-first
process as the original 17 -- ran each guarded migration against a restored
copy of the pre-merge backup, confirmed the expected student-count drop and
correct subject/teacher consolidation on the surviving record, only then ran
it against the real production database. `node --check` on the changed file.
Real production database confirmed at 972 students after both merges (991 -
17 - Barago - Abañeta).

Delivered as an updated `kumon-roster-app-with-ashr.zip` (same filename,
replaces the 17-merge version delivered a few minutes earlier).

## Same-day follow-up: 4 more duplicates confirmed and merged (Aug 20, 2026)

Presented the 4 candidates surfaced by the accent-aware pairwise re-scan
above back to Nina with identifying details (grade, teacher, schedule).
She confirmed all four by name: **Macumbal** (Muhammad/Mohammad Arassad,
grade P4), **Labao** (Mohammed/Mohammad Zeyadh, grade P7 -- identical
schedule day/time on both records), **Cervantes** (Ricky / Ricky D., grade
P7), **Villadolid** (Lucas / Lucas L., grade P12).

Merged via `mergeMoreDuplicateStudents()` in `lib/db.js`, same guarded
one-time-migration pattern as every duplicate merge today, own `app_state`
key (`more_duplicate_students_merged_2026_08_20`). Verified against an
isolated copy of the real production database first (confirmed each
canonical record ended up with both Math and Reading active, expected
student-count drop), then applied for real. **Real production database now
at 968 students** (991 original - 17 - Barago - Abañeta - these 4 = 968),
confirmed via direct query after the migration ran.

This closes out today's duplicate-student sweep -- 22 total merges across
five separate guarded migrations (the original 17, Barago, Abañeta, and
these 4), each independently verified against an isolated copy before
touching the real database, each leaving a clear audit trail via its own
`app_state` key.

Delivered as an updated `kumon-roster-app-with-ashr.zip` (same filename,
replaces the Barago/Abañeta version delivered a few minutes earlier).

## Same-day follow-up: Math/Reading subject icons on the Payments tab (Aug 20, 2026)

Small UI request right after the duplicate-merge sweep: a quick visual
indicator of whether a student on the Payments tab is Math, Reading, or
both, without having to infer it from the Tuition amount or teacher list.

**Server** (`server.js`, `listPayments()`): the query that already builds
each student's `teacher_label` (grouping active `subject_enrollment` rows
per student) now also carries along `e.subject`, so a new `subjects` array
(e.g. `["Math"]`, `["Math","Reading"]`) rides along on the same query with
no extra lookup.

**UI**: small colored circular badges ("M"/"R") next to the student name on
the Payments tab -- reuses the exact blue=Math (`#e9edfb`/`#3548a8`) and
red=Reading (`#fbeaea`/`#b3261e`) colors already established on the Weekly
Calendar (Aug 20 earlier), so the same subject reads the same color
everywhere in the app rather than inventing a third color scheme. A
two-subject student shows both badges together.

**Verified before delivery**: `node --check` on both changed files; a
regression check confirming Roster (1,205 rows) and Payments (968 rows,
matching the post-merge student count) both still return correctly; a
Playwright screenshot confirming Farzana Abdulcarim (Math+Reading) shows
both badges and Farzana Maruhom (Math only) shows just the one.

Delivered as an updated `kumon-roster-app-with-ashr.zip` (same filename,
replaces the duplicate-merge-sweep version delivered a few minutes earlier).

## Same-day follow-up: Dia/Disamburun overbilling fix + per-subject tuition breakdown (Aug 20, 2026)

Nina asked why the Roster tab shows 1,205 enrollments but the Payments tab
only shows 968 students. The expected answer is "by design" -- Payments has
one row per student, Roster has one row per subject enrollment, so with 968
students and a mix of one- and two-subject students the enrollment count
should land somewhere between 968 and 1,936. Doing the exact arithmetic
(734 single-subject students x 1 + 234 two-subject students x 2 = 1,202)
turned up a 3-enrollment discrepancy against the real total of 1,205 --
not close enough to hand-wave away.

**Root cause**: two students had a genuine duplicate *active*
`subject_enrollment` row for the same subject, sitting under two different
teachers on the same correct student record (a different bug from the
duplicate-student-record issue fixed earlier today -- this is one student,
too many active enrollment rows):

- Dia, Abdur Raheem -- Math and Reading each had an active row under
  teacher GB *and* an active row under teacher Sugar. Billed as if he had
  4 active subjects (₱8,800) instead of 2 (₱4,400).
- Disamburun, Adeenah Maryam -- Math had an active row under teacher
  Jea-and-Hamid *and* an active row under teacher Francis. Billed
  ₱6,600 instead of ₱4,400.

Nina confirmed the correct teacher for each: Sugar for both of Dia's
subjects, Francis for Disamburun's Math.

**Fix**: a new one-time guarded repair, `fixDuplicateEnrollmentStatus()` in
`lib/db.js` (key `duplicate_enrollment_status_fix_2026_08_20`), sets the
three superseded rows (Dia's two rows under GB, Disamburun's row under
Jea-and-Hamid) to `status = 'Inactive'` rather than deleting them, so the
old teacher history stays on the record but tuition and schedule
computations now correctly see only the current, active enrollment. Scope
was confirmed as fully contained: exactly these 2 students and 3 duplicate
active-enrollment-row combos across the entire 968-student roster.

Separately, Nina asked to "count it per subject" for the center admin view.
Scoped via a confirm question to the lightest option: the Tuition column
keeps showing one combined per-student amount (no change to billing groups
or how payment is tracked -- still one payment per family/student as
before), but for students with 2+ active subjects it now also shows a
small breakdown line underneath, e.g. "Math ₱2,200 + Reading ₱2,200".
Implemented as `fmtTuitionBreakdown()` in `public/app.js`, using the
`subjects` array already added to the Payments API response for the
subject-icon feature above, plus the existing per-student `tuition_rate`
(tuition is grade-based, so the same rate is simply repeated once per
subject). New `.tuition-breakdown` CSS rule in `styles.css`.

**Verified before delivery**: `node --check` on all changed files; the
enrollment-status fix tested first against an isolated copy of the
pre-merge backup, then applied to the real database (confirmed via
`md5sum` change and live API calls showing both students now billed
₱4,400); a Playwright screenshot on an isolated copy confirming the exact
rendering -- Farzana Abdulcarim shows "₱4,400" with "Math ₱2,200 +
Reading ₱2,200" beneath it in small muted text, single-subject Farzana
Maruhom shows no breakdown line; a regression check confirming Roster
(1,205 rows) and Payments (968 rows) are both unchanged and correct.

Delivered as an updated `kumon-roster-app-with-ashr.zip` (same filename,
replaces the subject-icons version delivered a few minutes earlier).

## Same-day follow-up: Payments tab cleanup + Grade dropdown (Aug 20, 2026)

Nina followed up on the 1,205-vs-968 question from the section above: Roster
counts per subject enrollment, Payments counts per student, and both numbers
are correct for what they're counting -- but she pointed out the center
tracks attendance/billing per subject, not per student headcount (a student
who drops Math but keeps Reading is a real, tracked event), so "968
students" alone undersells what's actually being tracked. Rather than
restructure the Payments tab to one row per subject (which would reverse
the "combined row + breakdown" decision from the section above, and risks
re-surfacing the exact duplicate-active-enrollment display problem just
fixed if inactive/historical rows were included), the fix was additive and
display-only:

- **Payments row-count label now shows both figures**: "968 students ·
  1,202 enrollees" instead of just "968 students". The enrollee count is
  the sum of each visible row's *active* subjects (same definition Roster
  uses for its active-enrollment count), computed client-side from the
  `subjects` array already in the API response -- no server or schema
  change. It respects whatever search/filter is active, same as the
  student count already did.
- **Per-subject tuition breakdown line removed.** Nina felt "Math ₱2,200 +
  Reading ₱2,200" under the total was redundant now that the Math/Reading
  icons already show next to the student's name -- `fmtTuitionBreakdown()`
  and its `.tuition-breakdown` CSS rule (added a few minutes earlier, see
  section above) were removed. The Tuition column is back to just the
  total amount.
- **Due column removed from the Payments tab.** Every family's due date is
  the 25th, so a per-row column repeating that added no information.
  Removed the `<th>Due</th>` header and its `<td>` (with the "overdue" tag
  that lived in that cell); table colspans for the loading/empty states
  updated from 14 to 13. The underlying `due_date`/`overdue` fields are
  still computed server-side (`payments.dueDateForMonth()` /
  `payments.isOverdue()`) and still returned by `/api/payments` -- only the
  display column was dropped, so this is easy to re-surface (e.g. next to
  the Status badge) if it's ever wanted again.
- **Grade field is now a dropdown**, not free text. The Roster tab's
  Add/Edit student panel's Grade field (`#f_grade`) was a plain text input
  with a placeholder hint ("e.g. P4, K, PK1") -- easy to mistype in a way
  that would silently fall through `lib/tuition.js`'s rate lookup and flag
  the student's tuition as unrecognized. It's now a `<select>` with a
  "— not set —" blank option plus every grade shape the app actually
  recognizes: PK1, PK2, PK3, K, P1 through P14. That range was checked
  directly against the real roster's distinct grade values before building
  the list, so every current student's grade (including the one P14 case)
  has a matching option and pre-selects correctly when editing.

**Verified before delivery**: `node --check` on all changed files; a
regression check confirming Roster (1,205 rows) and Payments (968
students / 1,202 enrollees) are unchanged and correct; Playwright passes
on an isolated copy confirming (a) the Payments row shows no breakdown
line and no Due column for a two-subject student, with the new count label
rendering correctly in the toolbar, and (b) the Grade field renders as a
`<select>` pre-populated with the student's existing grade when opening
Edit on a live roster row, and that changing it and saving updates the
Roster table correctly.

Delivered as an updated `kumon-roster-app-with-ashr.zip` (same filename,
replaces the tuition-breakdown version delivered a few minutes earlier).

## Same-day follow-up: deleted the 3 redundant Dia/Disamburun enrollment rows (Aug 20, 2026)

After the explanation above, Nina asked to just delete the 3 leftover rows
outright instead of keeping them as Inactive history -- Dia, Abdur Raheem's
two rows under teacher GB (Math id 153, Reading id 154) and Disamburun,
Adeenah Maryam's one row under Jea-and-Hamid (Math id 609). These were the
exact rows `fixDuplicateEnrollmentStatus()` (see the overbilling-fix section
above) had marked Inactive a few minutes earlier -- confirmed-wrong,
already-superseded duplicates, not real history worth preserving.

New one-time guarded migration, `deleteRedundantEnrollments()` in
`lib/db.js` (key `redundant_enrollment_rows_deleted_2026_08_20`): for each
of the 3 known ids, deletes its `schedule_slot` rows first (the only child
table keyed by `enrollment_id` -- `monthly_progress`/`ashr_award`/
`payment_record` are all keyed by `student_id`, checked directly against
the schema before writing this), then deletes the `subject_enrollment` row
itself. Guarded by id AND `status = 'Inactive'`, so if any of these had
somehow been reactivated through the app in between, this skips it rather
than deleting live data.

This closes the gap discussed above: Roster's total enrollment count drops
from 1,205 to **1,202**, now exactly matching the active-enrollment count
Payments already used for billing (968 students / 1,202 enrollees). Dia
and Disamburun's tuition is unaffected (still ₱4,400 each, correct).

**Verified before delivery**: tested on an isolated copy first (confirmed
the 3 rows and their schedule_slot children are gone, re-running the
migration is a no-op); applied to the real database (fresh backup taken
first: `data/backups/roster.db.pre-delete-redundant-20260820-165102`,
`md5sum` confirmed changed after); a live server + API check confirming
Roster now returns 1,202 rows, Payments still returns 968 students / 1,202
enrollees, and Dia/Disamburun are still both billed ₱4,400.

Delivered as an updated `kumon-roster-app-with-ashr.zip` (same filename,
replaces the Payments-cleanup version delivered a few minutes earlier).

## Same-day follow-up: general delete function, with Undo coverage (Aug 20, 2026)

Right after the manual Dia/Disamburun cleanup above, Nina asked for a real
delete function instead of needing a one-off migration from me every time a
redundant/wrong row like that turns up. Scoped via a confirm question to
two things, both selected: (1) delete a single subject enrollment, and (2)
delete an entire student record (for a kid who's fully withdrawn, not just
dropped one subject) -- both protected by a confirm dialog and covered by
the app's existing one-level Undo, so a misclick can be reversed
immediately with one click rather than needing a backup restore.

**Two new buttons in the Roster edit panel** (`#deleteEnrollmentBtn`,
`#deleteStudentBtn`, styled as outlined `.btn-danger` so they read as
serious without competing with the filled Save button): hidden when adding
a new student (nothing to delete yet), shown when editing an existing
enrollment. Each asks a specific `confirm()` naming the student and
exactly what's being removed before doing anything.

**Server** (`server.js`): two new undo-wrapped functions,
`deleteEnrollmentWithUndo()` and `deleteStudentWithUndo()`, plus routes
`DELETE /api/enrollments/:id` and `DELETE /api/students/:id`.
`deleteEnrollmentWithUndo` removes one `subject_enrollment` row and its
child `schedule_slot`/`attendance` rows only -- `monthly_progress`/
`ashr_award`/`payment_record` are keyed by `student_id`, not
`enrollment_id`, so a student's other subject and payment history stay
intact. `deleteStudentWithUndo` removes the student and everything tied to
them across all six tables. Both snapshot every row they're about to
delete first and hand those snapshots to a new `insert_row` Undo step type
(`lib/db.js`'s Undo system previously only had `restore_row`, which
UPDATEs a row that's still there -- undoing a *delete* needs to fully
re-INSERT a row that's gone, including its original id, since other
snapshotted rows in the same batch reference it, e.g.
`schedule_slot.enrollment_id`).

**Verified before delivery**: `node --check` on all changed files; tested
end-to-end on an isolated copy via direct API calls -- deleted a two-subject
student's Reading enrollment (Roster count dropped by 1), then Undo
restored it with the exact same teacher/schedule data; deleted a whole
student (Payments dropped 968→967, Roster dropped by their subject count),
then Undo restored the student, both subjects, and their payment/progress
data exactly. Also a Playwright pass confirming the delete buttons are
hidden on "Add student" and visible on "Edit enrollment," the confirm
dialog fires with the correct wording, and the panel closes and the Undo
button updates correctly after a delete. None of this testing touched the
real database -- all done against a throwaway `/tmp` copy.

Delivered as an updated `kumon-roster-app-with-ashr.zip` (same filename,
replaces the redundant-rows-deleted version delivered a few minutes
earlier).

## Same-day follow-up: Absent-student audit against the source workbooks, first Absent-tab data (Aug 21, 2026)

Nina asked to start on the "Absent" tab from the Master To-Do roadmap
(saved to the project as `kumon-master-todo-roadmap.md`), starting with a
review of every student the 5 source workbooks mark ABSENT against who the
app currently shows as enrolled.

**Method**: for each of the ~15 teachers across the 5 workbooks, read their
single most recent REPORT sheet (some go all the way to August 2026;
BCD_2026's and EO_Feb's teachers only have sheets through March/April --
flagged explicitly rather than treated as current), pulled every row whose
STATUS column said ABSENT, and cross-checked each one against the live
student database by name (exact + accent-normalized + fuzzy, same approach
as the earlier duplicate-student work).

**Findings**, delivered to Nina as `kumon-absent-student-audit.xlsx`
(5 tabs: Read Me, Fix Now, Never Imported, Already Consistent, Former
Teacher - Moot):

- **14 students shown Active in the app despite their source sheet saying
  ABSENT.** Split by confidence: only 2 (Domingo Fertian Arthur, Agosila
  Elyana) are based on this month's (August) data; the other 12 come from
  stale March/April sheets, 4 of which were originally Ms. Weda's students
  -- she left the center and was already fully removed from the app back
  on Aug 19, so those 4 are almost certainly kids who got reassigned to a
  new teacher after she left, not real ongoing absences.
- **135 students marked ABSENT in a currently-active teacher's own latest
  report don't exist in the app at all** -- not Active, not Inactive, no
  record whatsoever. The original Aug 19 rebuild imported each teacher's
  report sheet but appears to have filtered ABSENT rows out on the way in,
  rather than keeping them as inactive history.
- 12 more are already consistent (found in the app, the flagged subject
  genuinely isn't Active there either) -- no action needed.
- 59 more belong to Ms. Weda and are moot, since her entire roster (absent
  or not) is already gone from the app.

**Nina's decisions** (via a 3-question confirm): mark the 2 high-confidence
conflicts Inactive now; leave the 12 stale/likely-outdated ones Active for
now; import the 135 never-seen students now, as Absent, ahead of the
Absent tab UI itself being built.

**Schema change** (`lib/db.js`): new `student.roster_status` column
(`'Active'` / `'Absent'`, self-healing `ALTER TABLE`, defaults every
existing student to `'Active'` -- nothing else in the app queries this
column yet, so no existing behavior changes) plus `student.absent_source_note`
for traceability on anything imported directly as Absent. This is the
first concrete piece of the roadmap's Phase 11 rule: "Absent" is a status
transition on the student, never a delete, kept distinct from a single
subject enrollment being Inactive.

**Two new guarded one-time migrations**, both keyed off the Aug 21 audit:

- `fixHighConfidenceAbsentConflicts()` (key
  `high_confidence_absent_conflicts_fixed_2026_08_21`) -- marks exactly
  Domingo's and Agosila's Math enrollment `Inactive`, guarded by student
  id + subject + teacher id + still-Active, so it only touches those two
  specific rows and only if they're still in the state the audit found.
- `importNeverEnrolledAbsentStudents()` (key
  `never_enrolled_absent_students_imported_2026_08_21`) -- reads
  `data/absent-import-seed.json` (135 rows, generated from the audit) and,
  for each, creates a new `student` (`roster_status = 'Absent'`, grade
  normalized the same way as everywhere else in the app, left blank rather
  than guessed for the handful of rows with no source grade) plus one
  `subject_enrollment` per absent subject (`status = 'Inactive'` -- an
  already-supported value in the Roster UI, so nothing needed to change
  there; teacher resolved unambiguously from which sheet the row came
  from). Re-checks for a same-name student immediately before inserting
  (not just at audit time) and skips rather than creating a duplicate if
  one now exists. 128 unique students created (7 were absent in both
  Math and Reading, so 135 subject-enrollment rows across 128 students).

**Verified before delivery**: `node --check` on `lib/db.js`; tested first
against an isolated copy of the real database, confirming exact counts and
idempotency (re-running is a no-op); a Playwright screenshot on the
isolated copy confirming a newly-imported Absent student (Macadato,
Binwalid) renders cleanly in the Roster right alongside the family's
existing records, correctly badged `Inactive`, with no console errors; a
live-server regression check both on the isolated copy and, after applying
for real, against production -- total enrollments 1,202 → 1,337 (+135
imported), active enrollments 1,202 → 1,200 (-2 for Domingo/Agosila),
Payments 968 → 966 students (Domingo and Agosila now have zero active
subjects, so they correctly drop off the Payments list; none of the 135
newly-imported Absent students show there either, since none of their
enrollments are Active) -- all matching exactly between the isolated-copy
test and the real production run. Fresh backup taken before the real
mutation (`data/backups/roster.db.pre-absent-import-20260821-044946`),
`md5sum` confirmed changed after.

Delivered as an updated `kumon-roster-app-with-ashr.zip` (same filename,
replaces the general-delete-function version delivered earlier), alongside
the standalone `kumon-absent-student-audit.xlsx` findings workbook.

## Same-day follow-up: the Absent tab itself (Aug 21, 2026)

The previous entry above got the data layer and the 128 imported Absent
students in place; this one builds the actual tab Nina asked for --
"list + a way to mark someone Absent from the app," kept deliberately
separate from the Payments tab's existing 4-month payment-lapse come-back
list (both confirmed via a 2-question check-in before starting).

**New tab** (`public/index.html`, `public/app.js`): a 5th tab, "Absent,"
next to Payments. Lists every student with `roster_status = 'Absent'` --
one row per student (not per subject, since an absent student's
enrollments are all Inactive history at that point) -- with search, plus
teacher/grade/subject filters matching the same look and behavior as the
Payments tab's toolbar. Columns: Student, Grade, Subject(s) (using the same
subject-icon badges as Payments), Last teacher, Absent since, Reason/note,
and an Edit link. A `.review-note` banner at the top states plainly that
this list is separate from the Payments come-back list.

**Edit panel, extended, not duplicated**: rather than build a second edit
panel just for Absent, the tab's Edit link fetches that student's
enrollments (`GET /api/enrollments?studentId=`) and opens the same shared
panel every other tab already uses -- it now shows a "Retention status"
section (added right above the existing delete buttons) that reads the
student's `roster_status` and shows one of two things: for an Active
student, a note field and a "Report this student absent" button; for an
Absent student, a summary line (date + reason, if any) and a "Mark active
again" button. Neither shows in "Add student" mode, same rule as the
delete buttons above it.

**Write path** (`server.js`, already built the same day as the data-layer
follow-up above): `PUT /api/students/:id/absent-status` with
`{action: 'report'|'reactivate', note?}`, backed by `setAbsentStatusWithUndo()`
-- reporting sets `roster_status='Absent'`, today's date, and the note;
reactivating sets `roster_status='Active'` only, deliberately leaving the
date/note in place as historical record rather than clearing them ("never
delete, preserve history," per the roadmap's Phase 11 rule). Both are
covered by the same one-level Undo as every other action in the app.

**Confirmed by design, not by oversight**: reporting a student absent does
*not* touch their `subject_enrollment` rows -- only the student-level
`roster_status` flips. This matches the schema decision from the Aug 21
data-layer work (roster_status as a status layered on top of, not
entangled with, per-subject enrollment status) and keeps the write path
narrow and predictable. In practice this means a student reported absent
straight from an Active enrollment stays on the Roster/Payments tabs'
"Active" views until their subjects are separately set Inactive -- worth
flagging to Nina as a real v1 scope question (should reporting someone
absent also flip their enrollments?) rather than deciding it unilaterally.

**Verified before delivery**: `node --check` on `app.js`, `server.js`,
`lib/db.js`. Full Playwright pass on an isolated `/tmp` copy of the real
database (never touched production this round -- confirmed via `md5sum`
before and after): Absent tab loads and shows all 128 students; search and
the Edit link both work; the edit panel correctly shows "Mark active
again" (and the right summary text) for an Absent student and "Report this
student absent" for an Active one; reactivating a test student (Abbas,
Amal Haya) removed her from the tab and Undo correctly restored her;
reporting a different Active student (Domingo, Fertian Arthur) absent
added him to the tab, and Undo correctly reversed it. A leftover cosmetic
bug caught in the first screenshot pass -- an empty tan `.review-note` box
showing for Active students with nothing to summarize -- was fixed
(hidden when there's no absent-status text to show) and reverified before
calling this done. Isolated test database reset to its original state
(128 absent, 0 pending undo) after testing; production database
untouched throughout (`md5sum` unchanged).

Delivered as an updated `kumon-roster-app-with-ashr.zip` (same filename,
replaces the Aug 21 data-layer-only version delivered earlier).

## Same-day follow-up: per-subject reporting, an editable note, and a returnee flag (Aug 21, 2026)

Three refinements to the Absent tab above, all from the same feedback pass
right after delivery.

**1. "Report absent" is now scoped to one subject, not the whole student.**
Nina: *"a student in both subjects can choose to stop math only so they
will be absent in math -- i want to automatically mark them on the
roster as well."* Previously "Report this student absent" only flipped the
whole-student `roster_status`, leaving the Roster tab's per-subject Status
field untouched -- a student reported absent from one subject would look
unchanged on the Roster. Now `setAbsentStatus()` (`server.js`) always sets
the specific `subject_enrollment` the panel was opened for to `Inactive`
first (the "automatically mark them on the roster" part), then checks
whether the student has any other Active enrollment left. If yes (e.g. they
kept Reading), the student stays a normal Active student, visible as
Inactive-in-Math on the Roster like any other dropped subject -- they do
NOT show up on the Absent tab. If no, this was their last active subject,
and the student is promoted to `roster_status = 'Absent'` the same way as
before. The button now reads "Report Math absent" / "Report Reading
absent" (dynamic per subject) rather than a generic "Report this student
absent," and a third panel state was added for the case where this specific
subject is already Inactive but the student's still Active elsewhere --
no report button shown there, just a note pointing at the Status field
above. `PUT /api/students/:id/absent-status` now accepts an `enrollmentId`;
Undo covers both the `student` row and the `subject_enrollment` row as one
combined action, restoring both if it was a mistake.

**2. The retention note is editable any time, not locked in at report time.**
Nina: *"I want it to be editable by the teacher."* The note field used to
only appear (and only be settable) inside the "report absent" flow, and
showed as read-only plain text once a student was actually Absent. It's now
always visible in the Retention status section, pre-filled with whatever's
on record, with its own **Save note** button -- separate from Report/
Reactivate, so updating it (e.g. "talked to mom, she says they'll come back
in Sept") never touches `roster_status` or resets `absent_reported_date`.
New endpoint: `PUT /api/students/:id/absent-note`, backed by
`updateAbsentNoteWithUndo()`, Undo-covered like everything else. No login/
role system exists yet (that's Phase 1 on the roadmap, not built), so
"editable by the teacher" for now means editable by whoever has the app
open, same as every other field.

**3. Reactivating now visibly flags the student as a returnee, not new.**
Nina: *"when you mark a student as active again, we need a way to indicate
that they are a returnee and not a new student."* No new column was
needed -- `absent_reported_date`/`absent_source_note` already survive
reactivation on purpose (the "never delete, preserve history" rule from the
data-layer entry above), so a returning student is fully identifiable from
existing data: `roster_status = 'Active'` but `absent_reported_date` still
set. A small amber "↩ Returning" badge (`fmtReturneeBadge()`, new
`.badge-returnee` style) now renders next to the student's name on both the
Roster and Payments tables, and a plain-language line ("↩ Returning student
-- previously reported absent on [date]. Not a new student.") shows in the
edit panel's Retention status section. It's permanent by design -- once a
student has ever been reported absent and come back, this shows every time
their row is viewed, for as long as `absent_reported_date` stays set (i.e.
until they're reported absent again, which overwrites it with the new
date -- same one-shot-of-history tradeoff as everywhere else this pattern
is used).

**Verified before delivery**: `node --check` on `app.js`/`server.js`. Full
Playwright pass on an isolated `/tmp` copy of the real database (production
never touched -- `md5sum` unchanged throughout): a student with both Math
and Reading Active had Math reported absent alone -- Math went Inactive on
the Roster, Reading stayed Active, student correctly stayed OFF the Absent
tab; reporting Reading absent too then correctly promoted them onto the
Absent tab; Undo reversed each step correctly (both the enrollment and, on
the second one, the student-level promotion). Editing and saving a note on
an already-Absent student left `absent_reported_date` unchanged (confirmed
via direct API check) and was itself Undo-covered. Reactivating a fully
Absent student produced the "↩ Returning" badge on the Roster row and the
matching line in the edit panel; the already-Inactive subject correctly
showed no "Report absent" button (nothing left to report for that subject)
alongside the returnee note. One layout bug caught in the first screenshot
pass -- the new "editable any time" hint text, nested inside the note's
`<label>`, wrapped awkwardly into the textarea because that label wasn't
inside the form's usual `.field-row` flex wrapper -- was fixed (hint moved
to its own line above the field) and reverified.

Delivered as an updated `kumon-roster-app-with-ashr.zip` (same filename,
replaces the version delivered earlier today).

## Same-day follow-up: absence risk metrics -- research only, not built yet (Aug 21, 2026)

Nina described a much bigger vision for the Absent tab: alongside the list,
she wants to see, per absent student, whether the absence looks "avoidable"
(early warning signs were visible and could have been acted on) or
"unavoidable" (a sudden external cause). She named three leading-indicator
metrics: (1) worksheets/"sets" answered per month vs. an expected ~30, (2)
days physically attended per month vs. an expected ~8, (3) whether the
student hit the "KIS" award tier within 6 months or a year of enrolling.
She was also clear this isn't only about this tab -- she wants a future,
separate self-auditing sheet that flags at-risk students *before* they
become absent, based on the same metrics; that's out of scope for now by
her own framing ("but working on this absent tab for now").

Rather than guess at schema for this, the underlying data was audited
first:

- **Metric 2 (days attended/month) -- fully buildable today, no new
  tracking needed.** A real `attendance` table already exists
  (`schedule_slot_id`, `date`, `arrived`, unique per slot+date) backing the
  existing "Not arrived today" panel -- it's genuine persisted history, not
  a same-day-only computation. Monthly visit counts are a straightforward
  query away.
- **Metric 1 (worksheets/sets per month) -- does not exist, and page
  numbers aren't a safe substitute.** `monthly_progress` tracks
  `actual_page` (a page number within a Kumon level), not a worksheet/set
  count, and the two aren't equivalent: a "set" can span multiple pages,
  and a level-up resets the page number to something low, so a naive
  month-over-month page delta can go negative right when a student is
  actually doing well. This needs either a new field for teachers to log
  monthly (same pattern as the existing goal/actual level fields), or a
  different source Nina already has for this number -- needs her input
  before anything gets built.
- **Metric 3 (time to first KIS) -- computable, but only to 6-month-cycle
  precision.** `ashr_award` records tier results (`'KIS'`, `'Bronze'`, etc.
  -- confirmed the tier is spelled "KIS" in the app's data, not "KISS") per
  `cycle` (`'YYYY-08'` or `'YYYY-02'`, twice a year), and enrollment date
  lives on `subject_enrollment.date_enrolled` (per-subject, not
  per-student). "Time to first KIS" is derivable per subject, but as "which
  6-month cycle," not an exact day count.

**Nothing has been built for this yet.** It's a genuinely bigger piece of
work than the tab itself -- new data-entry workflow for metric 1, a
decision on what "avoidable" should mean in the UI (an automatic
threshold-based flag, vs. a manual human judgment call, which fits this
project's existing "flag for review rather than guess" pattern better) --
and deserves an explicit scoped go-ahead before any schema changes, per
this project's standing build discipline. Findings reported back to Nina
in chat; awaiting her direction on metric 1's data source and the
avoidable/unavoidable UI treatment before writing any code.

## Same-day follow-up: two more fixes, plus auto-flagged risk signals (Aug 21, 2026)

Three more requests landed the same day as the research above. Two were
small, fast fixes; the third is the risk-flagging feature itself, which
Nina confirmed she wants as an automatic, threshold-based flag rather than
a manual judgment call.

**The retention note is now editable any time, independent of the
report/reactivate buttons.** Previously the note was only ever written at
the moment a student was reported absent. Now there's a standalone `Save
note` action (`PUT /api/students/:id/absent-note`) that updates only
`absent_source_note` -- it never touches `roster_status` or
`absent_reported_date`, so a teacher adding context later ("talked to mom,
she says they'll come back in Sept") never resets "absent since" to today.
Works whether the student is currently Active or Absent.

**Reactivating a student now visibly flags them as a returnee, not a new
student.** No new column was needed -- "returnee" is just `roster_status
=== 'Active' AND absent_reported_date is set`, since reactivating
deliberately leaves the historical `absent_reported_date`/`absent_source_note`
in place rather than clearing them (documented further up). Shows as an
"↩ Returning" badge on the Roster, Payments, and the edit panel, with a
hover-visible date. One related, pre-existing-but-worth-restating design
choice: reactivating only clears the student-level Absent flag -- it does
**not** automatically flip the specific subject_enrollment(s) back to
Active, since re-enrolling in a subject deserves a real teacher/schedule/
level decision, not a silent copy-forward of stale data. The edit panel
says so directly ("Math is already Inactive on the Roster. Change the
Status field above to re-enroll in this subject.") so it's never a silent
gap -- confirmed this reads clearly in testing.

**Auto-flagged risk signals, built from the two metrics the data
actually supports.** New `lib/risk.js` (same no-DB-access pattern as
`lib/tuition.js`/`lib/ashr.js`) holds the thresholds as plain constants --
`EXPECTED_MONTHLY_VISITS = 8`, flag if attendance is under half that;
`KIS_WINDOW_MONTHS = 6`, flag if a subject's first KIS award didn't land
within that window of its enrollment date. `getRiskFlagsForStudent` in
server.js gathers the raw numbers and hands them to `computeRiskFlags`.
Every absent student's row (Absent tab table, and the edit panel's
Retention status section) now shows one of three states, never
collapsed into a plain "no flags":

- **Red badges** -- real, specific flags, e.g. "No KIS award within 6
  months of enrolling in Math (enrolled 2025-04-01)."
- **"No attendance/KIS signals detected"** -- actually checked, came back
  clean.
- **"Not enough data yet to check"** -- couldn't judge either metric for
  this student, so no claim is made either way.

That third state matters more than it might look. Two real data-coverage
gaps turned up while building this, both caught before anything shipped by
checking actual data volumes rather than trusting the schema existed:

1. The `attendance` table -- the one the daily "Not arrived today" toggle
   writes to -- is **completely empty, 0 rows app-wide**. That feature has
   never actually been used day-to-day. Without a guard, every one of the
   128 currently-absent students would have been confidently flagged "low
   attendance" the moment this shipped, which would have been false --
   there's no attendance history to judge them against at all, logged or
   otherwise. Fixed with a `hasAttendanceHistory` check (any attendance row
   ever, any date) that has to pass before a 0-visit month is trusted as a
   real flag rather than a blank record.
2. All 135 currently-absent enrollment rows -- the ones bulk-imported from
   the Aug 21 audit -- have `date_enrolled` unset, since the source sheets
   for that import didn't carry enrollment dates. The KIS-timing metric
   needs that date to know when its 6-month window starts, so it can't
   judge any of them yet either.

Net effect: **the feature is fully working, but currently shows "not
enough data yet" for all 128 real absent students** -- that's the honest
answer given what's actually recorded, not a bug. It'll start producing
real signals automatically as: (a) staff begin actually using the daily
attendance toggle going forward, and (b) any *new* student reported absent
from now on, since normally-enrolled students do have a real
`date_enrolled` -- only the bulk-imported Aug 21 cohort is missing it.
Verified this end-to-end against a real, normally-enrolled student
(enrolled 2025-04-01, no KIS award on record): reporting them absent
correctly produced the "No KIS award within 6 months..." flag in both the
table and the edit panel, and Undo correctly reversed it.

**Metric 1 (worksheets/sets per month) is still not built** -- still
genuinely blocked on Nina's input for where that number should come from,
as covered in the research section above. Every result from this feature
explicitly reports `worksheetsTracked: false`, and the UI shows a plain
caveat sentence about it rather than pretending the picture is complete.

## Same-day follow-up: the Absent tab's monthly dashboard view (Aug 21, 2026)

This closes out Nina's original "absent for the month of AUGUST -- then a
dropdown to see historical absents" request, left open since the tab was
first built. Two ways to give her real month-by-month history were on the
table: a simple filter by the month of each student's (single) absent
date -- no new schema, but a reactivated student's older absent months
stop being visible once their date is overwritten -- or a full append-only
absence-event log that would keep every month accurate forever at the
cost of new schema and rewired report/reactivate logic. She chose the
simple filter.

**What's built**: the Absent tab now opens on a dashboard-style banner --
"Absent for the month of August 2026" -- matching the Payments tab's
existing "Recording data for [month]" banner style, with a `Current
(live)` / historical-month / `All absent students` dropdown right in the
toolbar (same UI pattern as the Payments tab's own month filter, right
down to the "always show the current month even with nothing recorded
yet" rule). Selecting a past month filters the list to only students whose
`absent_reported_date` falls in that month; `All absent students` drops
the month filter entirely. New `GET /api/absent/months` lists which months
actually have absent students on record (`listAbsentMonths` in
server.js), and `listAbsentStudents` now takes an optional `month` query
param (defaults to the app's current active month, same default the
Payments tab uses).

**The documented tradeoff, made concrete**: since a student only ever
carries one `absent_reported_date` (overwritten on their next report, per
the existing "one-shot-of-history" design), a student who was absent in
July and reactivated in August no longer shows up under July once
reactivated -- their history isn't lost (the note field says whatever it
always said), but the month-by-month view can't reconstruct it. Verified
this is exactly what happens: backdated a test student's absent date to
July in the isolated test copy, confirmed July showed 1 student and the
correctly-filtered current month dropped to 127, then confirmed `All
absent students` still showed all 128 regardless of month. If this gap
ever actually matters in practice, the upgrade path is the full
absence-event log described above -- deliberately not built now since
Nina explicitly chose the simpler version.

## Status vocabulary unified to Active/Absent everywhere (Aug 25, 2026)

Nina, after asking how the Absent tab relates to the Roster and getting an
explanation that took a couple of tries to land: "I don't want to tag
anyone inactive... it's either absent or active. They can be absent in
math but still be active in reading." Before this, the app used two
different words for the same underlying idea at two different levels --
a whole student was Active or Absent (`student.roster_status`), but an
individual subject enrollment was Active, Inactive, or Dropped
(`subject_enrollment.status`). Confusing, and not what she actually
wanted.

**What changed**: `subject_enrollment.status` is now Active/Absent only,
matching `roster_status` exactly. 'Dropped' is gone outright -- confirmed
zero of the 1,337 real enrollments in production ever used it; it was
defined in the schema and offered as a dropdown option but never actually
applied to a row, so nothing was lost removing it. (Confirmed with Nina
directly before removing it, rather than assuming.) A student can now be
described in exactly one vocabulary at both levels: absent in Math, still
active in Reading, absent overall only once every subject is absent --
same underlying mechanic as before, just one consistent word for it
everywhere: the Roster's Status column and filter, the edit panel's Status
field, the report-absent confirmation text, badges, all of it.

**Why this needed a real migration, not just a label swap**: SQLite
can't alter a CHECK constraint in place, so `lib/db.js`'s
`migrateSubjectStatusVocabulary` rebuilds the `subject_enrollment` table
under the new `('Active','Absent')` constraint and remaps every existing
`'Inactive'` row to `'Absent'` in the same operation, self-healing and
idempotent like every other migration in this app -- it runs automatically
the next time the app starts, and is a no-op on every startup after that.
One real snag found and fixed during testing: `schedule_slot.enrollment_id`
references `subject_enrollment(id)` as a foreign key, and `node:sqlite`
enforces foreign keys by default (unlike the plain sqlite3 CLI, which
doesn't) -- the table-swap step briefly leaves those references pointing
at a table that doesn't exist yet, which failed loudly the first time
this was tested against a real copy of the data. Fixed by turning foreign
key enforcement off for just that one rebuild (SQLite requires this be
done outside any transaction) and adding an explicit
`PRAGMA foreign_key_check` right before committing, so a real orphaned-row
bug would fail loudly instead of silently breaking schedules -- verified
clean (zero orphans) against a full copy of production data, along with
enrollment counts, `schedule_slot` counts, and Payments/ASHR/Calendar all
still working, before this shipped.

## Same-day follow-up: "Mark absent" on the Payments tab (Aug 25, 2026)

Nina: "in the payments tab i want a way to tag students absent." The
Payments tab already had something called "absent" -- a `marked_absent_date`
field in the edit panel, used only for the SOA/billing status label ("Absent
(reported)"). That's a payment-only note; it never touched a student's real
Roster status or moved them onto the Absent tab. Given the vocabulary
cleanup earlier the same day, it was worth asking rather than assuming
which "absent" she meant here -- confirmed directly: she wants the real
status change (same as the Roster's "Report absent" button), not a second,
separate flag. The existing `marked_absent_date` billing field is untouched
and still there for SOA purposes; this is a new, different action sitting
next to it.

**How it works**: every Payments row now has a "Mark absent" link next to
Edit. A student billed as one row can still have more than one active
subject underneath (about 1 in 4 do, both Math and Reading) -- Payments
bills them together, but absence is still tracked per subject, same as the
Roster. So this branches on how many active subjects the student has:

- **One active subject** -- a direct confirm() dialog, same wording style as
  the Roster's report-absent confirmation, then done. No extra clicks.
- **More than one** -- a small "Report absent" panel opens with a checkbox
  per active subject, all checked by default (report everything, the common
  case); uncheck whichever one is still coming before confirming.

Either path calls the exact same backend action the Roster's "Report
absent" button uses (`PUT /api/students/:id/absent-status`), so the result
is identical either way: the chosen subject(s) flip to Absent right away,
and the student is promoted to the Absent tab only once none of their
subjects remain Active -- a student absent in one subject but still active
in another stays a normal Active student, visible as Absent-in-that-subject
on the Roster, exactly like reporting it from the Roster tab directly. Full
Undo coverage, same as every other action in this app.

**What changed under the hood**: `setAbsentStatus`/`setAbsentStatusWithUndo`
in `server.js` took a single `enrollmentId` before; they now take
`enrollmentIds` (a list), since Payments can report more than one subject
absent from one row in one action. The Roster's edit panel still only ever
sends one id -- the `/api/students/:id/absent-status` route normalizes
either shape before calling through, so nothing about the Roster's existing
flow changed. `listPayments` now also returns each student's `active_
enrollments` (subject + real enrollment id), which the new picker needs to
know what to show and what to send back. Verified against a full copy of
production data: the single-subject fast path, the multi-subject picker
(both "report everything" and "uncheck one, keep it active"), the Cancel
path, and a full Undo of each -- plus the existing cross-tab regression
suite (Roster, Calendar, ASHR, Payments, Absent) all still passing clean.
Production's `data/roster.db` was never touched -- confirmed by checksum,
unchanged, before and after this whole change.

## Same-day follow-up: "Months absent" buckets on the Absent tab (Aug 25, 2026)

Nina: "next for the absent tab - i need to show historical data so the past
4 months." Worth confirming what that meant before building, since the
Absent tab already has a "historical data" feature (the Current/historical-
month/All dropdown from Aug 21) that answers a different question --
*which month* was someone reported absent in. Asked directly: she wants a
second thing entirely, bucketing each currently-absent student by *how
long* it's been, matching the "4-month comeback window" concept already
sitting in the roadmap (Phase 9/10) but never built for this tab -- 1
through 4 months are still inside the no-re-registration-fee window, 5+ is
outside it.

**What was built**: every row in the Absent tab now shows a "Months absent"
badge (This month / 1 month / 2 months / 3 months / 4 months -- final
window / N months -- outside window), a matching duration filter in the
toolbar, and a summary strip above the table tallying how many students
fall in each bucket -- same visual pattern as the Payments tab's summary
strip and come-back list, just at finer (per-month) granularity than that
list's simple within/past-window split, since that's specifically what was
asked for here.

**How the math works**: computed against *today's* active month, not
whichever historical `month` the toolbar's existing dropdown is filtered
to -- those are deliberately two different questions (see the comment on
`listAbsentStudents` in `server.js`). Reuses `lib/payments.js`'s existing
`monthsBetween` helper, the same one `listComebackCandidates` already uses
for the Payments tab's payment-lapse comeback list -- same math, applied to
a different underlying concept (formally reported absent vs. payment
lapse), which the app has kept deliberately separate since Aug 21. A
student with no `absent_reported_date` on record (rare, but possible for
an edge-case import) buckets as "Unknown" rather than being guessed into a
window.

**Verification note**: as of today, all 128 real absent students were
imported in the same Aug 21 audit and so all land in the "This month"
bucket right now -- there's no real spread across the other buckets yet in
production data. The bucket math itself was verified by temporarily
backdating 5 students' absent-reported dates in the isolated test copy
(1/2/3/4/7 months back) and confirming each landed in the correct bucket,
the filter dropdown correctly narrowed to just that bucket, and the summary
strip's counts matched -- all in the disposable test copy only, never
touching production. Full cross-tab regression suite re-run clean
afterward.

## Billing Groups (Aug 25, 2026)

Nina: "ok now lets start building something else" -- offered a few
candidates pulled from the roadmap (grade dropdown labels, the New Students
pipeline, Billing Groups, or something else entirely). She picked **Billing
Groups**.

**What was built**: a new "Billing Groups" tab where you can create, rename,
and delete billing groups, and add or remove student members -- matching
the platform spec's description of a group as a set of students who share
one combined Statement of Account and one billing payer (a common setup for
siblings, per the spec). Each group is shown as a card with its member list
front and center, since the members ARE the point of the view here, unlike
every other tab's flat table. Adding a member uses a typeahead search box
right on the card (only ungrouped, currently-active students show up, since
an Absent student isn't relevant to a billing decision right now). A
student's billing group also shows up on the existing shared Roster /
Payments / Absent edit panel, right alongside Teacher -- and can be changed
from there too, folded into the same Save button as everything else on that
panel (a dropdown pick is already one complete action, unlike free text, so
it didn't need its own separate save step or undo wiring -- it rides along
on the edit panel's existing combined save/undo).

**Scope, on purpose**: this is current-state group membership only -- who's
in which group *right now*. The roadmap separately calls out a second,
harder piece (item 10, "Billing Group History") for tracking how group
membership has changed *over time*, month by month. That's real, separate
work and isn't built yet -- happy to take it on whenever it's useful, same
as the Absent tab's month-by-month view was deferred earlier and built
later once it was actually needed. Also out of scope for this round: this
tab doesn't generate the actual Statement of Account or combined bill --
that's Phase 5 on the roadmap, a separate future increment.

**A bug found and fixed during testing**: deleting a billing group and then
clicking Undo restored the group correctly in the database (confirmed with
a direct, read-only check of the test database) but the group's card
wasn't reappearing on screen -- the Undo button's per-tab refresh list
hadn't been taught about the new Billing Groups tab yet. Fixed by adding
the missing refresh call, then re-tested end-to-end to confirm the card
now reappears correctly after Undo.

**Verification**: schema and backend syntax-checked; full create/rename/
delete/add-member/remove-member/undo flow tested with Playwright against
an isolated copy of your real August data, including the edit-panel path
(assign, then clear, a student's group from Roster and see it reflected on
the tab); the existing 5-tab regression suite (Roster, Calendar, ASHR,
Payments, Absent) re-run clean afterward with the same counts as before;
your production database was never opened for writes during any of this,
and its checksum was confirmed unchanged before and after.

## Same-day follow-up: a real dropdown for adding a billing group member (Aug 25, 2026)

Nina asked to integrate billing groups into the Payments tab; talking through
what that meant surfaced three genuinely different options (a group badge +
filter on Payments, a grouped view with subtotals, or letting one payment be
recorded against a whole group -- the last one runs straight into the
platform spec's still-open "Group Payment Allocation" question, so it
wasn't something to guess at). She stepped back from that and asked for a
smaller, concrete thing instead: turn the Billing Groups tab's "add a
student" box into a real dropdown + search.

**What was built**: the add-member box on each group card is now a proper
search dropdown instead of a plain list of buttons sitting under the input.
Typing shows a floating panel of matches (styled like a normal combobox --
border, shadow, scrolls if there are many). It's keyboard-navigable: Arrow
Down/Up moves a highlight through the results, Enter picks the highlighted
one (or the only one, if there's just a single match), and Escape clears
the search and closes it. Clicking anywhere outside the box closes it too.
A "no matching students" result still shows inside the same dropdown panel
rather than as plain text, so the whole interaction stays consistent.

**Verification**: tested against an isolated copy of production data --
dropdown stays hidden until you type, appears on typing, arrow keys
highlight the right result in order, Enter adds the highlighted student,
Escape clears and closes, clicking outside closes it, and the no-match
state still renders correctly. Full create/rename/delete/add/remove/undo
flow re-run clean afterward, plus the existing 5-tab regression suite.
Production database untouched throughout, checksum reconfirmed unchanged.

## Same-day follow-up: billing group card cleanup + subjects/amount per member (Aug 25, 2026)

Feedback on the Billing Groups tab after using it for a bit, from two
screenshots: the "New billing group" modal looked visually broken (the
Name field and Notes label were crammed onto the same line, cutting off
the placeholder text), the "Name" label itself wasn't the clearest word
for what it's naming, and the member list only showed a name -- not which
subjects each student is in or what they're actually paying.

**What was built**:
- **The modal's layout bug is fixed.** The Name and Notes fields were
  bare `<label>` elements outside this app's usual `.field-row` wrapper,
  so they were rendering as inline elements sitting side by side instead
  of stacked rows -- the same wrapper every other full-width field in the
  app already uses (e.g. the Grade field) now wraps each one, so they
  stack cleanly and take the full width of the panel.
- **"Name" is now "Billing group title"** -- Nina's own suggestion, and a
  clearer description of what the field actually is (the group's
  identifying label, not a person's name).
- **Each member row now shows their subject(s) and monthly tuition**,
  reusing the exact same subject icons (blue M / red R) and ₱-formatted
  amount the Payments tab already uses, and the exact same rate table
  (`lib/tuition.js`) -- so a billing group card and the Payments tab can
  never disagree about what a student owes. This is deliberately just the
  plain "tuition due this month" figure, not folded into the Payments
  tab's fuller due/paid/balance tracking -- a billing group card isn't the
  place to also show payment status, that stays the Payments tab's job.
  A student with an unrecognized grade shows an em dash instead of a
  guessed amount, same "flag rather than guess" rule as everywhere else.

**Verification**: tested against an isolated copy of production data --
the modal's field layout, the "Billing group title" label wording, and
the new subjects/amount columns were all checked visually and against the
raw API response (confirmed a Grade-P2, one-subject student correctly
shows "M" and ₱2,200, matching `lib/tuition.js`'s published rate table).
Full create/rename/delete/add/remove/undo flow re-run clean, plus the
dropdown/combobox behavior from the entry above, plus the existing 5-tab
regression suite. Production database untouched throughout, checksum
reconfirmed unchanged.

## Same-day follow-up: multiselect add-member + a group total (Aug 25, 2026)

Nina (via voice note): the add-member box should be multiselect so staff
don't have to reopen/re-search the dropdown for every single student, and
each group should show a combined monthly total.

**What was built**:
- **The add-member box is now a real multiselect.** Clicking a search
  result (or pressing Enter on the highlighted one) no longer adds it
  immediately -- it stages the student as a small removable chip above the
  dropdown, and the dropdown stays open so you can keep searching and
  picking more without reopening anything. A student can be un-staged with
  the chip's own × before committing. An "Add N" button appears once
  anything is staged; clicking it (or pressing Enter again) adds everyone
  staged in one action. The one-keystroke fast path from the earlier
  dropdown follow-up still works unchanged for a single add: type, arrow
  down, Enter -- that now stages-then-immediately-commits the highlighted
  student in the same keystroke, so nothing got slower for the common
  single-add case.
- **One combined Undo covers the whole batch.** Adding 3 students in one
  "Add 3" click creates one Undo entry ("added 3 students to billing group
  ...") that reverts all 3 at once, not 3 separate entries -- same pattern
  already used elsewhere in this app for bulk actions (e.g. the Payments
  tab's bulk SOA/paid marking).
- **Each group card now shows a combined monthly total** next to Edit/
  Delete, summing every member's individual tuition (same rate table as
  the per-member amounts added in the entry above). A member whose grade
  can't be classified is called out separately as "N unresolved" next to
  the total rather than silently treated as ₱0, so the total never looks
  more complete than it actually is.

**A deliberate UX choice worth calling out**: clicking outside the
dropdown closes the search results (as before), but does NOT clear
whatever's already staged as chips -- only Escape, or removing a chip
individually, does that. Staged selections are a separate, persistent area
from the transient search dropdown, so an accidental click elsewhere never
silently throws away students already picked.

**Verification**: tested against an isolated copy of production data --
picking 2 students from one search, then a 3rd from a different search
without clearing the first two, removing one via its chip, committing the
rest, and confirming a single Undo click reverted the whole batch. The
existing single-add keyboard flow (arrow + Enter) and the search dropdown's
open/close/no-match behavior were re-verified unchanged, plus the full
create/rename/delete/remove flow and the existing 5-tab regression suite.
Production database untouched throughout, checksum reconfirmed unchanged.

## Combined Family SOA -- a new SOA tab (Aug 25, 2026)

Nina asked to keep building out pages, and picked the SOA page (roadmap
Phase 5) from a short list of candidates. Before building, three real forks
were scoped via `AskUserQuestion` rather than assumed:

1. **Output format** -- Nina chose a downloadable PNG image of the
   statement (not the printable-page or real-PDF-file options offered),
   most likely for sharing over Messenger/SMS the way statements already
   circulate day to day.
2. **SOA Sender / Responsible Teacher field** (Master Spec Part 8, item
   31-32) -- Nina chose not yet, since there's no login/role system yet
   (Phase 1) to actually restrict a group's SOA to one teacher.
3. **Generated/Sent status tracking** -- Nina chose live view only, no new
   table recording what's been generated/downloaded/sent.

**What was built**: a new "SOA" tab. Pick a billing group and a month
(defaults to the current live month; other months come from the same list
Payments tracks), and it renders one consolidated statement: center name,
billing group, month, then every member's subjects, tuition due, and
remaining balance (with a small note under a member's name when they have a
previous balance or a payment already recorded this month), followed by
group totals (tuition due, paid this month, remaining balance/credit). A
"Download statement (PNG)" button renders the same data onto an off-screen
canvas and downloads it as an actual `.png` file -- drawn by hand with the
Canvas API rather than a screenshot-the-DOM library, keeping this at zero
npm dependencies like the rest of the app. The canvas height is computed in
a quick measuring pass before the real draw, so the downloaded image is
cropped tight to its content instead of leaving blank space at the bottom.

**Deliberately read-only and additive, not a new payment path**: this
reuses `computePaymentSummary()` -- the exact same per-student calculation
the Payments tab already runs -- rather than a second implementation, so a
group's SOA total can never disagree with what each member's own Payments
row shows. Nothing here writes to `payment_record`; it's purely a rollup
view. This keeps it firmly on the "individual student tuition -> Billing
Group -> combined SOA" side of the architecture the Master Spec insists on
(Part 8), and stays clear of the still-open "Group Payment Allocation"
question (Part 9, item 42) -- no group-level payment is recorded or
allocated here, only displayed.

**Known limitation, stated plainly rather than hidden**: same as every
other month-aware view in this app (the Payments tab itself included) --
there's no per-month snapshot of grade/subjects yet (Phase 14), so picking
a past month still computes tuition from each student's *current* grade and
active subjects, not necessarily what was true that month. The SOA tab
shows an explicit caveat line whenever a non-current month is selected
rather than presenting the numbers as if they were historically exact.

**Verification**: tested against an isolated copy of production data --
created a real billing group with two real students, recorded a partial
payment on one and a full payment on the other in a different month,
confirmed the on-screen statement's per-member and total figures matched
hand-computed values via the raw API, downloaded the PNG and visually
confirmed it renders correctly and tightly-cropped, confirmed the download
button is disabled and a clear message shows for an empty group, and
confirmed the historical-month caveat appears only for non-current months.
The full existing 5-tab regression suite and the Billing Groups
CRUD/dropdown/amounts/multiselect test suites were all re-run clean
afterward. Production database untouched throughout, checksum reconfirmed
unchanged before and after.

## Same-day follow-up: one-click SOA from the Payments tab (Aug 25, 2026)

Nina: "i want the soa to be generated within the payments tab. beside each
of their names. i want the soa to automatically generate the sum of the
family/groups IF they belong to a group, if not, generate an individual
soa." A clear, self-contained ask -- no scoping questions needed this time.

**What was built**: every Payments row now has a "SOA" button next to Edit
and Mark absent. One click downloads that student's Statement of Account as
a PNG, using whichever month the Payments tab is currently viewing. The
server decides group vs. individual automatically (`getStudentSoa()` in
server.js): if the student has a `billing_group_id`, it returns the exact
same combined-family document the SOA tab produces (all members, one
total); if not, it returns a same-shaped document with just that one
student, so the button never requires a choice -- click it, get the right
document. The "individual" document reuses the identical rendering and PNG
export code as the group one (a solo student is just treated as a
"group of one" for display purposes), so there's exactly one document
format in the app, not two to keep in sync -- and one small wording
difference: an individual statement says "Billed to" instead of "Billing
group" in its header, since the latter reads oddly for someone who isn't
actually in one.

**Still reuses `computePaymentSummary()`, still read-only**: same
architecture guarantee as the SOA tab above -- this can never disagree with
what a student's own Payments row shows, and never writes to
`payment_record`.

**Verification**: tested against an isolated copy of production data --
clicked SOA on a grouped student (confirmed it downloaded the full 2-member
family statement, correct filename), then on an ungrouped student
(confirmed it downloaded a single-student statement labeled "Billed to,"
correct filename), both visually inspected. The full existing 5-tab
regression suite and the SOA tab's own test were re-run clean afterward.
Production database untouched throughout, checksum reconfirmed unchanged.

## Same-day follow-up: "Mark absent" moved off the Payments row, into Edit (Aug 27, 2026)

Nina: "also i dont think the mark absent belongs right there it doesnt
necessarily need to be super easy access. it can go inside the EDIT button
inside the payments tab then change status from active to absent." Clear
and self-contained -- no scoping questions needed.

**What changed**: the one-click "Mark absent" button that sat directly on
every Payments row (built two days earlier, see the "Mark absent" entry
above) is gone from the row. The exact same action -- the real
Active/Absent status change, same as the Roster/Absent tab's "Report
absent" -- now lives inside the row's Edit panel instead, under a new
"Retention status" section showing an Active badge and a "Mark absent"
button. The SOA button stays on the row untouched; only "Mark absent"
moved.

**Nothing about the underlying logic changed** -- deliberately. The same
`tagPaymentRowAbsent()` function is reused as-is: a student with exactly
one active subject goes straight to a confirm() dialog; a student with more
than one opens the existing subject picker (`absentTagPanel`) so staff can
choose which subject(s) to report. Only the trigger point moved. The picker
now opens on top of the already-open Edit panel (the app's overlay
machinery already supported stacked panels, so this needed no new
plumbing) -- Cancel on the picker backs out to the still-open Edit panel,
while actually confirming the report closes both panels together, since
the row's status just changed underneath them.

**Verification**: tested against an isolated copy of production data via
Playwright -- confirmed the row no longer has a "Mark absent" button (Edit
and SOA remain), opened Edit on a genuine single-active-subject student and
confirmed the confirm() dialog still fires with the same wording, the
student correctly leaves the Active Payments list afterward, and the Edit
panel closes on success; opened Edit on a genuine two-subject student
(Math + Reading) and confirmed the picker opens on top of the Edit panel,
Cancel returns to the still-open Edit panel without changing anything, and
confirming the picker closes both panels and reports the chosen subject(s).
Undo verified restoring both cases. Re-ran the full existing regression
suite (SOA-button test, standalone SOA tab test, Billing Groups suite,
cross-tab vocabulary smoke test) clean afterward. Production database
untouched throughout, checksum reconfirmed unchanged before and after.

## Same-day follow-up: the standalone SOA tab is gone; a download icon on the Payments-tab button (Aug 27, 2026)

Two small requests together: "lets delete the entire soa TAB but keep the
soa download generate button inside the payments tab," plus "currenly it
jut says Edit and SOA. can we add like a download icon beside soA so its
more inyuitive."

**SOA tab removed**: the dedicated "SOA" tab (pick a billing group + month,
view an on-screen statement, download it) built two days earlier is gone --
nav button, `<section id="view-soa">`, and its picker/on-screen-render code
(`loadSoaTab`, `loadSoaStatement`, `soaMemberLine`, `renderSoaStatementHtml`,
the tab's own `downloadSoaPng` wrapper) all removed, along with the
`.soa-statement`/`.soa-member-*`/`.soa-total-*` CSS that only styled that
on-screen view. The one-click "⬇ SOA" button on every Payments row --
already built the same day the tab was (see "one-click SOA from the
Payments tab" above) -- is untouched and is now the only way to generate a
statement. It didn't depend on the tab at all: `downloadPaymentRowSoa()`
always called its own endpoint (`GET /api/payments/:id/soa`) directly, so
removing the tab required no changes to how that button works, only to what
else existed alongside it. The canvas-based PNG-drawing code
(`drawSoaContent`, `renderAndDownloadSoaPng`) stays, since the row button
still needs it -- only the tab-only on-screen HTML rendering path was dead
code once the tab was gone. On the server side, `getBillingGroupSoa()` also
stays (the row button's `getStudentSoa()` still delegates to it for grouped
students) -- only its now-orphaned direct HTTP route
(`GET /api/billing-groups/:id/soa`, which only the deleted tab ever called)
was removed. The Billing Groups tab's own review-note, which used to say
"head to the SOA tab," now points at the Payments-tab button instead.

**Download icon added**: the Payments row's action buttons were plain text
("Edit" / "SOA"), which read ambiguously -- SOA could look like a status
label as easily as an action. Added a small "⬇" character before the
label ("⬇ SOA"), matching the same lightweight, zero-dependency icon
convention already used elsewhere in this app (e.g. the "↩ Returning"
badge) rather than pulling in an icon font or SVG library. Edit stays
plain text, unchanged, since "Edit" doesn't have the same ambiguity.

**Verification**: tested against an isolated copy of production data --
confirmed the SOA tab's nav button and section are both gone from the DOM
entirely, the Billing Groups tab's note now correctly points at the
Payments-tab button, the "⬇ SOA" button renders and downloads correctly
for both a grouped student (combined family statement) and an ungrouped
student (individual statement), and the removed `/api/billing-groups/:id/soa`
route no longer serves a per-group statement (falls through to the
existing list-all-groups handler instead, same as any other unmatched
sub-path on this minimal router -- harmless, not a new behavior this change
introduced). Also re-confirmed the previous same-day "Mark absent moved
into Edit" feature and the full existing regression suite (Billing Groups
CRUD/undo, cross-tab vocabulary smoke test) still pass unaffected.
Production database untouched throughout, checksum reconfirmed unchanged
before and after.

## Same-day follow-up: a real download icon, and green swapped for a Kumon blue (Aug 27, 2026)

Two visual requests together, both applied app-wide, not just to the SOA
button: "can the logo be like this?" (with a reference image of a
rounded-square download glyph) and "change all the colors from green to a
kumon blue."

**Download icon**: replaced the plain "⬇" character on the Payments row's
"SOA" button with an actual inline SVG matching Nina's reference image -- a
rounded-square outline with a downward arrow feeding into a tray line. No
icon library added; it's a small hand-written `<svg>` constant
(`DOWNLOAD_ICON_SVG` in app.js) using `currentColor`, so it automatically
matches whatever text color the button it's dropped into has -- no separate
color rule to keep in sync if the accent color changes again (which it did,
in the very same request). One real bug caught before this shipped: the
button's loading-state swap (showing "…" while the PNG generates) used to
read/write `btn.textContent`, which only handled plain text -- once the
button held an SVG child element too, restoring via `textContent` would
have silently replaced the icon with plain text after the very first
download. Fixed by switching that swap to `btn.innerHTML` instead, verified
by clicking the button twice in a row and confirming the icon was still
there both times.

**Green → Kumon blue**: this app's entire accent color -- every button, the
active tab underline, badges, highlights -- reads from exactly three CSS
custom properties (`--accent`, `--accent-hover`, `--accent-soft`) rather
than scattered hardcoded colors, so the whole rebrand was a three-line
change in `styles.css`. Looked up Kumon's own brand blue rather than
guessing (Kumon's marketing blue is roughly `#1B98D2`), then deepened it
slightly to `#0b6fa8` for the actual `--accent` value -- the lighter
marketing shade only clears about 3.2:1 contrast against white button text
(fails WCAG AA's 4.5:1 minimum for normal-size text), while the deepened
version clears about 5.4:1. Deliberately left the existing Math/Reading
subject-icon colors (blue for Math, red for Reading) untouched -- those are
an unrelated categorical color-coding, not the brand accent, and Math
already being blue made touching that scheme here more likely to cause
confusion than help.

**Verification**: tested against an isolated copy of production data --
screenshotted the Roster, Payments, and Billing Groups tabs to confirm the
new blue applies consistently everywhere the old green did (buttons, tab
underline, status badges, banners) without touching the unrelated
Math/Reading subject colors; zoomed into the Payments row's action cell to
confirm the download icon renders cleanly at its small size and picks up
the new blue automatically via `currentColor`; downloaded an SOA twice in a
row to confirm the icon survives the loading-state swap; re-ran the full
existing regression suite (SOA tab removal, Mark-absent relocation,
cross-tab vocabulary smoke test) clean afterward. Production database
untouched throughout, checksum reconfirmed unchanged before and after.

## Same-day follow-up: the Weekly Calendar's Math blue now matches the Kumon-blue accent too (Aug 27, 2026)

Nina, looking at a screenshot of the Weekly Calendar: "change the blue here
too to the same shade of blue." The entry above deliberately left Math's
blue (previously its own hardcoded indigo, `#3548a8` on `#e9edfb`) alone
since it's a separate categorical color-coding, not the brand accent -- this
follow-up is Nina explicitly asking for that separation to be closed, at
least for this color.

Math's chip/icon color now reuses the same values as the app's `--accent`
and `--accent-soft` (`#0b6fa8` on `#e7f2f8`) instead of its old indigo.
There's exactly one shared CSS rule pair for this color
(`.cal-chip.math` / `.subject-icon.math` in `styles.css`), so the change
applies everywhere Math shows up as a color -- the Weekly Calendar, and the
small subject-icon badges next to student names on the Payments, Absent,
and Billing Groups tabs -- not just the calendar screenshot Nina was
looking at. Reading's red is untouched. The new values are written as a
plain hex snapshot, not `var(--accent)`, so a future change to the button
accent alone won't silently recolor Math along with it -- if Nina ever
wants the two tied together going forward, that's a quick follow-up.

**Verification**: tested against an isolated copy of production data --
confirmed via computed styles that the Math chip/icon color now exactly
matches `--accent` (`rgb(11, 111, 168)` / `#0b6fa8`) on both the Weekly
Calendar and the Payments tab's subject icons, screenshotted the calendar
grid to visually confirm blue/red chips read clearly against each other,
and confirmed Reading's red and every other color are unchanged. Production
database untouched throughout, checksum reconfirmed unchanged before and
after.

## Receipt upload + Payment Verification tab (Aug 27, 2026)

Nina walked through, by voice note, how payments actually get recorded
today: a teacher receives a screenshot of a confirmed GCash/bank transfer
and emails it to a shared inbox; Joanne (the admin) opens each email and
retypes the reference number, amount, date paid, and date emailed into her
own trusted Google Sheet. Teachers' own sheets are never trusted -- only
Joanne's, because hers is built from the actual email receipts. Two
friction points: teachers doing manual email labor for every payment, and
Joanne retyping every reference number by hand.

The replacement: a Payments row now has a Receipt cell that's a drop
target, not a button -- drag a screenshot straight from the desktop onto a
student's row (or onto the Edit panel's own drop zone) and it uploads
immediately, no click-to-browse step. The server runs it through
[OCR.space](https://ocr.space)'s free tier (500 requests/day, no cost) to
pull a best-guess reference number, amount, and date out of the image text,
then a receipt sits as **Pending Review** until Joanne looks at it.

Joanne's job shifts from encoding to verifying, on its own tab -- **Payment
Verification**, separate from Payments per Nina's explicit request. Each
card shows the receipt image, the extracted fields (editable, since OCR is
a best-effort read of a phone screenshot, not a guarantee), and three
actions: **Verify** (she checked it against her own bank access and it's
real), **Flag** (something's off, with a required note explaining what),
or **Reject** (not a valid receipt at all -- also requires a note). Only a
**Verified** receipt's amount ever counts anywhere else in the app -- the
Payments tab's Paid/Balance columns, the come-back list, SOA generation --
a Pending or Flagged receipt changes nothing until Joanne acts on it.

A few decisions worth calling out, all confirmed with Nina first:

- **Cash stays exactly as it is today.** Only GCash/bank-transfer receipts
  get the upload/OCR/verify treatment -- there's nothing to photograph for
  a cash payment, so that path is untouched.
- **The existing manual "type an amount" / bulk Mark Paid actions are
  unchanged and ungated.** Nina was explicit about this: only the *new*
  receipt-upload path goes through Joanne's review queue. Typing an amount
  directly into the Edit panel, or bulk-marking a filtered set of students
  paid, still applies instantly, exactly like it did before this feature
  existed. The two paths only share a database column
  (`payment_record.amount_paid`) -- verifying a receipt just adds to it the
  same way a manual entry would.
- **A receipt can only be deleted while it's still Pending, Flagged, or
  Rejected.** Once Verified, its amount is already folded into the
  student's paid total, so deleting it would silently understate what they
  owe -- the Delete button simply doesn't appear on a Verified receipt.
- **Multiple receipts in one month are additive**, not a replacement --
  two partial transfers in the same month both get verified and both add
  to the paid total, tested against a real case (₱2,000 + ₱2,900 verified
  against a ₱4,400 due amount correctly landed on "Advance/Credit," -₱500
  balance).
- **No password gate on Verify/Flag/Reject.** The app has no login or role
  system anywhere yet -- the two narrow existing uses of the admin password
  (editing a closed month's history, locking ASHR) are deliberately rare,
  high-stakes actions, and Joanne would be using this tab constantly. Rather
  than invent a one-off password prompt for this feature alone, it's wide
  open the same way every other tab in the app is today. Worth a proper
  answer once the app has real accounts.
- **A single receipt covering multiple students in a billing group (with
  an auto-split by each member's tuition) is intentionally not built yet.**
  Nina chose "upload + basic verification first" when asked which piece to
  build first -- the harder splitting case is a deliberate follow-up, not
  an oversight.
- **OCR.space needs Nina's own free API key.** I can't create accounts on
  her behalf, so uploads work today with OCR left off (the field stays
  blank for Joanne to fill in by hand, same as an unreadable screenshot) --
  set the `OCR_SPACE_API_KEY` environment variable once Nina's registered
  one at ocr.space, no code change needed. Every OCR call is written so a
  missing key or a failed request never blocks the upload itself, it just
  means the fields start blank.

New database table, `payment_receipt`, keyed by `(student_id, month)`
rather than tied to a specific `payment_record` row -- the same pattern the
app already uses for `payment_record` itself, since a receipt can arrive
before any payment record exists yet for that month. Receipt image files
are saved to `data/receipts/`, capped at 8MB, PNG/JPEG/WebP only.

**Verification**: syntax-checked throughout; backend (upload, OCR
degrade-gracefully paths, verify/flag/reject validation, additive-amount
math, delete guards, undo coverage) tested extensively via curl against an
isolated copy of production data before the frontend existed. Once the
frontend was wired up, a full Playwright run against a fresh isolated copy
exercised the entire flow end to end: dropping a receipt directly onto a
Payments row, a second drop via the Edit panel's own drop zone, deleting an
unverified receipt from the Edit panel, opening the Verification tab and
running Verify (confirmed the paid amount and paid date landed correctly),
Flag (confirmed a missing note is blocked, and confirmed a flagged
receipt's amount is *not* applied), Reject, Undo restoring a rejected
receipt, the delete guard correctly hiding the Delete button on a Verified
receipt, the receipt image viewer loading the actual uploaded image, and
confirming the existing manual "type an amount" path still applies
instantly with no gate -- 27 checks, all passing. A visual pass also caught
and fixed one real bug this round: the Edit panel's drop zone was missing
its styling class, so the drop icon rendered oversized instead of as the
small dashed drop target -- fixed and reconfirmed with a fresh screenshot.
A full regression pass across every other tab (Roster, Weekly Calendar,
ASHR, Absent, Billing Groups, plus Payments' search filter and bulk
actions) confirmed nothing else broke. Production `data/roster.db`
checksum reconfirmed unchanged before and after every test run.

## Same-day follow-up: splitting one receipt across a whole billing group (Aug 27, 2026)

The deliberately-deferred piece from the receipt-upload feature above turned
out to matter immediately: Nina hit it for real. Three siblings (Shaheem,
Saif Zihni, and Saad Abbas) are billed together as a Billing Group, but
their mother sends one combined GCash transfer for all three. Nina uploaded
the same receipt screenshot onto each sibling's own Payments row
individually (so each had proof of payment on file) and verified all three
-- and each one got credited the *full* ₱6,600, tripling what actually came
in instead of splitting it three ways.

The fix: a receipt drop onto a student who belongs to a Billing Group now
pauses with a choice -- "just this student" (skips straight to the exact
upload flow from before, completely unchanged) or "split across the whole
group" (opens a new panel listing every member with an editable amount,
defaulting to each one's own remaining balance this month, pulled from the
same SOA endpoint the Billing Groups tab already uses so the split amounts
are never computed a second, independent way). Submitting it uploads the
file once and creates one receipt row per member, all sharing a hidden
group id so they behave as one transaction from here on: the Verification
tab shows them as a single combined card (one thumbnail, one shared
reference/date, per-member editable amounts, a live "total entered" check)
with **Verify all / Flag all / Reject all** buttons and a single **Undo**
that reverses every member's receipt and balance together. A "Handle these
separately instead" link on the combined card falls back to the exact
original one-card-per-receipt view, untouched, for anyone who'd rather
decide each sibling on their own.

Deliberately kept simple: `payment_receipt` stays exactly the one-row-per-
transaction table it already was -- a group upload just stamps a shared
random id (`group_upload_id`) onto the N rows it creates, rather than
redesigning the table around a new join/split concept. Every existing
single-receipt code path (Edit panel's receipt list, Payments-row chip,
delete guard, per-row Undo) keeps working completely unchanged for every
receipt, grouped or not -- a receipt chip and the Verification queue just
show a small "Group" badge when one is part of a shared upload, so it's
never ambiguous which receipts are linked.

In the meantime, since her real Abbas receipts were already uploaded and
verified individually before this feature existed, Nina was given the
immediate manual fix in chat: edit each sibling's "Amount paid this month"
down to their correct ₱2,200 share (manual entry replaces rather than adds
to the stored amount) -- unrelated to and unaffected by this build.

**Verification**: syntax-checked throughout. Backend
(`saveGroupReceiptUploadWithUndo`, `verifyReceiptGroupWithUndo`,
`setReceiptGroupDecisionWithUndo`, and the three new routes) tested extensively via curl against an
isolated copy of production data first -- the happy path (3-sibling group
upload with a ₱6,600 receipt split three ways, one combined verify, all
three balances landing exactly at ₱0/Paid, matching Nina's real numbers)
plus edge cases: note-required validation on group Flag/Reject, the delete
guard still applying per receipt, re-verifying an already-verified group
erroring cleanly, an invalid group id, a non-member student id being
filtered out of a split, and a zero/invalid split amount being rejected.
Once the frontend was built, a full Playwright run against a fresh isolated
copy (with a temporary test Billing Group set up for the three Abbas
siblings already in the sample data) exercised the whole flow end to end:
dropping a receipt on a grouped student and choosing "split across the
group" opened the panel pre-filled with each sibling's own ₱2,200 balance;
submitting created three linked receipts, each showing the new "Group"
badge on its Payments-row chip; the Verification tab rendered them as one
combined card; Verify all correctly landed every sibling at ₱2,200 paid
(not ₱6,600); a single Undo click reversed all three receipts and balances
back to Pending/Unpaid together; "Handle these separately instead" correctly
fell back to the three original individual cards; an empty note correctly
blocked a group Reject; and choosing "Cancel" (just this student) on the
initial prompt still produced a single ordinary solo receipt with no group
id attached, and a non-grouped student's drop never showed the prompt at
all. Production `data/roster.db` checksum reconfirmed unchanged before and
after every test run.

## Same-day follow-up: the downloaded Statement of Account got a real visual redesign (Aug 27, 2026)

Nina sent four reference images and asked to make the downloaded SOA
"easy to understand with bolder texts but still following the Kumon
branding": the center's own paper SOA template (a bold navy-blue header
block with big white/yellow text), and two unrelated SaaS dashboard
screenshots (an invoicing app's "Invoices" card, a crypto exchange's
"Total Balance" panel) as style references for bold, prominent numbers.
Asked which direction to take before building rather than guessing between
"mirror the navy paper form," "keep white with bolder text," or a hybrid --
she picked mirroring the paper template. First pass used a deep navy
(`#15205c`) header/footer band with gold (`#ffcb3d`) highlights, bold pill-
shaped status badges per member instead of plain colored text, and
Math/Reading color-coded to match the app's own subject-icon blue/red. Nina
saw it and asked for one more pass: "still professional but make sure the
color harmony is on point maybe baby blue kumon blue instead of that deeper
blue." Rebuilt the palette using colors already established elsewhere in
this exact app rather than the invented navy/gold pair -- the header/footer
band is the app's own `--accent-soft` ("baby blue," the same pale blue
behind every Math subject badge), headline text uses `--accent`/
`--accent-hover` (the app's actual "Kumon blue" from the Aug 27 green-to-
Kumon-blue rebrand earlier this same day), and the grand total is colored
using the *exact* same red-owed/blue-credit convention Joanne already reads
on the Payments tab (`.balance-due`/`.balance-credit`) instead of an
unrelated gold -- one consistent palette end to end, nothing new invented.
Structure carried over from the paper-template pass: a bold branded
header band (center name, "Statement of Account," billing group/student
name, month), a clean white body with a labeled table header row (STUDENT
/ TUITION DUE / STATUS) and bold pill status badges (SETTLED gray, DUE
red, CREDIT blue) per member, and a matching branded footer band with the
grand total rendered large and bold. Purely a visual rewrite of
`drawSoaContent()` -- the exact same live data (`computePaymentSummary` via
`getStudentSoa`/`getBillingGroupSoa`) and the same two-pass measure-then-
draw canvas mechanism as before; no schema, route, or calculation changed.
One real bug caught and fixed during the first pass: the subject list's
closing parenthesis was missing after the new color-coded subject-drawing
helper was introduced (`drawColoredSubjects` needed to return its final x
position so the parenthesis could be drawn after it, not before) -- caught
by an actual downloaded-PNG visual inspection, not just eyeballing the
code, and fixed before the color-harmony pass began.

**Verification**: syntax-checked throughout. Verified visually via
Playwright against an isolated copy of production data -- actually
downloaded and inspected the generated PNG (not just a page screenshot,
since this is a canvas-drawn file download) across every real status
combination: a mixed billing-group statement (one settled, one partially
paid/still due, one in credit), an all-settled group (confirms the grand
total correctly renders neutral gray at exactly ₱0, not red or blue), a
group total landing in overall credit (confirms the "TOTAL CREDIT" label
and blue coloring), and an individual (non-grouped) student with two
subjects (confirms Math renders blue and Reading renders red, matching the
app's existing subject-icon colors, and the "BILLED TO" header caption
instead of "BILLING GROUP"). A 4-member group was also rendered to confirm
the two-pass measure/draw sizing still fits a longer statement with no
clipping or blank space. Production `data/roster.db` checksum reconfirmed
unchanged before and after every test run.

## Same-day follow-up: back to navy/gold, with bigger font (Aug 27, 2026)

Nina compared the two design passes above side by side (four screenshots of
the navy/gold first pass) and asked to "make the font bigger -- then let's
go back to this," choosing the navy/gold look over the baby-blue follow-up
that shipped right after it. Reverted `drawSoaContent()`'s palette to the
navy (`#15205c`) header/footer band with gold (`#ffcb3d`) headline/total
text and a muted light-blue-gray (`#9fb3d9`) for secondary labels -- the
exact pair from the original paper-template pass -- and scaled up every
font size in the statement (center name 23px to 27px, group/student name
22px to 26px, member names 15px to 18px, subject text 14px to 16px, the
grand total 30px to 36px, status pills 11px to 13px, and so on throughout),
along with the spacing around each of them so nothing overlaps or crowds at
the larger sizes (header band 182px to 206px tall, footer padding and line
heights widened to match). The grand total went back to always rendering in
gold, matching the reference images, rather than the red-due/blue-credit
convention added during the baby-blue pass -- per-member status pills still
color themselves red/blue/gray by due/credit/settled exactly as before,
only the one big footer number reverted. No data, calculation, or mechanism
changed -- still the same `computePaymentSummary`-backed data and two-pass
measure-then-draw canvas render.

**Verification**: syntax-checked. Verified visually via Playwright against
an isolated copy of production data (a temporary Billing Group set up for
the three Abbas siblings in the isolated copy only, the same pattern used
for every prior SOA verification round) -- downloaded and inspected the
actual PNG across an individual/ungrouped student, a 3-member billing group
with everyone unpaid, a 3-member group with a partial payment (confirms the
"Paid this month" note line still fits under the larger fonts with no
clipping), and a 3-member group mixing settled/due/credit statuses
(confirms all three pill colors and the "TOTAL CREDIT" gold total render
correctly at the larger size). Production `data/roster.db` checksum
reconfirmed unchanged before, during, and after testing -- the temporary
test group and test payment edits only ever touched the isolated `/tmp`
copy, never the real database.

## Postgres port for Vercel deployment (Aug 27, 2026)

Nina asked to deploy this to Vercel, with GitHub for source control. Vercel's
serverless functions have no persistent local disk between requests, which
is fundamentally incompatible with the SQLite file (`data/roster.db`) and
the local `data/receipts/` folder this app used everywhere up to this point
-- the same wall a prior attempt (documented in the Aug 19 entry above) hit
and had to stop at. After walking through the tradeoffs with Nina, she chose
migrating to Postgres (reusing her existing Supabase project) over the
alternatives (a host that supports a real disk, like Railway or Render, or
holding off on deployment).

This is a big, multi-part migration, broken into pieces and verified at each
step rather than attempted as one giant unverified rewrite:

**Schema + data migration (done, verified).** `migration/postgres-schema.sql`
is the app's full schema translated to Postgres (`SERIAL` instead of
`INTEGER PRIMARY KEY AUTOINCREMENT`, boolean-like columns kept as `INTEGER`
to minimize app-layer changes, timestamp columns kept as formatted text to
preserve the existing string-comparison/sort logic). `migration/sqlite-to-postgres.js`
reads a real `roster.db` via `node:sqlite` and emits a plain `.sql` file of
INSERT statements -- deliberately file-based rather than a live DB-to-DB
connection, since this sandbox has no way to reach a real Supabase instance
directly (no outbound network access), and this way the exact same script
works from Nina's own machine against her real data. See `migration/README.md`
for the full handoff steps -- importantly, the `roster.db` bundled in this
repo is a shared testing copy with zero real payment/billing/receipt
history (that only exists on Nina's Mac), so the final production migration
has to run against her actual file, not this one.

**Database layer (done, verified).** `lib/db.js` was rewritten from
node:sqlite's synchronous API to Postgres's async one. Rather than a manual
line-by-line rewrite of the ~140 places `server.js` talks to the database
directly, `lib/pg-compat.js` wraps a Postgres connection pool in the same
`db.prepare(sql).get/all/run(...)` shape the old SQLite code already used
(`?` placeholders auto-convert to Postgres's `$1, $2, ...`), so the actual
mechanical change needed at each call site was adding `await` -- not
re-deriving 140 pieces of business logic from scratch. The ~750 lines of
`lib/db.js` that were one-time data repairs (already-applied against the
SQLite database before it was migrated) or a SQLite-only constraint
workaround were intentionally not ported -- they have nothing left to do
against data that's already in its final shape.

Because this sandbox has no npm registry access, the real `pg` package
can't be installed here to test with. `lib/pg-lite.js` is a small hand-rolled
Postgres client (built from Node's own `net` module, implementing just
enough of the wire protocol to run this app's queries) used only as a local
fallback -- `lib/db.js` prefers the real `pg` package and only reaches for
this if `pg` isn't installed, which will only ever be true here, never on
Vercel (where `npm install` has full registry access). This let the whole
rewrite be tested for real against a local Postgres instance set up in this
sandbox specifically for that purpose, rather than shipped untested.

That testing caught two real bugs that only a real database, not just a
syntax check, would have surfaced: search fields (`LIKE`) used to be
case-insensitive under SQLite by default but are case-sensitive under
Postgres -- every name/search filter now explicitly uses `ILIKE` instead.
And the Promise-based rewrite fans out many concurrent database calls where
the old synchronous code never had more than one in flight at a time (e.g.
computing tuition for a whole Payments-tab page of students at once) --
against `pg-lite`'s one-connection-per-query design that opened enough
simultaneous connections to hit Postgres's own connection limit and crash
the server. Fixed by adding the same kind of connection-count cap `pg`'s
real connection pool already has, so local testing now matches how the
real driver will behave in production.

Verified end to end against a local Postgres instance loaded with the same
reference data this repo ships: every route was exercised over real HTTP
(list/search/create/edit/delete across Roster, Payments, Billing Groups,
Absent, ASHR, Calendar/Attendance, receipt upload + OCR + verify, admin
password change), and every Undo-covered action was confirmed to actually
reverse correctly, including the trickiest case (deleting a whole student
and undoing it, which has to re-insert every dependent row with its
original id intact so nothing else pointing at it breaks). Production
`data/roster.db` was never touched by any of this -- all testing ran
against a separate local Postgres database, never the app's real SQLite
file.

**Still ahead:** ~~moving receipt image storage off local disk~~ (done, see
the follow-up section directly below), wrapping `server.js`'s routing for
Vercel's serverless format, pushing this to GitHub, and then the actual
Vercel import + environment variable setup.

## Same-day follow-up: receipt storage moved off local disk (Aug 27, 2026)

The other piece of local disk this app depended on, besides the SQLite file
already covered above: every uploaded receipt screenshot lived in
`data/receipts/`, written with plain `fs.writeFileSync` and read back with
`fs.createReadStream`. Same problem as the database -- Vercel's serverless
functions don't keep a persistent local disk between requests, so that
folder would be unreliable (writes from one invocation may simply not be
there for the next) the moment this app actually runs there.

**What changed.** The read/write of receipt image bytes now goes through a
new `lib/receipt-storage.js`, used from both `writeReceiptFileAndRunOcr`
(the shared save path both the solo and whole-group receipt uploads already
funneled through) and the `GET /api/payments/receipts/:id/image` route.
That module picks its backend the same way `lib/db.js` already picks
between `pg` and `pg-lite`: it tries `require('@vercel/blob')`, and uses
the real package if that succeeds (always true on Vercel, now that it's
actually listed in `package.json` -- see the dependency-declaration bug
below) or falls back to the exact original local-disk behavior if it
isn't installed, which is only ever true in this sandbox. Vercel Blob is
the natural choice for the image side of this migration specifically
because it's already in the same ecosystem as the rest of this deployment
(same Vercel team/project the Postgres migration already targets), not a
third unrelated service to wire up.

Blobs are stored with `access: 'private'`, not the more obvious-looking
`'public'` option -- deliberately, not by default. A private blob's URL
can't be fetched by anyone who doesn't hold this app's own Blob
credentials (a server-side-only OIDC token or `BLOB_READ_WRITE_TOKEN`,
never sent to the browser), so the only way to ever see a receipt image
stays this app's own `/api/payments/receipts/:id/image` route, matching
the original local-disk version's privacy posture exactly (the raw file
path was never exposed to the client there either). This mattered enough
to settle deliberately rather than default to whatever's simplest: receipt
screenshots are payment proof -- GCash/bank reference numbers, sometimes
partial account info -- and `kumon-privacy-assessment.md` already flags
payment data as one of the two categories in this app most likely to cause
real harm if it leaked. `payment_receipt.file_path` keeps meaning exactly
what it meant before in both modes -- Blob's `put()` hands back a
`pathname` that, with no random suffix added, is simply the same filename
`writeReceiptFileAndRunOcr` already generated, so no data migration is
needed for this column when switching storage backends.

**A real dependency-declaration bug found and fixed along the way.**
`lib/db.js`'s comment about `pg` always being available "on Vercel, where
npm install has full registry access" was true about registry access but
skipped a real requirement: `npm install` only installs what's listed in
`package.json`, and `pg` was never actually added there during the
database-layer work. Left as it was, the real `pg` package would never
have been installed on a real Vercel deploy at all -- `require('pg')`
would have failed and silently fallen back to `lib/pg-lite.js`, the
local-testing-only client that explicitly can't authenticate against a
real database (no SSL, no SCRAM-SHA-256). That would have taken the whole
app down the moment it tried to touch the database in production, in a way
that would only surface at first deploy rather than during any of the
testing done so far. Fixed by adding both `pg` and `@vercel/blob` as real
entries in `package.json`'s `dependencies`, which this sandbox's own lack
of npm registry access made easy to miss since installing them here to
notice the gap was never possible in the first place.

**A second, unrelated bug found while testing this feature.** Deleting a
receipt and then clicking Undo silently did nothing -- the row stayed
deleted. `deleteReceiptWithUndo` recorded its undo step as `restore_row`,
but that step type runs an `UPDATE ... WHERE id = ?` (see `restoreRow()`),
which is for undoing an *edit* to a row that's still there; against a row
that's been fully `DELETE`d, the `UPDATE` matches zero rows and quietly
does nothing, while the app's own Undo button still reports success. Fixed
by switching the step to `insert_row` (which re-creates the row with its
original id), the same mechanism every other full-delete Undo in this app
already correctly uses (`deleteStudentWithUndo`, `deleteEnrollmentWithUndo`,
`deleteBillingGroupWithUndo`). This bug predates the Postgres migration
entirely -- the logic was carried over unchanged from the original SQLite
version -- and slipped past the receipt feature's original Aug 27 testing
because that pass verified *that* deleting a receipt worked, but didn't
specifically chain through to Undo-ing that particular delete (a different
receipt action, rejecting one, *did* get its Undo tested, and that one is
correct as-is since a reject is an edit-in-place, exactly what `restore_row`
is for).

**Verification.** Ran the full receipt flow over real HTTP against the same
local Postgres instance used for the database-layer testing above: uploaded
a real image to a solo student, confirmed the returned bytes from the image
route match the uploaded bytes exactly (byte-for-byte, via checksum) before
touching anything else; deleted it, confirmed it's gone from the database
and the image route correctly 404s; clicked Undo, confirmed the row comes
back with its original id and `file_path`, and confirmed the image is
*still* fetchable and still byte-identical afterward (proving the fix
actually restores a working receipt, not just a database row) -- this
specific chain is what caught the Undo bug above, and was re-run clean
after the fix. Separately uploaded a whole-group receipt (2 students,
one shared file, per-member split amounts) and confirmed both members'
image routes correctly serve the exact same underlying file. Confirmed a
nonexistent receipt id's image route still cleanly 404s. Spot-checked
Payments, Absent, Billing Groups, and the pending-receipts queue all still
respond normally afterward. All test data (receipts, the temporary test
billing group and its memberships) was cleaned up afterward, and production
`data/roster.db`'s checksum was reconfirmed unchanged throughout -- this
work never touched it, same as every other increment of this migration.

**Still can't be tested for real here.** Unlike the `pg`/`pg-lite` split,
there's no local stand-in that actually exercises Vercel Blob's real wire
behavior -- this sandbox has no outbound network access at all (confirmed
in an earlier session investigating this same hosting move), so the
`usingBlob === true` branch in `lib/receipt-storage.js` has only been
verified by careful reading of Vercel's own Blob documentation and by
`node --check`, never by a real upload/download round trip. The local-disk
branch above is the one this app's test suite actually exercises, byte for
byte, unchanged from before this file existed. Worth a real smoke test
(upload one receipt, confirm it displays) right after the first Vercel
deploy -- flagged here rather than silently assumed correct, the same way
the OCR.space integration needed a first real test once Nina had her own
API key.

## Same-day follow-up: wrapped server.js for Vercel's serverless format (Aug 27, 2026)

Task #46 of the deployment plan. Vercel doesn't run a long-lived process the
way `node server.js` does locally -- it needs each request routed to a
"Vercel Function," and the shape that takes depends on which of Vercel's
conventions the project matches.

**What was researched first.** Checked Vercel's current docs directly
rather than assuming older tutorials still apply, since this changed
recently: a generic file under `/api/*.js` now has to use the Fetch API
`Request`/`Response` signature (`export default { fetch(request) {...} }`),
not the classic Node `(req, res)` signature most existing raw-`http` code
(including this app's) is written against. Building a hand-rolled adapter
between the two was the fallback plan, but Vercel also auto-detects an
Express app with zero config: a file named `server.js` (this app's actual
entry point, no renaming needed) that `require`s `express` and either
exports the app or calls `app.listen()` gets wrapped as one Vercel
Function automatically, with Vercel's own (well-tested) bridge handling
the Fetch-to-Node translation internally. That's the lower-risk path, so
that's what got built. Confirmed first, via `grep`, that this app's actual
`req`/`res` usage is narrow enough to make the swap free: `req.headers` is
only read in one line building the request URL, `req.method` is checked
throughout the route table, and the only `res` calls anywhere are
`res.writeHead`, `res.end`, and one `.pipe(res)` for receipt images --
all of which Express's `res` (a real subclass of `http.ServerResponse`)
supports identically. Static files (`public/index.html`, `app.js`,
`styles.css`) need nothing extra either -- Vercel serves anything under
`public/` from its CDN directly, bypassing the function entirely.

**What changed.** `server.js`'s old unconditional
`http.createServer(handleRequest).listen(...)` at the bottom of the file
was replaced with a three-way dual-mode bootstrap, gated on
`require.main === module` (the standard Node way to tell "was this run
directly" from "was this required as a module"):
- Run directly (`node server.js` / `npm start`, local dev and Nina's own
  usage): behaves exactly as before, a plain `http.createServer`.
- Required as a module, with `express` installed: builds a minimal
  Express app (`app.use(handleRequest)`) and exports it -- the path
  Vercel's zero-config detection picks up in production.
- Required as a module, without `express` installed (this sandbox, which
  has no npm registry access -- same reason `pg` and `@vercel/blob` need
  fallbacks): exports `{ handleApi, serveStatic, handleRequest }` directly
  instead, so this exact codebase can still be exercised and tested here
  even though the real Express wrapping can't be.
`express` (`^4.21.0`) was added to `package.json` as a real dependency --
same require-with-fallback pattern used for `pg` and `@vercel/blob`
already, now used a third time for the same underlying reason (no
registry access in this sandbox, full access on a real Vercel build).
`handleApi` and `serveStatic` themselves were not touched -- the only
change is how the bottom of the file wires them up.

**Bug caught before it shipped.** A stray `#` landed at the start of one
comment line during the edit (should have been `//`) -- would have been a
JS syntax error. Caught by grepping for it proactively right after the
edit, fixed, and reconfirmed with `node --check server.js`.

**A false alarm during verification, worth recording honestly.** Testing
this by calling the exported `handleRequest` directly with hand-built
fake `req`/`res` objects (since `express` itself can't be installed here
to test the real wrapped path) initially looked like a hang: a
`GET /api/payments` request never wrote a response within a several-second
test timeout, with nothing thrown or logged. Narrowing it down --
`/api/teachers` (a single query) returned correctly through the exact same
harness; only `/api/payments` (which fans out one summary query per
active student via `Promise.all`, ~185 students in this dataset) appeared
stuck. Turned out to just be slow, not stuck: rerunning with a longer
wait showed it completing correctly every time, and a real end-to-end
timing check against the actual running server confirmed it -- about 7.4
seconds for `/api/payments`, against well under 100ms for every other
route. That's a real characteristic of this sandbox's `pg-lite` fallback
(a small hand-rolled client, explicitly not a real connection pool) doing
that per-student fan-out effectively one query at a time over a single
connection -- not a bug in `handleApi`, `listPayments`, or the new
Express-wrapper design, and not expected to reproduce on Vercel, where
the real `pg` package's actual connection pool can dispatch several of
those per-student queries concurrently across multiple connections. Worth
keeping an eye on `/api/payments`'s real-world latency after the first
Vercel deploy regardless, given the `Promise.all` fan-out shape stays the
same either way -- flagged here rather than dropped once the "it's not
actually a bug" relief set in.

**Verification.** `node --check server.js` clean. Ran the real
`node server.js` locally (unchanged local-dev path) and hit it with real
`curl` requests: `/api/teachers`, `/api/billing-groups`, the static
`/` page, and a nonexistent-id receipt-image route all returned the
expected status codes and payloads; a deliberately-unmatched `/api/*`
route correctly 404s; `/api/payments` returned a well-formed 200 with the
full expected JSON shape (confirmed by inspecting the response body, not
just the status code). Separately drove `handleRequest` directly (the
non-Express fallback path) with synthetic `req`/`res` objects for both a
light route and `/api/payments`, confirming both complete correctly and
return the right status/body once given enough time -- see the false
alarm above. Production `data/roster.db`'s checksum was reconfirmed
unchanged before and after this task's testing, as with every prior
increment.

**Still ahead for the Vercel move:** #47 (create the GitHub repo, push via
Nina's own local git) and #48 (import into Vercel, set the `DATABASE_URL`
/ Blob env vars, first real deploy -- including the two real smoke tests
flagged above: a fresh receipt upload/display round trip through actual
Vercel Blob, and a real-world timing check on `/api/payments`).

## Running it

No installation step needed — everything below is either a Node.js built-in
or already in this folder.

```
npm start
```

Then open **http://localhost:3300** in your browser. That's it — the database
(`data/roster.db`) is created and seeded automatically the first time it runs.

To wipe it and reseed from scratch (e.g. after you edit `data/seed-data.json`):

```
npm run reset-db
```

## Why this isn't a Next.js / React app

You mentioned the real app lives inside your existing Vercel project, and I'd
normally build the new page directly inside that codebase to match its stack.
Two things stood in the way this round:

1. **No repo access yet** — we agreed to build standalone for now rather than
   connect your codebase, since we hadn't sorted out how to share it.
2. **This build session had no package-registry access** (npm/pip installs
   were blocked outbound), so I couldn't pull in Next.js, React, or a database
   library like Prisma.

So this prototype is built entirely on Node.js built-ins: the `http` module
for the server and API, and `node:sqlite` (built into Node 22+, no install
required) for the database. The frontend is plain HTML/CSS/JavaScript — no
framework, because a single table-and-form page doesn't need one.

**This doesn't change the deliverable's value** — it's a fully working,
testable app with a real database and real CRUD, and every design decision
(schema, field names, validation, the "teacher is just an attribute" model)
carries over directly. When you're ready to fold this into your actual
Vercel app, the porting work is mechanical: the SQL in `lib/db.js` maps
almost 1:1 to a Prisma schema, and the three API routes in `server.js`
become three Next.js route handlers. Happy to do that port in a future
session once we've sorted out repo access.

## What's in the data

**Updated Aug 19, 2026** — rebuilt to be **August-2026-only**, and to only
include instructors actually teaching this month:

- **991 students**, **1,205 subject enrollments** (Math and/or Reading),
  extracted from each active instructor's **August 2026** REPORT sheet only
  (no earlier months mixed in, unlike the first version of this app).
- **18 staff records**: 13 active instructors (10 from the original 5
  workbooks, plus 3 teacher trainees — Mira, Sugar, KC — added from a new
  `TRAINEE.xlsx` you sent), Nina, and 4 general staff with unconfirmed roles.
  **Kiara, Mariz, Sweet, Cath, Trixi, and Weda have been removed entirely**
  (not just marked inactive) since they're confirmed no longer teaching —
  cross-checked against the August 2026 payroll, where none of them appear.
  **Lycka is back in as active** — she'd been marked departed based on an
  earlier note, but she's in the August payroll and has an August REPORT
  sheet, and you confirmed she's still teaching.
- **Hamid and Jea are now one combined teacher, "JEA AND HAMID"** — their
  shared sheet only marked which of the two owned a row for about the first
  45 of 194 students, so rather than leave the other 151 unassigned, they're
  now merged into a single teacher per your instruction. All 194 of their
  students show up under "JEA AND HAMID," and **needs-teacher-review is down
  to 0**.

### Known extraction caveats, worth a review pass

- **Current level isn't recorded for every enrollment** (a chunk show "not
  yet recorded"). Some of that is genuinely new students; some is because
  the teacher hadn't filled in August's numbers yet as of whenever the sheet
  was last touched. The app is now the place to keep this current going
  forward.
- **Grade values are inconsistent** in the source (some sheets use "P4",
  others just "4", plus "K"/"PK1-3") — I left them as-is rather than
  guessing a single convention. Worth deciding on one format and cleaning
  up in the app.
- **A few schedule times carry an explicit early-morning "AM" marker** (e.g.
  "2:00 AM") that seems unlikely for this center's actual hours — unlike the
  bare/unmarked times (which get auto-corrected to PM, see `lib/schedule.js`),
  these have someone's literal "AM" typed in the source, so I left them as
  entered rather than override a stated value. Worth a glance if you spot one
  in the calendar.
- Whether the AI/AII/BI/BII-style Reading sub-levels are an official
  convention (only used in Reading) is still unconfirmed.
- There are a number of additional names in the August payroll (front-desk
  and other support staff — Jean Andriah Basbas, Bon Clyde Pomicpic, Maria
  Lyrabelle Sebarios, Shane Charlotte Tan, Lurleen Ghellerie Ocaya, Ramjay
  Rebucas, Agnes Bergado, Joan Abarca, Kristine Joy Garcia, and one listed
  only as "Shareene") who don't have a REPORT sheet in any workbook sent so
  far. They're not in the app yet — let me know if any of them teach and
  have a report sheet somewhere else.

Source spreadsheets were never modified — this is a fresh extraction into
the app's own database, per the read-only rule.

## Project layout

```
server.js          -- HTTP server + JSON API (no framework)
lib/db.js          -- schema, seeding logic (node:sqlite)
lib/schedule.js     -- free-text -> structured day/time slot parser
public/            -- the frontend (index.html, styles.css, app.js)
data/seed-data.json -- the cleaned extraction from your source workbooks
data/roster.db     -- created on first run (not checked in)
```
