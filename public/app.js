const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Download icon (Aug 27) -- inline SVG, no icon library, matching a
// rounded-square download glyph Nina referenced. Uses currentColor so it
// always matches whatever button it's dropped into (the accent blue for
// the Payments row's "SOA" button below), no separate color rule to keep
// in sync if the accent color ever changes again.
const DOWNLOAD_ICON_SVG = `<svg class="btn-icon-download" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="2"/>
  <path d="M12 7.5v7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M8.5 11.5L12 15l3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M8 18h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

// Receipt icons (Aug 27 follow-up) -- same hand-written inline-SVG,
// currentColor pattern as DOWNLOAD_ICON_SVG above, no icon library. Reused
// across the Payments row's empty drop-zone placeholder, the Payment
// Verification queue's Verify/Flag/Reject buttons, and the receipt-viewer
// modal trigger.
const RECEIPT_ICON_SVG = `<svg class="receipt-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;
const CHECK_ICON_SVG = `<svg class="btn-icon-inline" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const FLAG_ICON_SVG = `<svg class="btn-icon-inline" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M6 3v18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M6 4h11l-2.5 3.5L17 11H6" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
</svg>`;
const REJECT_ICON_SVG = `<svg class="btn-icon-inline" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
</svg>`;

const state = {
  teachers: [],
  levels: [],
  timeslots: [],
  groups: [],
  ashr: { cycles: [], selectedCycle: null },
  payments: { selection: new Set() },
};

// Same standardized grade list as lib/ashr.js's GRADE_ORDER -- duplicated
// here rather than exposed via a new endpoint, since it's static reference
// data the frontend needs at startup regardless of which cycle is loaded.
const ASHR_GRADE_ORDER = ['PK3', 'PK2', 'PK1', 'K', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11'];
const ASHR_TIER_ORDER = ['KIS', 'Bronze', 'Silver', 'Gold', 'ASF', 'Completer', 'Double Award', 'N/A'];

function todayAbbrev() {
  return DAY_ORDER_WITH_SUN[new Date().getDay()];
}
const DAY_ORDER_WITH_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const el = (id) => document.getElementById(id);

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function to12h(time24) {
  if (!time24) return null;
  const [h, m] = time24.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

// Aug 21 follow-up (Nina: "when you mark a student as active again, we
// need a way to indicate that they are a returnee and not a new student")
// -- purely computed from data that already exists (roster_status back to
// Active, but absent_reported_date still on record from before), so no new
// column was needed. Used on both the Roster and Payments tables.
function fmtReturneeBadge(row) {
  if (row.roster_status !== 'Active' || !row.absent_reported_date) return '';
  return `<span class="badge badge-returnee" title="Previously reported absent on ${escapeHtml(row.absent_reported_date)} -- returning, not a new student">↩ Returning</span>`;
}

// Same-day follow-up (Nina: "I don't want to tag anyone inactive... it's
// either absent or active") -- subject_enrollment.status is now always
// exactly 'Active' or 'Absent' (the old 'Inactive'/'Dropped' vocabulary
// is gone, see migrateSubjectStatusVocabulary in lib/db.js), so this is
// just the two-way badge it always should have been.
function badgeClass(status) {
  return status === 'Active' ? 'badge-active' : 'badge-absent';
}

function fmtLevel(row) {
  if (row.current_level) {
    const page = row.current_page != null && row.current_page !== '' ? row.current_page : '';
    return `<span class="level-code">${row.current_level}${page}</span>`;
  }
  if (row.needs_level_review) {
    // The source sheet's Actual/LWU cell for this student had something
    // other than a real level in it (most often a stray date) -- shown as a
    // plain "not yet recorded", same as any other empty level, rather than a
    // separate warning style. Still findable via the "Needs level review
    // only" filter under More filters. See needs_level_review in lib/db.js
    // for how this gets set.
    return `<span class="no-level">not yet recorded</span>`;
  }
  if (row.current_level_raw) {
    return `<span class="level-raw-note">${escapeHtml(row.current_level_raw)}</span>`;
  }
  return `<span class="no-level">not yet recorded</span>`;
}

function fmtTeacher(row) {
  if (!row.teacher_id) {
    return `<span class="teacher-unassigned">Unassigned — needs review</span>`;
  }
  const name = row.teacher_nickname || row.teacher_legal_name;
  const cls = row.teacher_active ? '' : ' teacher-inactive';
  return `<span class="${cls}">${escapeHtml(name)}</span>`;
}

function fmtSchedule(row) {
  if (row.slots && row.slots.length) {
    return row.slots.map((s) => {
      const t = s.time ? to12h(s.time) : '<em>time TBD</em>';
      return `<span class="sched-slot">${s.day} ${t}</span>`;
    }).join(' ');
  }
  if (row.schedule_days || row.schedule_time) {
    return `<span class="level-raw-note">${escapeHtml([row.schedule_days, row.schedule_time].filter(Boolean).join(' · '))}</span>`;
  }
  return '<span class="no-level">—</span>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Populates a <select> with a blank/placeholder option followed by one
// option per level. Used for f_level/f_goalLevel (live edit panel) and
// h_goalLevel/h_actualLevel (historical-record panel) -- all need to show
// the right subject's level list (Aug 20: Math and Reading diverge for every
// letter grade A-I, see lib/db.js's curriculum_level split), not one flat
// list mixing both.
function populateLevelSelect(select, levelList, blankLabel) {
  const previousValue = select.value;
  select.innerHTML = '';
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = blankLabel;
  select.appendChild(blank);
  for (const lvl of levelList) {
    const opt = document.createElement('option');
    opt.value = lvl;
    opt.textContent = lvl;
    select.appendChild(opt);
  }
  // Keep the previous selection if it's still valid for the new list
  // (e.g. re-populating after a data refresh); callers that are switching
  // subject set the real value explicitly right after calling this.
  if (levelList.includes(previousValue)) select.value = previousValue;
}

// ---- Billing Groups (Aug 25 follow-up) ------------------------------------
// state.billingGroups is shared by the shared edit panel's dropdown and the
// Billing Groups tab itself, so both surfaces always agree on the current
// list rather than each keeping their own separate copy.
async function loadBillingGroupsIntoState() {
  state.billingGroups = await api('/api/billing-groups');
  return state.billingGroups;
}

// Same pattern as populateLevelSelect above -- clear, add a blank/placeholder
// option, then one option per group, then restore the selection.
function populateBillingGroupSelect(select, selectedId) {
  select.innerHTML = '';
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = '— not in a group (billed individually) —';
  select.appendChild(blank);
  for (const g of (state.billingGroups || [])) {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    select.appendChild(opt);
  }
  select.value = selectedId ? String(selectedId) : '';
}

async function loadFilters() {
  const [teachers, mathLevels, readingLevels, timeslots, groups] = await Promise.all([
    api('/api/teachers'), api('/api/levels?subject=Math'), api('/api/levels?subject=Reading'),
    api('/api/timeslots'), api('/api/groups'),
  ]);
  state.teachers = teachers;
  state.levelsBySubject = { Math: mathLevels, Reading: readingLevels };
  state.timeslots = timeslots;
  state.groups = groups;

  await Promise.all([refreshMonths(), loadActiveMonth(), loadAshrCycles()]);

  for (const select of [el('teacherFilter'), el('f_teacher'), el('calTeacherFilter'), el('h_teacher'), el('ashrTeacherFilter'), el('ashr_teacher'), el('payTeacherFilter'), el('absentTeacherFilter')]) {
    for (const t of teachers) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = (t.nickname || t.legal_name) + (t.active ? '' : ' (inactive)');
      select.appendChild(opt);
    }
  }

  for (const select of [el('groupFilter'), el('calGroupFilter'), el('payGroupFilter')]) {
    for (const g of groups) {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      select.appendChild(opt);
    }
  }

  const dayFilter = el('dayFilter');
  for (const d of DAY_ORDER) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    dayFilter.appendChild(opt);
  }

  const timeFilter = el('timeFilter');
  for (const t of timeslots) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = to12h(t);
    timeFilter.appendChild(opt);
  }

  // Defaults to Math (matches f_subject's default value below and
  // openEditPanel's "Add student" default) -- both get properly re-populated
  // for the actual subject in play the moment a panel opens for real.
  populateLevelSelect(el('f_level'), state.levelsBySubject.Math, '— not yet recorded —');
  populateLevelSelect(el('f_goalLevel'), state.levelsBySubject.Math, '— no goal set —');
  el('f_subject').addEventListener('change', () => {
    const subjectLevels = state.levelsBySubject[el('f_subject').value] || [];
    populateLevelSelect(el('f_level'), subjectLevels, '— not yet recorded —');
    el('f_level').value = '';
    populateLevelSelect(el('f_goalLevel'), subjectLevels, '— no goal set —');
    el('f_goalLevel').value = '';
  });

  for (const select of [el('h_goalLevel'), el('h_actualLevel')]) {
    populateLevelSelect(select, state.levelsBySubject.Math, '— not recorded —');
  }

  const ashrGradeFilter = el('ashrGradeFilter');
  for (const g of ASHR_GRADE_ORDER) {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    ashrGradeFilter.appendChild(opt);
  }

  buildSchedulePicker();
}

// Refetch the list of months with recorded history and rebuild the Month
// filter's options -- called at startup and again after "Close month" adds
// a brand-new month to the list, so the dropdown picks it up without a
// full page reload.
async function refreshMonths() {
  const months = await api('/api/months');
  state.months = months;
  const monthFilter = el('monthFilter');
  const current = monthFilter.value;
  monthFilter.innerHTML = '<option value="">Current (live)</option>';
  for (const m of months) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = fmtMonth(m);
    monthFilter.appendChild(opt);
  }
  monthFilter.value = months.includes(current) ? current : '';
}

// Fetches which calendar month the live roster (Goal/Current fields) is
// currently tracking, and reflects it in the status bar above the toolbar.
// The "Goal level" field's own hint is a static "(EOM)" now (see index.html)
// rather than the specific month name -- Nina asked for it to just mean
// "by the end of whichever month is currently live" without needing to
// spell the month out redundantly next to the always-visible status bar.
async function loadActiveMonth() {
  const info = await api('/api/active-month');
  state.activeMonth = info;
  el('activeMonthLabel').textContent = `Recording data for ${info.label}`;
  el('adminActiveMonthLabel').textContent = `Currently recording: ${info.label}`;
  el('adminCloseMonthBtn').textContent = `Close ${info.label}`;
}

function currentFilters() {
  const params = new URLSearchParams();
  const q = el('searchInput').value.trim();
  if (q) params.set('q', q);
  const subject = el('subjectFilter').value;
  if (subject) params.set('subject', subject);
  const teacherId = el('teacherFilter').value;
  if (teacherId) params.set('teacherId', teacherId);
  const group = el('groupFilter').value;
  if (group) params.set('group', group);
  const day = el('dayFilter').value;
  if (day) params.set('day', day);
  const time = el('timeFilter').value;
  if (time) params.set('time', time);
  const status = el('statusFilter').value;
  if (status) params.set('status', status);
  return params;
}

const LIVE_HEAD = `
  <tr>
    <th>Student</th>
    <th>Grade</th>
    <th>Subject</th>
    <th>Goal</th>
    <th>Award</th>
    <th>Actual</th>
    <th>Teacher</th>
    <th>Schedule</th>
    <th>Mode</th>
    <th>Status</th>
    <th>Payment</th>
    <th></th>
  </tr>
`;
const HISTORY_HEAD = `
  <tr>
    <th>Student</th>
    <th>Grade</th>
    <th>Subject</th>
    <th>Goal</th>
    <th>Award</th>
    <th>Actual</th>
    <th>Teacher</th>
    <th>Payment</th>
    <th></th>
  </tr>
`;

// Payment status badge -- shared by the Roster (live + historical, both now
// join payment_record for whichever month's being viewed) and the Payments
// tab. A small "!" flag icon rides alongside it when the student is flagged
// needs_attention, since that's a separate, non-payment concern (retention
// risk) that's still useful to see at a glance from the Roster.
function fmtPaymentBadge(row) {
  const cls = row.payment_status || 'unpaid';
  const label = row.payment_status_label || 'Unpaid';
  const reconciled = row.payment_reconciled
    ? `<span class="reconciled-note" title="Paid late, after already being reported absent">late</span>`
    : '';
  const flag = row.needs_attention
    ? `<span class="attention-flag" title="${escapeHtml(row.needs_attention_note || 'Flagged for follow-up')}">!</span>`
    : '';
  return `<span class="payment-badge ${cls}">${escapeHtml(label)}</span>${reconciled}${flag}`;
}

function loadTable() {
  const month = el('monthFilter').value;
  return month ? loadHistoryTable(month) : loadLiveTable();
}

// Day/time/status and "+ Add student" only make sense against the live
// roster -- a past month's snapshot has no schedule/status data and isn't
// editable, so grey those controls out instead of letting them look active
// but silently do nothing.
function onMonthFilterChange() {
  const isHistory = !!el('monthFilter').value;
  for (const id of ['dayFilter', 'timeFilter', 'statusFilter']) {
    el(id).disabled = isHistory;
  }
  el('addStudentBtn').disabled = isHistory;
  el('historyNotice').classList.toggle('hidden', !isHistory);
  loadTable();
}

// ---- "More filters" disclosure (Day/Time/Status) -------------------------
// Collapsed by default -- these are reached for far less often than
// Search/Subject/Teacher/Group/Month, so keeping them tucked away keeps the
// main toolbar from growing a new dropdown every time a new filter makes
// sense in isolation.

function toggleMoreFilters() {
  const row = el('moreFiltersRow');
  row.classList.toggle('hidden');
  updateMoreFiltersLabel();
}

function updateMoreFiltersLabel() {
  const activeCount = [
    el('dayFilter').value,
    el('timeFilter').value,
    el('statusFilter').value,
  ].filter(Boolean).length;
  const expanded = !el('moreFiltersRow').classList.contains('hidden');
  const suffix = activeCount ? ` (${activeCount} active)` : '';
  el('moreFiltersToggle').textContent = `${expanded ? 'Fewer' : 'More'} filters${suffix}`;
}

async function loadLiveTable() {
  el('tableHead').innerHTML = LIVE_HEAD;
  const tbody = el('tableBody');
  tbody.innerHTML = '<tr><td colspan="12" class="loading">Loading…</td></tr>';
  const rows = await api('/api/enrollments?' + currentFilters().toString());
  el('resultCount').textContent = `${rows.length} enrollment${rows.length === 1 ? '' : 's'}`;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty">No matching enrollments.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r) => `
    <tr class="${r.needs_teacher_review ? 'needs-review' : ''}" data-id="${r.id}">
      <td>
        <div class="student-name">${escapeHtml(r.last_name)}, ${escapeHtml(r.first_name)} ${fmtReturneeBadge(r)}</div>
      </td>
      <td class="student-grade">${escapeHtml(r.grade || '—')}</td>
      <td>${escapeHtml(r.subject)}</td>
      <td>${fmtPosition(r.goal_level, r.goal_page, r.goal_level_raw)}</td>
      <td>${fmtGoalAward(r.goal_award)}</td>
      <td class="level-cell">${fmtLevel(r)}</td>
      <td>${fmtTeacher(r)}</td>
      <td>${fmtSchedule(r)}</td>
      <td>${r.submission_mode ? escapeHtml(r.submission_mode) : '<span class="no-level">—</span>'}</td>
      <td><span class="badge ${badgeClass(r.status)}">${r.status}</span></td>
      <td>${fmtPaymentBadge(r)}</td>
      <td><button type="button" class="row-edit-btn" data-edit="${r.id}">Edit</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openEditPanel(rows.find((r) => r.id === Number(btn.dataset.edit))));
  });
}

async function loadHistoryTable(month) {
  el('tableHead').innerHTML = HISTORY_HEAD;
  const tbody = el('tableBody');
  tbody.innerHTML = '<tr><td colspan="9" class="loading">Loading…</td></tr>';

  const params = new URLSearchParams();
  params.set('month', month);
  const q = el('searchInput').value.trim();
  if (q) params.set('q', q);
  const subject = el('subjectFilter').value;
  if (subject) params.set('subject', subject);
  const teacherId = el('teacherFilter').value;
  if (teacherId) params.set('teacherId', teacherId);
  const group = el('groupFilter').value;
  if (group) params.set('group', group);

  const rows = await api('/api/monthly-progress?' + params.toString());
  el('resultCount').textContent = `${rows.length} record${rows.length === 1 ? '' : 's'} — ${fmtMonth(month)}`;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">No history recorded for this month with the current filters.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r) => `
    <tr data-id="${r.id}">
      <td>
        <div class="student-name">${escapeHtml(r.last_name)}, ${escapeHtml(r.first_name)}</div>
      </td>
      <td class="student-grade">${escapeHtml(r.grade || '—')}</td>
      <td>${escapeHtml(r.subject || '—')}</td>
      <td>${fmtPosition(r.goal_level, r.goal_page, r.goal_level_raw)}</td>
      <td>${fmtGoalAward(r.goal_award)}</td>
      <td class="level-cell">${fmtPosition(r.actual_level, r.actual_page, r.actual_level_raw)}</td>
      <td>${escapeHtml(r.teacher_nickname || r.teacher_label || '—')}${r.edited_at ? '<span class="edited-badge">corrected after import</span>' : ''}</td>
      <td>${fmtPaymentBadge(r)}</td>
      <td><button type="button" class="row-edit-btn" data-edit="${r.id}">Edit</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = rows.find((r) => r.id === Number(btn.dataset.edit));
      openHistoryEditPanel(row, `${row.last_name}, ${row.first_name}`);
    });
  });
}

// ---- admin panel: close month + change password --------------------

function openAdminPanel() {
  el('admin_currentPassword').value = '';
  el('admin_newPassword').value = '';
  el('admin_confirmPassword').value = '';
  el('adminPasswordError').classList.add('hidden');
  el('adminPasswordSuccess').classList.add('hidden');
  el('adminAshrError').classList.add('hidden');
  el('adminAshrSuccess').classList.add('hidden');
  updateAshrAdminLabel();
  el('overlay').classList.remove('hidden');
  el('adminPanel').classList.remove('hidden');
}

function closeAdminPanel() {
  el('adminPanel').classList.add('hidden');
  hideOverlayIfAllClosed();
}

async function adminDoCloseMonth() {
  const label = state.activeMonth ? state.activeMonth.label : 'the current month';
  const ok = confirm(
    `Close ${label}?\n\n` +
    `This saves every student's Goal and Actual as of right now as ${label}'s ` +
    `permanent history (same as Jan–Jul), then clears the Goal field so ` +
    `teachers can set a fresh goal for next month. Current level/page carries ` +
    `forward unchanged — it's not reset.\n\n` +
    `Safe to run again if you're not sure it worked (it just re-saves over ` +
    `itself), but only do this once ${label} is actually finished.`
  );
  if (!ok) return;
  const btn = el('adminCloseMonthBtn');
  btn.disabled = true;
  try {
    const result = await api('/api/close-month', { method: 'POST' });
    await Promise.all([refreshMonths(), loadActiveMonth()]);
    loadTable();
    alert(
      `${result.archivedMonthLabel} closed — ${result.archivedCount} ` +
      `record${result.archivedCount === 1 ? '' : 's'} saved to history.\n\n` +
      `Now recording ${result.newActiveMonthLabel}.`
    );
  } catch (e) {
    alert('Could not close the month: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function adminDoChangePassword() {
  const current = el('admin_currentPassword').value;
  const next = el('admin_newPassword').value;
  const confirmNext = el('admin_confirmPassword').value;
  const errEl = el('adminPasswordError');
  const okEl = el('adminPasswordSuccess');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  if (!next || next.length < 4) {
    errEl.textContent = 'New password must be at least 4 characters.';
    errEl.classList.remove('hidden');
    return;
  }
  if (next !== confirmNext) {
    errEl.textContent = "The new passwords didn't match.";
    errEl.classList.remove('hidden');
    return;
  }
  try {
    await api('/api/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    el('admin_currentPassword').value = '';
    el('admin_newPassword').value = '';
    el('admin_confirmPassword').value = '';
    okEl.textContent = 'Password changed.';
    okEl.classList.remove('hidden');
  } catch (e) {
    errEl.textContent = e.message || 'Could not change the password.';
    errEl.classList.remove('hidden');
  }
}

// ---- schedule picker (Mon-Sun checkbox + time, inside the edit panel) ---

function buildSchedulePicker() {
  const container = el('scheduleDays');
  container.innerHTML = DAY_ORDER.map((day) => `
    <div class="schedule-day-row" data-day="${day}">
      <label class="day-check">
        <input type="checkbox" class="day-checkbox" />
        ${day}
      </label>
      <input type="time" class="input day-time" disabled />
      <select class="input day-mode" disabled title="Remote Instruction or In-Center">
        <option value="IC">IC</option>
        <option value="RI">RI</option>
      </select>
    </div>
  `).join('');

  container.querySelectorAll('.schedule-day-row').forEach((row) => {
    const checkbox = row.querySelector('.day-checkbox');
    const time = row.querySelector('.day-time');
    const mode = row.querySelector('.day-mode');
    checkbox.addEventListener('change', () => {
      time.disabled = !checkbox.checked;
      mode.disabled = !checkbox.checked;
      if (checkbox.checked) time.focus();
    });
  });
}

function setSchedulePicker(slots) {
  const byDay = {};
  for (const s of slots || []) byDay[s.day] = s;

  el('scheduleDays').querySelectorAll('.schedule-day-row').forEach((row) => {
    const day = row.dataset.day;
    const checkbox = row.querySelector('.day-checkbox');
    const time = row.querySelector('.day-time');
    const mode = row.querySelector('.day-mode');
    const has = Object.prototype.hasOwnProperty.call(byDay, day);
    checkbox.checked = has;
    time.disabled = !has;
    mode.disabled = !has;
    time.value = has && byDay[day].time ? byDay[day].time : '';
    // Defaults to IC (matches the confirmed "unmarked = In-Center" rule) --
    // a slot flagged needs_mode_review (source itself was ambiguous, e.g. a
    // literal "(IC/RI)" or an unrecognized marker) shows IC pre-selected too,
    // same as an unmarked day, since there's nothing more specific to show;
    // saving the form clears that flag by setting an explicit value.
    mode.value = has && byDay[day].mode === 'RI' ? 'RI' : 'IC';
  });

  const legacyNote = el('legacyScheduleNote');
  const hasStructured = (slots || []).length > 0;
  const hasLegacyText = false; // set by caller when needed
  legacyNote.classList.add('hidden');
}

function readSchedulePicker() {
  const slots = [];
  el('scheduleDays').querySelectorAll('.schedule-day-row').forEach((row) => {
    const checkbox = row.querySelector('.day-checkbox');
    if (!checkbox.checked) return;
    const time = row.querySelector('.day-time').value || null;
    const mode = row.querySelector('.day-mode').value === 'RI' ? 'RI' : 'IC';
    slots.push({ day: row.dataset.day, time, mode });
  });
  return slots;
}

// ---- edit panel -----------------------------------------------------

async function openEditPanel(row) {
  el('panelTitle').textContent = row ? 'Edit enrollment' : 'Add student';
  el('f_enrollmentId').value = row ? row.id : '';
  el('f_studentId').value = row ? row.student_id : '';

  el('f_lastName').value = row ? row.last_name : '';
  el('f_firstName').value = row ? row.first_name : '';
  el('f_grade').value = row ? (row.grade || '') : '';

  // Aug 25 follow-up -- Billing Groups. Refetched every time the panel
  // opens (rather than relying on a possibly-stale cache) since groups can
  // be created/renamed/deleted from their own tab at any time; the list is
  // small so this is cheap. Only meaningful for an existing student -- "Add
  // student" has no billing arrangement to set yet (matches the
  // panelDangerActions/absentStatusSection "existing student only" rule
  // just above/below this).
  el('billingGroupSection').classList.toggle('hidden', !row);
  if (row) {
    await loadBillingGroupsIntoState();
    populateBillingGroupSelect(el('f_billingGroup'), row.billing_group_id);
  }

  const subject = row ? row.subject : 'Math';
  el('f_subject').value = subject;
  el('f_status').value = row ? row.status : 'Active';
  // Repopulate with the right subject's level list (Math and Reading diverge
  // for every letter grade A-I) before setting the actual value, or a
  // Reading-only code like "GI" would fail to select against a still-Math
  // option list. Same applies to the Goal level field.
  populateLevelSelect(el('f_level'), state.levelsBySubject[subject] || [], '— not yet recorded —');
  el('f_level').value = row ? (row.current_level || '') : '';
  el('f_page').value = row ? (row.current_page || '') : '';
  populateLevelSelect(el('f_goalLevel'), state.levelsBySubject[subject] || [], '— no goal set —');
  el('f_goalLevel').value = row ? (row.goal_level || '') : '';
  el('f_goalPage').value = row ? (row.goal_page || '') : '';
  el('f_goalAward').value = row ? (row.goal_award || '') : '';
  el('f_teacher').value = row ? (row.teacher_id || '') : '';
  el('f_mode').value = row ? (row.submission_mode || '') : '';
  el('f_dateEnrolled').value = row && row.date_enrolled ? row.date_enrolled.slice(0, 10) : '';

  setSchedulePicker(row ? row.slots : []);
  const legacyNote = el('legacyScheduleNote');
  if (row && (!row.slots || !row.slots.length) && (row.schedule_days || row.schedule_time)) {
    legacyNote.textContent = `Original sheet said: "${[row.schedule_days, row.schedule_time].filter(Boolean).join(' · ')}" — this couldn't be read as a clean day/time automatically. Set it above.`;
    legacyNote.classList.remove('hidden');
  } else {
    legacyNote.classList.add('hidden');
  }

  el('studentFields').style.display = '';
  el('reviewNote').classList.toggle('hidden', !(row && row.needs_teacher_review));

  // Delete buttons only make sense for an existing enrollment -- "Add
  // student" has nothing to delete yet.
  el('panelDangerActions').classList.toggle('hidden', !row);

  // Retention status (Aug 21, extended same day) -- same "only for an
  // existing student" rule as the delete buttons above; "Add student" mode
  // has nothing to report. Three states for the report/reactivate action,
  // not two: the whole student can be fully Absent (roster_status), OR just
  // this one subject enrollment can already be Absent while the student
  // stays Active overall (e.g. Math absent, Reading still going) -- in that
  // middle case there's nothing left to "report" for this subject, so the
  // report button doesn't make sense to show. The note field itself,
  // though, is independent of all three states -- per Nina, it needs to
  // stay editable at any time (e.g. by a teacher adding context later), not
  // locked once a report is filed. A "Returning student" flag is shown
  // whenever a currently-Active student still carries absence history
  // (absent_reported_date survives reactivation on purpose, see
  // setAbsentStatus in server.js) -- purely a computed display, no new
  // column needed, so a re-enrollment is never mistaken for a new student.
  const absentSection = el('absentStatusSection');
  if (row) {
    absentSection.classList.remove('hidden');
    el('f_absentNote').value = row.absent_source_note || '';
    const isAbsent = row.roster_status === 'Absent';
    const thisSubjectAlreadyAbsent = !isAbsent && row.status !== 'Active';
    const isReturnee = !isAbsent && !!row.absent_reported_date;

    el('returneeBadge').classList.toggle('hidden', !isReturnee);
    if (isReturnee) {
      el('returneeBadge').textContent =
        `↩ Returning student -- previously reported absent on ${row.absent_reported_date}. Not a new student.`;
    }

    el('absentStatusSummary').classList.toggle('hidden', !isAbsent && !thisSubjectAlreadyAbsent);
    if (isAbsent) {
      el('absentStatusSummary').textContent = `Reported absent on ${row.absent_reported_date || 'an unrecorded date'}.`;
    } else if (thisSubjectAlreadyAbsent) {
      el('absentStatusSummary').textContent =
        `${row.subject} is already ${row.status} on the Roster. Change the Status field above to re-enroll in this subject.`;
    }

    el('reportScopeHint').classList.toggle('hidden', isAbsent || thisSubjectAlreadyAbsent);
    el('reportAbsentBtn').classList.toggle('hidden', isAbsent || thisSubjectAlreadyAbsent);
    if (!isAbsent && !thisSubjectAlreadyAbsent) el('reportAbsentBtn').textContent = `Report ${row.subject} absent`;
    el('reactivateBtn').classList.toggle('hidden', !isAbsent);

    // Risk signals only come along when the panel was opened via the
    // Absent tab (see openAbsentEditPanel) -- listEnrollments itself
    // doesn't compute them, so row.risk_flags is simply undefined when
    // this panel was opened from Roster/Payments instead. Same three
    // states as the Absent tab's table column: real flags, checked-and-
    // clean, or not-enough-data -- an empty list means very different
    // things in the last two cases, so they're never shown identically.
    const hasRiskData = isAbsent && row.risk_flags !== undefined;
    el('riskSignalsSection').classList.toggle('hidden', !hasRiskData);
    if (hasRiskData) {
      const listEl = el('riskSignalsList');
      if (row.risk_flags.length) {
        listEl.innerHTML = row.risk_flags.map((f) =>
          `<div><span class="badge risk-flag">${escapeHtml(f.label)}</span></div>`
        ).join('');
      } else if (row.risk_checked) {
        listEl.innerHTML = '<p class="no-level">No attendance/KIS signals detected.</p>';
      } else {
        listEl.innerHTML = '<p class="no-level">Not enough data yet to check (no attendance history logged for this student, no usable enrollment date).</p>';
      }
      if (!row.worksheets_tracked) {
        listEl.innerHTML += '<p class="field-hint">Worksheets/sets completed per month isn\'t tracked yet, so it\'s never part of these flags -- treat this as a partial picture.</p>';
      }
    }
  } else {
    absentSection.classList.add('hidden');
  }

  loadProgressHistory(row ? row.student_id : null);

  el('overlay').classList.remove('hidden');
  el('editPanel').classList.remove('hidden');
}

// ---- monthly progress history (read-only, shown in the edit panel) ------

function fmtMonth(month) {
  if (!month) return '';
  const [y, m] = month.split('-').map(Number);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[m - 1]} ${y}`;
}

function fmtPosition(level, page, raw) {
  // Glued together, no space, no "page" word -- e.g. "3A130" not "3A page 130"
  // or "3A 130" (per Nina's request, applied everywhere a level+page is shown).
  if (level) return `${level}${page != null && page !== '' ? page : ''}`;
  if (raw) return `<span class="level-raw-note">${escapeHtml(raw)}</span>`;
  return '<span class="no-level">—</span>';
}

// Goal award (Aug 20 -- "i also want goal award"): a separate, independent
// target ASHR tier alongside Goal level/page, not a replacement for it (see
// the earlier same-day "Goal is a target curriculum level again" section --
// this re-adds the award as its own field/column rather than reverting that
// change). Rendered with the same tier-badge styling already used on the
// ASHR tab.
function fmtGoalAward(award) {
  if (!award) return '<span class="no-level">—</span>';
  return `<span class="tier-badge ${ashrTierClass(award)}">${escapeHtml(award)}</span>`;
}

async function loadProgressHistory(studentId) {
  const section = el('progressHistorySection');
  const list = el('progressHistoryList');
  if (!studentId) {
    section.classList.add('hidden');
    list.innerHTML = '';
    return;
  }
  section.classList.remove('hidden');
  list.innerHTML = '<p class="cal-empty">Loading…</p>';
  try {
    const rows = await api(`/api/students/${studentId}/progress`);
    if (!rows.length) {
      list.innerHTML = '<p class="cal-empty">No monthly history recorded before August yet.</p>';
      return;
    }
    const bySubject = {};
    for (const r of rows) {
      const key = r.subject || 'Unspecified';
      (bySubject[key] = bySubject[key] || []).push(r);
    }
    list.innerHTML = Object.keys(bySubject).sort().map((subject) => `
      <div class="progress-subject-group">
        <div class="progress-subject-label">${escapeHtml(subject)}</div>
        <table class="progress-table">
          <thead><tr><th>Month</th><th>Goal</th><th>Award</th><th>Actual</th><th>Teacher</th><th></th></tr></thead>
          <tbody>
            ${bySubject[subject].map((r) => `
              <tr data-id="${r.id}">
                <td>${fmtMonth(r.month)}</td>
                <td>${fmtPosition(r.goal_level, r.goal_page, r.goal_level_raw)}</td>
                <td>${fmtGoalAward(r.goal_award)}</td>
                <td>${fmtPosition(r.actual_level, r.actual_page, r.actual_level_raw)}</td>
                <td>${escapeHtml(r.teacher_nickname || r.teacher_label || '—')}${r.edited_at ? '<span class="edited-badge">corrected</span>' : ''}</td>
                <td><button type="button" class="row-edit-btn" data-edit="${r.id}">Edit</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('');

    list.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = rows.find((r) => r.id === Number(btn.dataset.edit));
        const studentLabel = `${el('f_lastName').value}, ${el('f_firstName').value}`;
        openHistoryEditPanel(row, studentLabel);
      });
    });
  } catch (e) {
    list.innerHTML = `<p class="cal-empty">Could not load history: ${escapeHtml(e.message)}</p>`;
  }
}

// Three modals (editPanel, historyEditPanel, adminPanel) can end up stacked
// on top of one another -- only drop the shared dim backdrop once none of
// them are showing, so closing the top one doesn't strip the backdrop out
// from under a panel that's still open behind it.
function hideOverlayIfAllClosed() {
  const stillOpen = ['editPanel', 'historyEditPanel', 'adminPanel', 'ashrEditPanel', 'paymentEditPanel', 'absentTagPanel', 'billingGroupEditPanel', 'receiptViewerPanel', 'receiptGroupSplitPanel']
    .some((id) => !el(id).classList.contains('hidden'));
  if (!stillOpen) el('overlay').classList.add('hidden');
}

function closeEditPanel() {
  el('editPanel').classList.add('hidden');
  hideOverlayIfAllClosed();
}

// ---- editing a closed historical record (password-gated) ----------------

function openHistoryEditPanel(row, studentLabel) {
  el('h_id').value = row.id;
  el('historyPanelSubtitle').textContent =
    `${studentLabel} — ${row.subject || 'Unspecified'} — ${fmtMonth(row.month)}`;
  // Repopulate with the right subject's level list the same way the live
  // edit panel does -- a Reading month can genuinely have a Reading-only
  // code like "GI" in its goal_level/actual_level.
  const historyLevels = state.levelsBySubject[row.subject] || state.levelsBySubject.Math;
  populateLevelSelect(el('h_goalLevel'), historyLevels, '— not recorded —');
  populateLevelSelect(el('h_actualLevel'), historyLevels, '— not recorded —');
  el('h_goalLevel').value = row.goal_level || '';
  el('h_goalPage').value = row.goal_page || '';
  el('h_goalAward').value = row.goal_award || '';
  el('h_actualLevel').value = row.actual_level || '';
  el('h_actualPage').value = row.actual_page || '';
  el('h_teacher').value = row.teacher_id || '';
  el('h_password').value = '';
  el('historyPanelError').classList.add('hidden');
  el('overlay').classList.remove('hidden');
  el('historyEditPanel').classList.remove('hidden');
}

function closeHistoryEditPanel() {
  el('historyEditPanel').classList.add('hidden');
  hideOverlayIfAllClosed();
}

async function saveHistoryEdit(ev) {
  ev.preventDefault();
  const id = el('h_id').value;
  const body = {
    goalLevel: el('h_goalLevel').value || null,
    goalPage: el('h_goalPage').value ? Number(el('h_goalPage').value) : null,
    goalAward: el('h_goalAward').value || null,
    actualLevel: el('h_actualLevel').value || null,
    actualPage: el('h_actualPage').value ? Number(el('h_actualPage').value) : null,
    teacherId: el('h_teacher').value ? Number(el('h_teacher').value) : null,
    password: el('h_password').value,
  };
  const errEl = el('historyPanelError');
  errEl.classList.add('hidden');
  try {
    await api(`/api/monthly-progress/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    closeHistoryEditPanel();
    loadTable();
    if (!el('editPanel').classList.contains('hidden')) {
      loadProgressHistory(el('f_studentId').value);
    }
    refreshUndoButton();
  } catch (e) {
    errEl.textContent = e.message || 'Could not save.';
    errEl.classList.remove('hidden');
  }
}


async function saveForm(ev) {
  ev.preventDefault();
  const enrollmentId = el('f_enrollmentId').value;
  const studentId = el('f_studentId').value;

  const studentBody = {
    lastName: el('f_lastName').value.trim(),
    firstName: el('f_firstName').value.trim(),
    grade: el('f_grade').value.trim() || null,
    billingGroupId: el('f_billingGroup').value ? Number(el('f_billingGroup').value) : null,
  };
  const enrollmentBody = {
    subject: el('f_subject').value,
    status: el('f_status').value,
    goalLevel: el('f_goalLevel').value || null,
    goalPage: el('f_goalPage').value ? Number(el('f_goalPage').value) : null,
    goalAward: el('f_goalAward').value || null,
    currentLevel: el('f_level').value || null,
    currentPage: el('f_page').value ? Number(el('f_page').value) : null,
    teacherId: el('f_teacher').value ? Number(el('f_teacher').value) : null,
    scheduleSlots: readSchedulePicker(),
    submissionMode: el('f_mode').value || null,
    dateEnrolled: el('f_dateEnrolled').value || null,
  };

  try {
    if (enrollmentId) {
      // One combined save so the student-info half and enrollment half of
      // this edit count as a single undo-able action, not two separate
      // ones (see updateStudentAndEnrollmentWithUndo in server.js).
      await api(`/api/enrollments/${enrollmentId}/full`, {
        method: 'PUT',
        body: JSON.stringify({ studentId, student: studentBody, enrollment: enrollmentBody }),
      });
    } else {
      await api('/api/students', {
        method: 'POST',
        body: JSON.stringify({ ...studentBody, enrollment: enrollmentBody }),
      });
    }
    closeEditPanel();
    loadTable();
    if (!el('view-calendar').classList.contains('hidden')) loadCalendar();
    if (!el('view-ashr').classList.contains('hidden')) loadAshrTable();
    if (!el('view-payments').classList.contains('hidden')) loadPaymentsTable();
    if (!el('view-absent').classList.contains('hidden')) loadAbsentTable();
    refreshUndoButton();
  } catch (e) {
    alert('Could not save: ' + e.message);
  }
}

// ---- delete (Aug 20 -- "can we add a delete function") -------------------
// Two separate, deliberately distinct actions: deleting one subject
// enrollment (e.g. a mistaken duplicate, same shape as the Dia/Disamburun
// rows cleaned up manually just before this) vs. deleting a student and
// everything tied to them (fully withdrawn from the center). Both are
// permanent, but both are covered by the same one-level Undo as every other
// edit here, so a misclick can be reversed immediately with one click.

async function deleteEnrollment() {
  const enrollmentId = el('f_enrollmentId').value;
  if (!enrollmentId) return;
  const subject = el('f_subject').value;
  const name = `${el('f_lastName').value}, ${el('f_firstName').value}`;
  if (!confirm(`Delete ${name}'s ${subject} enrollment? This removes that subject's schedule and teacher assignment. You can undo this right after with the Undo button if it's a mistake.`)) {
    return;
  }
  try {
    await api(`/api/enrollments/${enrollmentId}`, { method: 'DELETE' });
    closeEditPanel();
    loadTable();
    if (!el('view-calendar').classList.contains('hidden')) loadCalendar();
    if (!el('view-ashr').classList.contains('hidden')) loadAshrTable();
    if (!el('view-payments').classList.contains('hidden')) loadPaymentsTable();
    if (!el('view-absent').classList.contains('hidden')) loadAbsentTable();
    refreshUndoButton();
  } catch (e) {
    alert('Could not delete: ' + e.message);
  }
}

async function deleteStudent() {
  const studentId = el('f_studentId').value;
  if (!studentId) return;
  const name = `${el('f_lastName').value}, ${el('f_firstName').value}`;
  if (!confirm(`Delete ${name} entirely? This removes ALL of their subjects, schedule, progress history, ASHR records, and payment history -- not just this one enrollment. You can undo this right after with the Undo button if it's a mistake.`)) {
    return;
  }
  try {
    await api(`/api/students/${studentId}`, { method: 'DELETE' });
    closeEditPanel();
    loadTable();
    if (!el('view-calendar').classList.contains('hidden')) loadCalendar();
    if (!el('view-ashr').classList.contains('hidden')) loadAshrTable();
    if (!el('view-payments').classList.contains('hidden')) loadPaymentsTable();
    if (!el('view-absent').classList.contains('hidden')) loadAbsentTable();
    refreshUndoButton();
  } catch (e) {
    alert('Could not delete: ' + e.message);
  }
}

// ---- retention status: Absent tab (Aug 21) -------------------------------
// Deliberately separate write path from delete above -- reporting someone
// absent is a status transition (student.roster_status), never a delete;
// their full history (progress, ASHR, payments) stays exactly where it was.

async function reportAbsent() {
  const studentId = el('f_studentId').value;
  const enrollmentId = el('f_enrollmentId').value;
  if (!studentId || !enrollmentId) return;
  const name = `${el('f_lastName').value}, ${el('f_firstName').value}`;
  const subject = el('f_subject').value;
  const note = el('f_absentNote').value.trim() || null;
  if (!confirm(`Report ${name}'s ${subject} enrollment as absent? This marks ${subject} Absent on the Roster right away. If this was their only remaining active subject, they'll also move to the Absent tab as no longer active overall. You can undo this right after with the Undo button if it's a mistake.`)) {
    return;
  }
  try {
    await api(`/api/students/${studentId}/absent-status`, {
      method: 'PUT',
      body: JSON.stringify({ action: 'report', note, enrollmentId }),
    });
    closeEditPanel();
    loadTable();
    if (!el('view-calendar').classList.contains('hidden')) loadCalendar();
    if (!el('view-ashr').classList.contains('hidden')) loadAshrTable();
    if (!el('view-payments').classList.contains('hidden')) loadPaymentsTable();
    if (!el('view-absent').classList.contains('hidden')) loadAbsentTable();
    refreshUndoButton();
  } catch (e) {
    alert('Could not save: ' + e.message);
  }
}

async function reactivateStudent() {
  const studentId = el('f_studentId').value;
  if (!studentId) return;
  const name = `${el('f_lastName').value}, ${el('f_firstName').value}`;
  if (!confirm(`Mark ${name} active again? They'll be removed from the Absent tab and treated as active again on the Roster and Payments tabs, flagged as a returning student (not new) since their absence history stays on record. You can undo this right after with the Undo button if it's a mistake.`)) {
    return;
  }
  try {
    await api(`/api/students/${studentId}/absent-status`, {
      method: 'PUT',
      body: JSON.stringify({ action: 'reactivate' }),
    });
    closeEditPanel();
    loadTable();
    if (!el('view-payments').classList.contains('hidden')) loadPaymentsTable();
    if (!el('view-absent').classList.contains('hidden')) loadAbsentTable();
    refreshUndoButton();
  } catch (e) {
    alert('Could not save: ' + e.message);
  }
}

// Editable independent of report/reactivate (Nina: "I want it to be
// editable by the teacher") -- updates only the note, never touches
// roster_status or absent_reported_date, so jotting down a later update
// (e.g. "talked to mom, she says they'll come back in Sept") never
// silently resets "absent since" to today.
async function saveAbsentNote() {
  const studentId = el('f_studentId').value;
  if (!studentId) return;
  const note = el('f_absentNote').value.trim() || null;
  const btn = el('saveAbsentNoteBtn');
  try {
    await api(`/api/students/${studentId}/absent-note`, {
      method: 'PUT',
      body: JSON.stringify({ note }),
    });
    if (!el('view-absent').classList.contains('hidden')) loadAbsentTable();
    refreshUndoButton();
    // Brief inline confirmation -- this is a quick save meant to happen
    // without closing the panel, unlike every other action here, so it
    // needs its own lightweight feedback rather than relying on the panel
    // closing to imply success.
    const original = btn.textContent;
    btn.textContent = 'Saved';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1200);
  } catch (e) {
    alert('Could not save note: ' + e.message);
  }
}

// ---- calendar view ------------------------------------------------------

function subjectClass(subject) {
  return subject === 'Reading' ? 'reading' : 'math';
}

async function loadCalendar() {
  const grid = el('calendarGrid');
  grid.innerHTML = '<div class="cal-empty">Loading…</div>';

  const params = new URLSearchParams();
  const teacherId = el('calTeacherFilter').value;
  const group = el('calGroupFilter').value;
  const mode = el('calModeFilter').value;
  if (teacherId) params.set('teacherId', teacherId);
  if (group) params.set('group', group);
  if (mode) params.set('mode', mode);

  const [entries, attendance] = await Promise.all([
    api('/api/calendar?' + params.toString()),
    api('/api/attendance/today'),
  ]);
  el('calCount').textContent = `${entries.length} weekly time slot${entries.length === 1 ? '' : 's'}`;

  const arrivedIds = new Set(attendance.marks.filter((m) => m.arrived).map((m) => m.schedule_slot_id));
  const today = attendance.day; // server's local "today", so it matches what attendance rows were recorded against

  renderNotArrived(entries.filter((e) => e.day === today), arrivedIds, today);

  if (!entries.length) {
    grid.innerHTML = '<div class="cal-empty">No scheduled sessions match this view.</div>';
    return;
  }

  // Subject-only coloring everywhere (blue=Math/red=Reading), per the
  // Master Platform Specification -- previously the center-wide view
  // (no teacher or group filter) colored chips by team group instead,
  // which meant the same chip could show a different color depending on
  // which filter was active. Nina flagged that inconsistency directly, so
  // this now colors by subject regardless of which filter (if any) is
  // active; the day/teacher/group filters themselves are unaffected.
  const showTeacherLabel = !teacherId;

  // Which days actually have data (always show Mon-Sat, add Sun only if used)
  const days = DAY_ORDER.filter((d) => d !== 'Sun' || entries.some((e) => e.day === 'Sun'));

  const times = [...new Set(entries.map((e) => e.time))].sort();

  const byCell = {};
  for (const e of entries) {
    const key = e.day + '|' + e.time;
    (byCell[key] = byCell[key] || []).push(e);
  }

  let html = `<div class="cal-cell cal-head"></div>`;
  for (const d of days) html += `<div class="cal-cell cal-head${d === today ? ' cal-head-today' : ''}">${d}${d === today ? ' · today' : ''}</div>`;

  for (const t of times) {
    html += `<div class="cal-cell cal-time-label">${to12h(t)}</div>`;
    for (const d of days) {
      const items = byCell[d + '|' + t] || [];
      const isToday = d === today;
      html += `<div class="cal-cell${isToday ? ' cal-col-today' : ''}">${items.map((it) => {
        const teacherLabel = showTeacherLabel ? ` · ${escapeHtml(it.teacher_nickname || it.teacher_legal_name || '?')}` : '';
        const inactiveCls = it.teacher_active === 0 ? ' inactive-teacher' : '';
        const colorCls = subjectClass(it.subject);
        const arrived = arrivedIds.has(it.schedule_slot_id);
        const attendCls = isToday ? (arrived ? ' attended' : ' not-attended') : '';
        const toggle = isToday
          ? `<button type="button" class="attend-toggle" data-slot="${it.schedule_slot_id}" title="${arrived ? 'Mark not arrived' : 'Mark arrived'}">${arrived ? '✓' : ''}</button>`
          : '';
        // Color is reserved for subject (blue=Math/red=Reading) -- RI is
        // called out with a small text tag instead, rather than a second
        // color, so the two dimensions don't compete visually. IC (the
        // default/common case) gets no tag at all, to keep most chips clean.
        const modeTag = it.mode === 'RI' ? '<span class="mode-tag ri" title="Remote Instruction">RI</span>'
          : it.needs_mode_review ? '<span class="mode-tag review" title="Mode unclear in the source data — needs review">?</span>'
          : '';
        const titleMode = it.mode === 'RI' ? ' (Remote Instruction)' : it.needs_mode_review ? ' (mode unclear — needs review)' : '';
        return `<span class="cal-chip ${colorCls}${inactiveCls}${attendCls}" title="${escapeHtml(it.first_name)} ${escapeHtml(it.last_name)} — ${escapeHtml(it.subject)}${titleMode}">${toggle}${escapeHtml(it.last_name)}${teacherLabel}${modeTag}</span>`;
      }).join('')}</div>`;
    }
  }
  grid.style.gridTemplateColumns = `72px repeat(${days.length}, minmax(140px, 1fr))`;
  grid.innerHTML = html;

  grid.querySelectorAll('.attend-toggle').forEach((btn) => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      btn.disabled = true;
      try {
        await api('/api/attendance/toggle', {
          method: 'POST',
          body: JSON.stringify({ scheduleSlotId: Number(btn.dataset.slot) }),
        });
        await loadCalendar();
      } catch (e) {
        alert('Could not update attendance: ' + e.message);
        btn.disabled = false;
      }
    });
  });
}

// ---- "not arrived today" follow-up list ----------------------------------

function renderNotArrived(todayEntries, arrivedIds, today) {
  const container = el('notArrivedList');
  const notArrived = todayEntries.filter((e) => !arrivedIds.has(e.schedule_slot_id));

  if (!todayEntries.length) {
    el('notArrivedCount').textContent = '';
    container.innerHTML = `<p class="cal-empty">No classes scheduled today${today ? ` (${today})` : ''} for this view.</p>`;
    return;
  }

  el('notArrivedCount').textContent = `${notArrived.length} of ${todayEntries.length}`;

  if (!notArrived.length) {
    container.innerHTML = `<p class="cal-empty">Everyone scheduled today has been marked arrived.</p>`;
    return;
  }

  const byTeacher = {};
  for (const e of notArrived) {
    const key = e.teacher_nickname || e.teacher_legal_name || 'Unassigned';
    (byTeacher[key] = byTeacher[key] || []).push(e);
  }

  container.innerHTML = Object.keys(byTeacher).sort((a, b) => a.localeCompare(b)).map((teacher) => {
    const items = byTeacher[teacher].slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return `
      <div class="not-arrived-group">
        <div class="not-arrived-teacher">${escapeHtml(teacher)}</div>
        ${items.map((it) => `
          <div class="not-arrived-item">
            <span class="not-arrived-name">${escapeHtml(it.last_name)}, ${escapeHtml(it.first_name)}</span>
            <span class="not-arrived-meta">${to12h(it.time)} · ${escapeHtml(it.subject)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

// ---- ASHR -----------------------------------------------------------

function ashrTierClass(result) {
  const key = String(result || '').trim().toLowerCase();
  if (key === 'kis') return 'kis';
  if (key === 'bronze') return 'bronze';
  if (key === 'silver') return 'silver';
  if (key === 'gold') return 'gold';
  if (key === 'asf') return 'asf';
  if (key === 'completer') return 'completer';
  if (key === 'double award') return 'double';
  return 'na';
}

function ashrSourceLabel(row) {
  if (!row.locked) return 'Live preview';
  if (row.source === 'backfill') return 'Backfilled';
  if (row.source === 'corrected') return 'Corrected';
  return 'Locked';
}

async function loadAshrCycles() {
  const cycles = await api('/api/ashr/cycles');
  state.ashr.cycles = cycles;
  if (!cycles.some((c) => c.cycle === state.ashr.selectedCycle)) {
    state.ashr.selectedCycle = cycles.length ? cycles[0].cycle : null;
  }
  renderAshrCyclePills();
  updateAshrAdminLabel();
  updateGoalAwardCycleHint();
}

// The Roster edit panel's "Goal award" field targets the *live* (in-progress)
// ASHR cycle, not a specific calendar month -- e.g. "August 2026" now,
// "February 2027" once that cycle is actually locked in, whenever Nina gets
// to running "Lock in cycle" (not on any hardcoded calendar date). Reuses
// the same cycles list the ASHR tab already fetches (exactly one entry has
// `locked: false` at a time -- the live one), so this stays in sync
// automatically on every page load and right after a real lock-in.
function updateGoalAwardCycleHint() {
  const hint = el('goalAwardCycleHint');
  if (!hint) return;
  const live = state.ashr.cycles.find((c) => !c.locked);
  hint.textContent = live ? `(${live.label})` : '';
}

function renderAshrCyclePills() {
  const row = el('ashrCycleRow');
  row.innerHTML = state.ashr.cycles.map((c) => `
    <button type="button" class="cycle-pill${c.cycle === state.ashr.selectedCycle ? ' active' : ''}" data-cycle="${c.cycle}">
      ${escapeHtml(c.label)}${c.locked ? '' : ' · live preview'}
    </button>
  `).join('');
  row.querySelectorAll('[data-cycle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.ashr.selectedCycle = btn.dataset.cycle;
      renderAshrCyclePills();
      loadAshrTable();
    });
  });
}

function updateAshrAdminLabel() {
  const active = state.ashr.cycles.find((c) => !c.locked);
  const labelEl = el('adminAshrCycleLabel');
  const btn = el('adminLockAshrBtn');
  if (!active) {
    labelEl.textContent = '';
    return;
  }
  labelEl.textContent = `Current live cycle: ${active.label}`;
  btn.textContent = `Lock in ${active.label}`;
}

function currentAshrFilters() {
  const params = new URLSearchParams();
  params.set('cycle', state.ashr.selectedCycle);
  const q = el('ashrSearchInput').value.trim();
  if (q) params.set('q', q);
  const subject = el('ashrSubjectFilter').value;
  if (subject) params.set('subject', subject);
  const grade = el('ashrGradeFilter').value;
  if (grade) params.set('grade', grade);
  const teacherId = el('ashrTeacherFilter').value;
  if (teacherId) params.set('teacherId', teacherId);
  const result = el('ashrResultFilter').value;
  if (result) params.set('result', result);
  if (!el('ashrShowDoubleFilter').checked) params.set('hideDouble', '1');
  return params;
}

function renderAshrSummary(rows) {
  const counts = {};
  for (const r of rows) {
    const key = r.result || 'N/A';
    counts[key] = (counts[key] || 0) + 1;
  }
  const present = ASHR_TIER_ORDER.filter((t) => counts[t]);
  // Anything outside the known tier list (e.g. a source-sheet typo) still
  // shows up here rather than silently vanishing from the summary.
  for (const key of Object.keys(counts)) {
    if (!present.includes(key)) present.push(key);
  }
  const strip = el('ashrSummaryStrip');
  strip.innerHTML = present.map((tier) => `
    <div class="summary-card tier-${ashrTierClass(tier)}">
      <div class="summary-count">${counts[tier]}</div>
      <div class="summary-label">${escapeHtml(tier)}</div>
    </div>
  `).join('');
}

async function loadAshrTable() {
  if (!state.ashr.selectedCycle) return;
  const tbody = el('ashrTableBody');
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Loading…</td></tr>';
  const selected = state.ashr.cycles.find((c) => c.cycle === state.ashr.selectedCycle);
  el('ashrLiveNote').classList.toggle('hidden', !(selected && !selected.locked));

  const rows = await api('/api/ashr?' + currentAshrFilters().toString());
  el('ashrResultCount').textContent = `${rows.length} award${rows.length === 1 ? '' : 's'}`;

  renderAshrSummary(rows);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">No ASHR results match this view.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td><div class="student-name">${escapeHtml(r.last_name)}, ${escapeHtml(r.first_name)}</div></td>
      <td class="student-grade">${escapeHtml(r.grade || '—')}</td>
      <td>${escapeHtml(r.subject)}</td>
      <td class="level-cell">${r.level_raw ? escapeHtml(r.level_raw) : '<span class="no-level">not yet recorded</span>'}</td>
      <td><span class="tier-badge ${ashrTierClass(r.result)}">${escapeHtml(r.result)}</span></td>
      <td><span class="status-tag ${r.locked ? 'status-locked' : 'status-live'}">${escapeHtml(ashrSourceLabel(r))}${!r.locked && r.status === 'double' && r.previousResult ? ` (was ${escapeHtml(r.previousResult)})` : ''}</span></td>
      <td>${escapeHtml(r.teacher_label || '—')}</td>
      <td><button type="button" class="row-edit-btn" data-ashr-edit="${i}">Edit</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-ashr-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = rows[Number(btn.dataset.ashrEdit)];
      if (row.locked) {
        openAshrEditPanel(row);
        return;
      }
      // Live preview row -- editing it means editing the underlying
      // enrollment record, so reuse the normal student edit panel rather
      // than a separate ASHR-specific one (the ASHR row is just a computed
      // reflection of that record, not a fact of its own yet).
      const params = new URLSearchParams({ studentId: row.student_id, subject: row.subject });
      const enrollments = await api('/api/enrollments?' + params.toString());
      if (!enrollments.length) {
        alert('Could not find this student\'s enrollment record to edit.');
        return;
      }
      openEditPanel(enrollments[0]);
    });
  });
}

// ---- editing a locked ASHR award from within the ASHR tab (password-gated) ----

function openAshrEditPanel(row) {
  el('ashr_id').value = row.id;
  const cycleLabel = state.ashr.cycles.find((c) => c.cycle === row.cycle);
  el('ashrPanelSubtitle').textContent =
    `${row.last_name}, ${row.first_name} — ${row.subject} — ${cycleLabel ? cycleLabel.label : row.cycle}`;
  el('ashr_result').value = row.result || 'N/A';
  el('ashr_levelRaw').value = row.level_raw || '';
  el('ashr_teacher').value = row.teacher_id || '';
  el('ashr_password').value = '';
  el('ashrPanelError').classList.add('hidden');
  el('overlay').classList.remove('hidden');
  el('ashrEditPanel').classList.remove('hidden');
}

function closeAshrEditPanel() {
  el('ashrEditPanel').classList.add('hidden');
  hideOverlayIfAllClosed();
}

async function saveAshrEdit(ev) {
  ev.preventDefault();
  const id = el('ashr_id').value;
  const body = {
    result: el('ashr_result').value,
    levelRaw: el('ashr_levelRaw').value || null,
    teacherId: el('ashr_teacher').value ? Number(el('ashr_teacher').value) : null,
    password: el('ashr_password').value,
  };
  const errEl = el('ashrPanelError');
  errEl.classList.add('hidden');
  try {
    await api(`/api/ashr/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    closeAshrEditPanel();
    loadAshrTable();
    refreshUndoButton();
  } catch (e) {
    errEl.textContent = e.message || 'Could not save.';
    errEl.classList.remove('hidden');
  }
}

async function adminDoLockAshr() {
  const active = state.ashr.cycles.find((c) => !c.locked);
  const label = active ? active.label : 'the current cycle';
  const ok = confirm(
    `Lock in ${label}?\n\n` +
    `This saves every qualifying student's current live-preview tier (Math ` +
    `and Reading) as ${label}'s permanent ASHR record, then moves on to the ` +
    `next cycle.\n\n` +
    `This always advances to the next cycle, so it's not safe to click twice ` +
    `— only do this once ${label} is actually over.`
  );
  if (!ok) return;
  const btn = el('adminLockAshrBtn');
  btn.disabled = true;
  const errEl = el('adminAshrError');
  const okEl = el('adminAshrSuccess');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');
  try {
    const result = await api('/api/ashr/lock', { method: 'POST' });
    await loadAshrCycles();
    if (!el('view-ashr').classList.contains('hidden')) {
      state.ashr.selectedCycle = result.lockedCycle;
      renderAshrCyclePills();
      loadAshrTable();
    }
    okEl.textContent = `${result.lockedCycleLabel} locked — ${result.lockedCount} award${result.lockedCount === 1 ? '' : 's'} saved. Now previewing ${result.newActiveCycleLabel}.`;
    okEl.classList.remove('hidden');
  } catch (e) {
    errEl.textContent = e.message || 'Could not lock in the cycle.';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}

// ---- Payments (tuition + Statement of Account tracking) -----------------
// Billed per student, one status a month -- see lib/payments.js in the
// server for the status rules (Paid/Unpaid/Absent, plus a "reconciled" flag
// when a payment comes in after the student was already reported absent).
// This tab is the dedicated workspace; the Roster tab only shows a compact
// read-only badge (see fmtPaymentBadge above) so day-to-day payment
// tracking doesn't have to compete for space with enrollment editing.

async function loadPaymentMonths() {
  const months = await api('/api/payments/months');
  state.payments.months = months;
  const filter = el('payMonthFilter');
  const current = filter.value;
  filter.innerHTML = '<option value="">Current (live)</option>';
  for (const m of months) {
    if (state.activeMonth && m === state.activeMonth.month) continue; // "Current (live)" already covers this one
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = fmtMonth(m);
    filter.appendChild(opt);
  }
  filter.value = months.includes(current) ? current : '';
}

function currentPaymentFilters() {
  const params = new URLSearchParams();
  const month = el('payMonthFilter').value;
  if (month) params.set('month', month);
  const q = el('paySearchInput').value.trim();
  if (q) params.set('q', q);
  const teacherId = el('payTeacherFilter').value;
  if (teacherId) params.set('teacherId', teacherId);
  const group = el('payGroupFilter').value;
  if (group) params.set('group', group);
  const status = el('payStatusFilter').value;
  if (status) params.set('status', status);
  if (el('payNeedsAttentionFilter').checked) params.set('needsAttention', '1');
  return params;
}

function fmtSoaDate(d) {
  return d ? escapeHtml(d) : '<span class="no-level">—</span>';
}

// ₱-formatted amount. null/undefined means "not computed" (e.g. tuition
// couldn't be determined for a flagged grade) -- distinct from an actual
// ₱0, so it renders as an em dash rather than a misleading zero.
function fmtMoney(n) {
  if (n === null || n === undefined) return '—';
  const v = Number(n);
  const hasCents = Math.abs(v - Math.round(v)) > 0.001;
  return '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 });
}

// Balance column: positive = still owed (red), negative = credit toward
// next month (green), zero = settled (muted dash).
function fmtBalance(n) {
  if (n === null || n === undefined) return '<span class="no-level">—</span>';
  if (n > 0.005) return `<span class="balance-due">${fmtMoney(n)}</span>`;
  if (n < -0.005) return `<span class="balance-credit">${fmtMoney(-n)} credit</span>`;
  return '<span class="no-level">—</span>';
}

// Small colored icon(s) next to a student's name on the Payments tab showing
// which subject(s) they're active in -- M (blue) for Math, R (red) for
// Reading, both shown together for a two-subject student. Reuses `subjects`
// as returned by /api/payments (Aug 20 follow-up), which is already the
// distinct set of that student's Active subject_enrollment rows -- no new
// lookup needed.
function fmtSubjectIcons(subjects) {
  if (!subjects || !subjects.length) return '';
  const icons = subjects.map((s) => {
    const cls = s === 'Math' ? 'math' : s === 'Reading' ? 'reading' : '';
    const letter = s === 'Math' ? 'M' : s === 'Reading' ? 'R' : s.charAt(0);
    return `<span class="subject-icon ${cls}" title="${escapeHtml(s)}">${letter}</span>`;
  }).join('');
  return `<span class="subject-icons">${icons}</span>`;
}

function renderPaymentSummary(rows) {
  const counts = { paid: 0, partial: 0, advance: 0, unpaid: 0, absent: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  const order = [
    ['paid', 'Paid'], ['partial', 'Partially Paid'], ['advance', 'Advance / Credit'],
    ['unpaid', 'Unpaid'], ['absent', 'Absent (reported)'],
  ];
  el('paySummaryStrip').innerHTML = order.map(([key, label]) => `
    <div class="summary-card payment-summary-${key}">
      <div class="summary-count">${counts[key] || 0}</div>
      <div class="summary-label">${label}</div>
    </div>
  `).join('');
}

async function loadPaymentsTable() {
  const tbody = el('paymentsTableBody');
  tbody.innerHTML = '<tr><td colspan="14" class="loading">Loading…</td></tr>';
  // Any change that re-runs this (search, filters, switching months) starts
  // a fresh selection -- carrying checked rows across a filter change would
  // risk bulk-marking a student the teacher can no longer even see.
  clearPaymentSelection();
  const rows = await api('/api/payments?' + currentPaymentFilters().toString());
  state.payments.rows = rows;
  // "students" is the Payments row count (one row per student, billed as one
  // combined amount); "enrollees" is the sum of each row's active subjects --
  // the same per-subject count the Roster tab tracks (a student who drops
  // Math but keeps Reading contributes 1 to this count, not 2), so the two
  // tabs' numbers make sense side by side instead of looking mismatched.
  const enrolleeCount = rows.reduce((sum, r) => sum + (r.subjects ? r.subjects.length : 0), 0);
  el('payResultCount').textContent =
    `${rows.length} student${rows.length === 1 ? '' : 's'} · ${enrolleeCount} enrollee${enrolleeCount === 1 ? '' : 's'}`;
  const monthVal = el('payMonthFilter').value;
  el('paymentsMonthLabel').textContent = `Viewing ${monthVal ? fmtMonth(monthVal) : (state.activeMonth ? state.activeMonth.label : '')}`;

  renderPaymentSummary(rows);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="14" class="empty">No matching students.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r, i) => `
    <tr class="${r.needs_attention ? 'needs-review' : ''}">
      <td><input type="checkbox" class="pay-row-checkbox" data-pay-select="${r.student_id}" /></td>
      <td><div class="student-name">${escapeHtml(r.last_name)}, ${escapeHtml(r.first_name)}${fmtSubjectIcons(r.subjects)} ${fmtReturneeBadge(r)}</div></td>
      <td class="student-grade">${escapeHtml(r.grade || '—')}</td>
      <td>${escapeHtml(r.teacher_label)}</td>
      <td>${fmtSoaDate(r.soa1_sent_date)}</td>
      <td>${fmtSoaDate(r.soa2_sent_date)}</td>
      <td>${fmtSoaDate(r.soa3_sent_date)}</td>
      <td>${fmtSoaDate(r.soa4_sent_date)}</td>
      <td>${fmtMoney(r.amount_due)}${r.tuition_flagged ? '<span class="tuition-flag" title="Grade not recognized — tuition couldn\'t be auto-calculated">?</span>' : ''}</td>
      <td>${r.amount_paid === null ? '<span class="no-level">—</span>' : fmtMoney(r.amount_paid)}</td>
      <td>${fmtBalance(r.remaining_balance)}</td>
      <td>${fmtPaymentBadge({ payment_status: r.status, payment_status_label: r.status_label, payment_reconciled: r.reconciled, needs_attention: r.needs_attention, needs_attention_note: r.needs_attention_note })}</td>
      <td>${renderReceiptCell(r)}</td>
      <td>
        <button type="button" class="row-edit-btn" data-pay-edit="${i}">Edit</button>
        <button type="button" class="row-edit-btn" data-pay-soa="${i}"
          title="Download this student's Statement of Account -- combined with their billing group if they belong to one, individual otherwise">${DOWNLOAD_ICON_SVG} SOA</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-pay-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openPaymentEditPanel(rows[Number(btn.dataset.payEdit)]));
  });
  tbody.querySelectorAll('[data-pay-soa]').forEach((btn) => {
    btn.addEventListener('click', () => downloadPaymentRowSoa(rows[Number(btn.dataset.paySoa)], btn));
  });
  tbody.querySelectorAll('[data-pay-select]').forEach((cb) => {
    cb.addEventListener('change', () => {
      setPaymentSelected(Number(cb.dataset.paySelect), cb.checked);
    });
  });
  wirePaymentsReceiptCells(rows);
}

async function loadPayments() {
  await loadPaymentMonths();
  loadPaymentsTable();
}

// ---- Receipt upload + verification (Aug 27 follow-up) --------------------
// Nina: teachers drag a GCash/bank-transfer receipt screenshot straight
// onto a student's Payments row instead of emailing it to a shared inbox;
// the server OCRs a best-effort reference number/amount/date (see
// lib/ocr.js + server.js's callOcrSpace). Joanne verifies/flags/rejects
// each one from the new Payment Verification tab -- only a verified
// receipt's amount ever lands in the student's actual paid total, see the
// payment_receipt table comment in lib/db.js for the full reasoning.

const RECEIPT_STATUS_LABEL = {
  pending_review: 'Pending Review',
  verified: 'Verified',
  flagged: 'Flagged',
  rejected: 'Rejected',
};
const RECEIPT_STATUS_CLASS = {
  pending_review: 'pending-review',
  verified: 'verified',
  flagged: 'flagged',
  rejected: 'rejected',
};

function receiptBadge(status) {
  return `<span class="payment-badge ${RECEIPT_STATUS_CLASS[status] || ''}">${RECEIPT_STATUS_LABEL[status] || status}</span>`;
}

function receiptImageUrl(receiptId) {
  return `/api/payments/receipts/${receiptId}/image`;
}

function openReceiptViewer(receiptId) {
  el('receiptViewerImg').src = receiptImageUrl(receiptId);
  el('overlay').classList.remove('hidden');
  el('receiptViewerPanel').classList.remove('hidden');
}

function closeReceiptViewer() {
  el('receiptViewerPanel').classList.add('hidden');
  el('receiptViewerImg').src = '';
  hideOverlayIfAllClosed();
}

function fileToDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadReceiptFile(studentId, month, file, onDone) {
  if (!file) return;
  if (!file.type || !file.type.startsWith('image/')) {
    alert('Please drop an image file (PNG, JPEG, or WebP screenshot of the receipt).');
    return;
  }
  try {
    const dataUri = await fileToDataUri(file);
    await api(`/api/payments/${studentId}/receipts`, {
      method: 'POST',
      body: JSON.stringify({ month, dataUri }),
    });
    refreshUndoButton();
    if (onDone) await onDone();
  } catch (e) {
    alert('Could not upload the receipt: ' + e.message);
  }
}

// Wires drag-and-drop onto any container element -- shared by the Payments
// row's compact drop-zone cell and the Edit panel's larger one, so the
// highlight/drop behavior only needs writing once. dragDepth guards against
// the dragleave-on-child-element flicker that a naive dragenter/dragleave
// pair produces when the container has any children (the icon/text inside
// the drop zone, or the thumbnail/badge inside an existing chip).
// `groupInfo` (Aug 27, same-day follow-up) is `{ billingGroupId,
// billingGroupName }` when the student being dropped on belongs to a
// billing group, or null/undefined for a solo student -- unchanged
// behavior in the solo case. This is what fixed the real bug Nina hit:
// dropping the same family receipt onto three siblings' rows individually
// and verifying each for the full amount. Now a grouped student's drop
// pauses to ask whether the receipt covers just them or the whole group,
// rather than silently assuming "just this one" the way every drop used to.
function wireReceiptDropzone(container, studentId, month, onUploaded, groupInfo) {
  if (!container) return;
  // Assigned via on* properties (not addEventListener) so re-wiring a
  // long-lived container -- the Edit panel's dropzone is opened and
  // re-opened across many different students -- replaces the previous
  // handlers instead of stacking a duplicate set on top of them, which
  // would otherwise upload the same dropped file once per prior time the
  // panel had been opened. Same reasoning as payMarkAbsentBtn.onclick above.
  let dragDepth = 0;
  container.ondragenter = (ev) => {
    ev.preventDefault();
    dragDepth += 1;
    container.classList.add('drag-over');
  };
  container.ondragover = (ev) => ev.preventDefault();
  container.ondragleave = () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) container.classList.remove('drag-over');
  };
  container.ondrop = async (ev) => {
    ev.preventDefault();
    dragDepth = 0;
    container.classList.remove('drag-over');
    const file = ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      alert('Please drop an image file (PNG, JPEG, or WebP screenshot of the receipt).');
      return;
    }
    if (groupInfo && groupInfo.billingGroupId) {
      const splitAcrossGroup = confirm(
        `This student is part of the "${groupInfo.billingGroupName}" billing group.\n\n` +
        `OK -- split this receipt across the whole group (one payment covering more than one sibling).\n` +
        `Cancel -- this receipt is for this student only.`
      );
      if (splitAcrossGroup) {
        openReceiptGroupSplitPanel(studentId, groupInfo.billingGroupId, groupInfo.billingGroupName, month, file, onUploaded);
        return;
      }
    }
    await uploadReceiptFile(studentId, month, file, onUploaded);
  };
}

// ---- Whole-group receipt split panel (Aug 27, same-day follow-up) -----
// Opened by wireReceiptDropzone above when a grouped student's drop is
// deliberately split across the whole billing group rather than credited
// to just this one student. Amounts default to each member's own
// remaining balance this month, fetched via the SAME /api/payments/:id/soa
// endpoint the Payments-tab SOA button and Billing Groups tab already use
// -- this panel never computes tuition itself, only lets Joanne adjust the
// pre-filled numbers before the shared file is uploaded once and split.
let receiptGroupSplitFile = null;
let receiptGroupSplitGroupId = null;
let receiptGroupSplitMonth = null;
let receiptGroupSplitOnUploaded = null;

async function openReceiptGroupSplitPanel(studentId, groupId, groupName, month, file, onUploaded) {
  receiptGroupSplitFile = file;
  receiptGroupSplitGroupId = groupId;
  receiptGroupSplitMonth = month;
  receiptGroupSplitOnUploaded = onUploaded || null;
  el('receiptGroupSplitSubtitle').textContent = `${groupName} — ${fmtMonth(month)}`;
  el('receiptGroupSplitMembers').innerHTML = '<p class="no-receipts-note">Loading each member’s balance…</p>';
  el('receiptGroupSplitTotal').textContent = '';
  el('overlay').classList.remove('hidden');
  el('receiptGroupSplitPanel').classList.remove('hidden');
  try {
    const soa = await api(`/api/payments/${studentId}/soa?month=${encodeURIComponent(month)}`);
    const members = (soa && soa.members) || [];
    el('receiptGroupSplitMembers').innerHTML = members.map((m) => `
      <div class="receipt-split-member">
        <span class="receipt-split-member-name">${escapeHtml(m.last_name)}, ${escapeHtml(m.first_name)}</span>
        <input type="number" step="0.01" min="0" class="receipt-split-amount"
               data-student-id="${m.student_id}" value="${Math.max(0, m.remainingBalance || 0).toFixed(2)}" />
      </div>
    `).join('');
    wireReceiptGroupSplitTotal();
  } catch (e) {
    el('receiptGroupSplitMembers').innerHTML = `<p class="no-receipts-note">Could not load the group's balances: ${escapeHtml(e.message)}</p>`;
  }
}

function closeReceiptGroupSplitPanel() {
  el('receiptGroupSplitPanel').classList.add('hidden');
  receiptGroupSplitFile = null;
  receiptGroupSplitGroupId = null;
  receiptGroupSplitMonth = null;
  receiptGroupSplitOnUploaded = null;
  hideOverlayIfAllClosed();
}

// Live "Total entered" readout under the per-member inputs -- Joanne's
// quick sanity check that the amounts she's about to submit actually add
// up to what the receipt shows, before the group upload is submitted.
function wireReceiptGroupSplitTotal() {
  const inputs = el('receiptGroupSplitMembers').querySelectorAll('.receipt-split-amount');
  const updateTotal = () => {
    let total = 0;
    inputs.forEach((inp) => { total += Number(inp.value) || 0; });
    el('receiptGroupSplitTotal').textContent = `Total entered: ${fmtMoney(total)}`;
  };
  inputs.forEach((inp) => inp.addEventListener('input', updateTotal));
  updateTotal();
}

async function confirmReceiptGroupSplit(ev) {
  ev.preventDefault();
  if (!receiptGroupSplitFile || !receiptGroupSplitGroupId) return;
  const inputs = el('receiptGroupSplitMembers').querySelectorAll('.receipt-split-amount');
  const splits = [];
  inputs.forEach((inp) => {
    const amount = Number(inp.value);
    if (Number.isFinite(amount) && amount > 0) {
      splits.push({ studentId: Number(inp.dataset.studentId), amount });
    }
  });
  if (!splits.length) {
    alert('Enter at least one member\'s share before uploading.');
    return;
  }
  try {
    const dataUri = await fileToDataUri(receiptGroupSplitFile);
    await api(`/api/billing-groups/${receiptGroupSplitGroupId}/receipts`, {
      method: 'POST',
      body: JSON.stringify({ month: receiptGroupSplitMonth, dataUri, splits }),
    });
    refreshUndoButton();
    const onUploaded = receiptGroupSplitOnUploaded;
    closeReceiptGroupSplitPanel();
    if (onUploaded) await onUploaded();
    else await loadPaymentsTable();
  } catch (e) {
    alert('Could not upload the group receipt: ' + e.message);
  }
}

// The Payments row's Receipt cell -- an empty dashed drop target when
// nothing's been uploaded yet this month, or a clickable chip (thumbnail +
// status pill) showing the most recent receipt once one exists. A second or
// third receipt the same month (partial payments) shows as a small "+N"
// count rather than trying to cram every receipt into the row -- the full
// list lives in the Edit panel's Receipts section, opened by clicking the
// chip.
function renderReceiptCell(r) {
  if (!r.receipts || !r.receipts.length) {
    return `<div class="receipt-dropzone" data-receipt-drop="${r.student_id}" data-receipt-month="${r.month}">${RECEIPT_ICON_SVG} Drop receipt</div>`;
  }
  const latest = r.receipts[0];
  const countBadge = r.receipts.length > 1 ? `<span class="receipt-chip-count">+${r.receipts.length - 1}</span>` : '';
  // group_upload_id set (Aug 27 follow-up) means this receipt was uploaded
  // once and split across a whole billing group, not just this student --
  // the badge is the visual cue that stops a repeat of the original bug
  // (uploading the same screenshot again per sibling without realizing one
  // upload already covered everyone).
  const groupBadge = latest.group_upload_id
    ? `<span class="receipt-chip-group" title="Part of a combined family receipt covering the whole billing group">Group</span>`
    : '';
  return `
    <div class="receipt-chip" data-receipt-drop="${r.student_id}" data-receipt-month="${r.month}"
         data-receipt-open="${r.student_id}" title="Click to view all receipts for this month">
      <img class="receipt-thumb" src="${receiptImageUrl(latest.id)}" alt="Receipt thumbnail" />
      ${receiptBadge(latest.status)}${countBadge}${groupBadge}
    </div>
  `;
}

function wirePaymentsReceiptCells(rows) {
  el('paymentsTableBody').querySelectorAll('[data-receipt-drop]').forEach((cell) => {
    const studentId = Number(cell.dataset.receiptDrop);
    const month = cell.dataset.receiptMonth;
    const row = rows.find((r) => r.student_id === studentId);
    const groupInfo = row && row.billing_group_id
      ? { billingGroupId: row.billing_group_id, billingGroupName: row.billing_group_name }
      : null;
    wireReceiptDropzone(cell, studentId, month, loadPaymentsTable, groupInfo);
    if (cell.dataset.receiptOpen) {
      cell.addEventListener('click', () => {
        const row = rows.find((r) => r.student_id === studentId);
        if (row) openPaymentEditPanel(row);
      });
    }
  });
}

// ---- Edit panel's Receipts section -----------------------------------
// Lives inside the same paymentEditPanel as the amount/paid-date fields
// (see #payReceiptsSection in index.html) -- a second entry point for
// uploading, plus the only place to see every receipt on record for this
// student/month and delete a mistaken upload before it's reviewed.

function receiptListItemHtml(r) {
  const fields = [];
  fields.push(`Ref: ${r.reference_number ? escapeHtml(r.reference_number) : '<span class="no-level">not read</span>'}`);
  fields.push(`Amount: ${r.amount === null ? '<span class="no-level">not read</span>' : fmtMoney(r.amount)}`);
  fields.push(`Date: ${r.paid_date ? escapeHtml(r.paid_date) : '<span class="no-level">not read</span>'}`);
  const note = r.review_note
    ? `<div class="receipt-list-item-note">${r.status === 'flagged' ? 'Flagged' : r.status === 'rejected' ? 'Rejected' : 'Note'}: ${escapeHtml(r.review_note)}</div>`
    : '';
  const deleteBtn = r.status === 'pending_review' || r.status === 'flagged' || r.status === 'rejected'
    ? `<button type="button" class="btn btn-small btn-danger" data-receipt-delete="${r.id}">Delete</button>`
    : '';
  const groupBadge = r.group_upload_id
    ? `<span class="receipt-chip-group" title="Part of a combined family receipt covering the whole billing group">Group</span>`
    : '';
  return `
    <div class="receipt-list-item">
      <img class="receipt-thumb-lg" src="${receiptImageUrl(r.id)}" alt="Receipt" data-receipt-view="${r.id}" />
      <div class="receipt-list-item-body">
        <div>${receiptBadge(r.status)}${groupBadge}</div>
        <div class="receipt-list-item-fields">${fields.join(' · ')}</div>
        ${note}
        <div class="receipt-list-item-meta">Uploaded ${escapeHtml(r.uploaded_at || '')}${r.uploaded_by ? ' by ' + escapeHtml(r.uploaded_by) : ''}</div>
        ${deleteBtn}
      </div>
    </div>
  `;
}

async function loadReceiptsForEditPanel(studentId, month) {
  const listEl = el('payReceiptList');
  const row = state.payments.rows.find((r) => r.student_id === studentId && r.month === month) || currentPaymentEditRow;
  const receipts = (row && row.receipts) || [];
  listEl.innerHTML = receipts.length
    ? receipts.map(receiptListItemHtml).join('')
    : '<p class="no-receipts-note">No receipts uploaded yet for this month.</p>';
  listEl.querySelectorAll('[data-receipt-view]').forEach((img) => {
    img.addEventListener('click', () => openReceiptViewer(Number(img.dataset.receiptView)));
  });
  listEl.querySelectorAll('[data-receipt-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteReceiptFromPanel(Number(btn.dataset.receiptDelete), studentId, month));
  });
}

async function refreshEditPanelReceipts(studentId, month) {
  // The panel's row data can be stale the moment a receipt is uploaded --
  // re-fetch just this student's row rather than the whole table so the
  // still-open panel's receipt list reflects the new upload immediately;
  // loadPaymentsTable() also runs (not awaited) so the row's chip in the
  // background table stays in sync without disturbing the open panel.
  loadPaymentsTable();
  const rows = await api(`/api/payments?month=${encodeURIComponent(month)}`);
  const row = rows.find((r) => r.student_id === studentId);
  if (row) {
    const idx = state.payments.rows.findIndex((r) => r.student_id === studentId && r.month === month);
    if (idx >= 0) state.payments.rows[idx] = row;
    if (currentPaymentEditRow && currentPaymentEditRow.student_id === studentId) currentPaymentEditRow = row;
  }
  loadReceiptsForEditPanel(studentId, month);
}

async function deleteReceiptFromPanel(receiptId, studentId, month) {
  try {
    await api(`/api/payments/receipts/${receiptId}`, { method: 'DELETE' });
    refreshUndoButton();
    refreshEditPanelReceipts(studentId, month);
  } catch (e) {
    alert('Could not delete the receipt: ' + e.message);
  }
}

// ---- Payment Verification tab (Aug 27 follow-up) -----------------------
// Joanne's queue: every receipt still pending_review or flagged, oldest
// first (see listPendingReceipts in server.js). No login/role system
// exists yet, so this tab is reachable by anyone with the app open, same
// as every other tab -- there's nothing stronger to gate it behind yet.

function verifyCardHtml(r) {
  const ocrNote = r.ocr_error
    ? `<div class="verify-card-ocr-note">OCR: ${escapeHtml(r.ocr_error)} -- fields left blank below for manual entry.</div>`
    : (r.extracted_reference || r.extracted_amount || r.extracted_date)
      ? `<div class="verify-card-ocr-note">Extracted automatically -- double check against your bank access before verifying.</div>`
      : '';
  return `
    <div class="verify-card ${r.status === 'flagged' ? 'is-flagged' : ''}" data-verify-card="${r.id}">
      <img class="verify-card-thumb" src="${receiptImageUrl(r.id)}" alt="Receipt" data-receipt-view="${r.id}" />
      <div class="verify-card-body">
        <div class="verify-card-header">
          <span class="verify-card-student">${escapeHtml(r.last_name)}, ${escapeHtml(r.first_name)} — ${fmtMonth(r.month)}</span>
          ${receiptBadge(r.status)}
        </div>
        <div class="verify-card-meta">Uploaded ${escapeHtml(r.uploaded_at || '')}${r.uploaded_by ? ' by ' + escapeHtml(r.uploaded_by) : ''}</div>
        ${ocrNote}
        ${r.status === 'flagged' && r.review_note ? `<div class="receipt-list-item-note">Previously flagged: ${escapeHtml(r.review_note)}</div>` : ''}
        <div class="verify-card-fields">
          <label>Reference number
            <input type="text" class="input" data-field="reference" value="${escapeHtml(r.reference_number || '')}" />
          </label>
          <label>Amount received (₱)
            <input type="number" step="0.01" min="0" class="input" data-field="amount" value="${r.amount === null ? '' : r.amount}" />
          </label>
          <label>Date paid
            <input type="date" class="input" data-field="paidDate" value="${r.paid_date || ''}" />
          </label>
        </div>
        <div class="verify-card-actions">
          <button type="button" class="btn btn-small btn-verify" data-verify-action="verify">${CHECK_ICON_SVG} Verify</button>
          <input type="text" class="input verify-card-note-input" placeholder="Note (required to flag or reject)" data-field="note" />
          <button type="button" class="btn btn-small btn-flag" data-verify-action="flag">${FLAG_ICON_SVG} Flag</button>
          <button type="button" class="btn btn-small btn-reject" data-verify-action="reject">${REJECT_ICON_SVG} Reject</button>
        </div>
      </div>
    </div>
  `;
}

// Combined Verification-queue card for a whole-group receipt upload (Aug
// 27, same-day follow-up) -- one thumbnail (they're all the same physical
// screenshot), one shared reference/date, but a separate editable amount
// per still-pending member so Joanne can see and adjust each sibling's
// share before approving the batch in one action. `rows` is every pending
// payment_receipt row sharing one group_upload_id.
function verifyGroupCardHtml(rows) {
  const first = rows[0];
  const names = rows.map((r) => `${r.last_name}, ${r.first_name}`).join(' · ');
  const ocrNote = first.ocr_error
    ? `<div class="verify-card-ocr-note">OCR: ${escapeHtml(first.ocr_error)} -- fields left blank below for manual entry.</div>`
    : (first.extracted_reference || first.extracted_amount || first.extracted_date)
      ? `<div class="verify-card-ocr-note">Extracted automatically -- double check against your bank access before verifying.</div>`
      : '';
  const memberRows = rows.map((r) => `
    <div class="verify-group-member" data-verify-group-member="${r.id}">
      <span class="verify-group-member-name">${escapeHtml(r.last_name)}, ${escapeHtml(r.first_name)}</span>
      <label>Amount (₱)
        <input type="number" step="0.01" min="0" class="input" data-field="amount" value="${r.amount === null ? '' : r.amount}" />
      </label>
    </div>
  `).join('');
  return `
    <div class="verify-card verify-group-card ${rows.some((r) => r.status === 'flagged') ? 'is-flagged' : ''}"
         data-verify-group-card="${first.group_upload_id}">
      <img class="verify-card-thumb" src="${receiptImageUrl(first.id)}" alt="Receipt" data-receipt-view="${first.id}" />
      <div class="verify-card-body">
        <div class="verify-card-header">
          <span class="verify-card-student">${escapeHtml(names)} — ${fmtMonth(first.month)}</span>
          <span class="receipt-chip-group">Group (${rows.length})</span>
        </div>
        <div class="verify-card-meta">Uploaded ${escapeHtml(first.uploaded_at || '')}${first.uploaded_by ? ' by ' + escapeHtml(first.uploaded_by) : ''}</div>
        ${ocrNote}
        ${rows.some((r) => r.status === 'flagged' && r.review_note) ? `<div class="receipt-list-item-note">Previously flagged: ${escapeHtml(rows.find((r) => r.review_note).review_note)}</div>` : ''}
        <div class="verify-card-fields">
          <label>Reference number
            <input type="text" class="input" data-field="reference" value="${escapeHtml(first.reference_number || '')}" />
          </label>
          <label>Date paid
            <input type="date" class="input" data-field="paidDate" value="${first.paid_date || ''}" />
          </label>
        </div>
        <div class="verify-group-members">${memberRows}</div>
        <p class="field-hint" data-verify-group-total></p>
        <div class="verify-card-actions">
          <button type="button" class="btn btn-small btn-verify" data-verify-group-action="verify">${CHECK_ICON_SVG} Verify all</button>
          <input type="text" class="input verify-card-note-input" placeholder="Note (required to flag or reject)" data-field="note" />
          <button type="button" class="btn btn-small btn-flag" data-verify-group-action="flag">${FLAG_ICON_SVG} Flag all</button>
          <button type="button" class="btn btn-small btn-reject" data-verify-group-action="reject">${REJECT_ICON_SVG} Reject all</button>
        </div>
        <button type="button" class="btn-link" data-verify-group-separate="${first.group_upload_id}">Handle these separately instead</button>
      </div>
    </div>
  `;
}

// Group ids Joanne has chosen to "handle separately instead" -- falls back
// to rendering each member's original, entirely unchanged single-receipt
// card/flow for that batch. Session-only (resets on page reload); once a
// group's members are all decided on, it naturally drops out of the
// pending queue and this stops mattering for that id.
const verifyUngroupedIds = new Set();

async function loadVerificationQueue() {
  const container = el('verificationQueue');
  container.innerHTML = '<p class="loading">Loading…</p>';
  const rows = await api('/api/payments/receipts/pending');
  el('verificationResultCount').textContent = `${rows.length} receipt${rows.length === 1 ? '' : 's'} awaiting a decision`;
  if (!rows.length) {
    container.innerHTML = '<p class="cal-empty">Nothing waiting on review right now.</p>';
    return;
  }
  // Cluster rows sharing a non-null group_upload_id into one combined card
  // (unless Joanne opted out for that group), otherwise render exactly the
  // same single-receipt card every solo upload has always used.
  const cards = [];
  const seenGroups = new Set();
  for (const r of rows) {
    if (r.group_upload_id && !verifyUngroupedIds.has(r.group_upload_id)) {
      if (seenGroups.has(r.group_upload_id)) continue;
      seenGroups.add(r.group_upload_id);
      const groupRows = rows.filter((x) => x.group_upload_id === r.group_upload_id);
      cards.push(groupRows.length > 1 ? verifyGroupCardHtml(groupRows) : verifyCardHtml(r));
    } else {
      cards.push(verifyCardHtml(r));
    }
  }
  container.innerHTML = cards.join('');
  container.querySelectorAll('[data-receipt-view]').forEach((img) => {
    img.addEventListener('click', () => openReceiptViewer(Number(img.dataset.receiptView)));
  });
  container.querySelectorAll('[data-verify-card]').forEach((card) => {
    const receiptId = Number(card.dataset.verifyCard);
    card.querySelectorAll('[data-verify-action]').forEach((btn) => {
      btn.addEventListener('click', () => handleVerifyAction(receiptId, btn.dataset.verifyAction, card));
    });
  });
  container.querySelectorAll('[data-verify-group-card]').forEach((card) => {
    const groupUploadId = card.dataset.verifyGroupCard;
    card.querySelectorAll('[data-verify-group-action]').forEach((btn) => {
      btn.addEventListener('click', () => handleVerifyGroupAction(groupUploadId, btn.dataset.verifyGroupAction, card));
    });
    const updateTotal = () => {
      let total = 0;
      card.querySelectorAll('.verify-group-member [data-field="amount"]').forEach((inp) => { total += Number(inp.value) || 0; });
      card.querySelector('[data-verify-group-total]').textContent = `Total entered: ${fmtMoney(total)}`;
    };
    card.querySelectorAll('.verify-group-member [data-field="amount"]').forEach((inp) => inp.addEventListener('input', updateTotal));
    updateTotal();
  });
  container.querySelectorAll('[data-verify-group-separate]').forEach((btn) => {
    btn.addEventListener('click', () => {
      verifyUngroupedIds.add(btn.dataset.verifyGroupSeparate);
      loadVerificationQueue();
    });
  });
}

async function handleVerifyAction(receiptId, action, card) {
  const val = (field) => {
    const input = card.querySelector(`[data-field="${field}"]`);
    return input ? input.value : '';
  };
  try {
    if (action === 'verify') {
      await api(`/api/payments/receipts/${receiptId}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          referenceNumber: val('reference') || null,
          amount: val('amount') === '' ? null : Number(val('amount')),
          paidDate: val('paidDate') || null,
        }),
      });
    } else {
      const note = val('note');
      if (!note.trim()) {
        alert(`Enter a note explaining why you're ${action === 'flag' ? 'flagging' : 'rejecting'} this receipt.`);
        return;
      }
      await api(`/api/payments/receipts/${receiptId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      });
    }
    refreshUndoButton();
    loadVerificationQueue();
    if (!el('view-payments').classList.contains('hidden')) loadPaymentsTable();
  } catch (e) {
    alert('Could not save this decision: ' + e.message);
  }
}

// Group version of handleVerifyAction above -- one call covers every
// still-pending member of the batch, using the group verify/flag/reject
// endpoints so a single Undo click reverses the whole thing together.
async function handleVerifyGroupAction(groupUploadId, action, card) {
  // reference/paidDate are unique per card (shared across the whole group);
  // the note input is likewise unique (one shared note for the batch) but
  // lives in .verify-card-actions rather than .verify-card-fields, unlike
  // the single-receipt card's val() helper -- kept separate here rather
  // than reusing that helper so "amount" (which repeats once per member)
  // never gets ambiguously matched by a single querySelector call.
  const val = (field) => {
    const input = card.querySelector(`.verify-card-fields [data-field="${field}"]`);
    return input ? input.value : '';
  };
  const noteVal = () => {
    const input = card.querySelector('.verify-card-note-input');
    return input ? input.value : '';
  };
  try {
    if (action === 'verify') {
      const amounts = [];
      card.querySelectorAll('[data-verify-group-member]').forEach((memberEl) => {
        const receiptId = Number(memberEl.dataset.verifyGroupMember);
        const input = memberEl.querySelector('[data-field="amount"]');
        const amount = input ? Number(input.value) : NaN;
        if (Number.isFinite(amount) && amount > 0) amounts.push({ receiptId, amount });
      });
      await api(`/api/payments/receipts/group/${groupUploadId}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          referenceNumber: val('reference') || null,
          paidDate: val('paidDate') || null,
          amounts,
        }),
      });
    } else {
      const note = noteVal();
      if (!note.trim()) {
        alert(`Enter a note explaining why you're ${action === 'flag' ? 'flagging' : 'rejecting'} this group receipt.`);
        return;
      }
      await api(`/api/payments/receipts/group/${groupUploadId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      });
    }
    refreshUndoButton();
    loadVerificationQueue();
    if (!el('view-payments').classList.contains('hidden')) loadPaymentsTable();
  } catch (e) {
    alert('Could not save this decision: ' + e.message);
  }
}

// ---- Absent tab (Aug 21) -------------------------------------------------
// Deliberately separate from the Payments tab's payment-lapse come-back
// list -- see the note in index.html above #view-absent. Reuses the same
// "Edit" pattern as every other tab: fetch that student's enrollment rows
// and hand the first one to the shared openEditPanel, which now knows how
// to show the retention-status section since listEnrollments carries
// roster_status/absent_reported_date/absent_source_note.

// Same-day follow-up (Aug 21) -- month history dropdown, mirroring the
// Payments tab's month filter (loadPaymentMonths/payMonthFilter) exactly:
// "Current (live)" (empty value, server defaults to the active month) plus
// every month that actually has absent students on record, plus an
// explicit "All absent students" escape hatch for when the month a
// specific student left doesn't matter.
async function loadAbsentMonths() {
  const months = await api('/api/absent/months');
  const filter = el('absentMonthFilter');
  const current = filter.value;
  filter.innerHTML = '<option value="">Current (live)</option>';
  for (const m of months) {
    if (state.activeMonth && m === state.activeMonth.month) continue; // "Current (live)" already covers this one
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = fmtMonth(m);
    filter.appendChild(opt);
  }
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All absent students';
  filter.appendChild(allOpt);
  filter.value = (current && [...filter.options].some((o) => o.value === current)) ? current : '';
}

function currentAbsentFilters() {
  const params = new URLSearchParams();
  const month = el('absentMonthFilter').value;
  if (month) params.set('month', month);
  const q = el('absentSearchInput').value.trim();
  if (q) params.set('q', q);
  const teacherId = el('absentTeacherFilter').value;
  if (teacherId) params.set('teacherId', teacherId);
  const grade = el('absentGradeFilter').value;
  if (grade) params.set('grade', grade);
  const subject = el('absentSubjectFilter').value;
  if (subject) params.set('subject', subject);
  const bucket = el('absentBucketFilter').value;
  if (bucket) params.set('bucket', bucket);
  return params;
}

// Aug 21 follow-up -- auto-flagged, threshold-based risk signals (Nina:
// "something the app auto-flags based on thresholds"), computed server-
// side in lib/risk.js. Three distinct states, not two: real flags (red),
// checked-and-clean (muted, positive), and "not enough data to check yet"
// (also muted, but deliberately NOT styled the same as "clean" -- an empty
// flags list means very different things in those two cases, and showing
// them identically would misrepresent a data gap as a clean bill of
// health). Worksheets/sets isn't tracked at all yet, so every row also
// carries that caveat regardless of which of the three states it's in.
function fmtRiskSignals(r) {
  const parts = [];
  if (r.risk_flags && r.risk_flags.length) {
    parts.push(r.risk_flags.map((f) =>
      `<span class="badge risk-flag" title="${escapeHtml(f.label)}">${escapeHtml(f.label)}</span>`
    ).join(' '));
  } else if (r.risk_checked) {
    parts.push('<span class="no-level">No attendance/KIS signals</span>');
  } else {
    parts.push('<span class="no-level">Not enough data yet</span>');
  }
  return parts.join(' ');
}

// Aug 25 follow-up (Nina: "i need to show historical data so the past 4
// months") -- how urgent this absence is right now, distinct from "Absent
// since" (when it was reported). See the months_absent/absent_bucket
// comment on listAbsentStudents in server.js for how these are computed --
// always against today's active month, not whichever historical `month`
// the toolbar above is filtered to.
function fmtAbsentBucket(r) {
  if (r.absent_bucket === 'unknown' || r.months_absent === null) {
    return '<span class="no-level">Unknown</span>';
  }
  if (r.months_absent === 0) return '<span class="badge badge-duration">This month</span>';
  if (r.absent_bucket === 'outside') {
    return `<span class="badge risk-flag" title="Past the 4-month re-registration window">${r.months_absent} months — outside window</span>`;
  }
  if (r.months_absent === 4) {
    return `<span class="badge badge-duration-warn" title="Last month before the re-registration fee applies">4 months — final window</span>`;
  }
  return `<span class="badge badge-duration-mid">${r.months_absent} month${r.months_absent === 1 ? '' : 's'}</span>`;
}

// Client-side tally from the rows already fetched for the table -- same
// pattern as the Payments tab's renderPaymentSummary. If the duration
// filter above has already narrowed the table to one bucket, the strip
// reflects that narrowed set too (matches existing Payments-tab behavior,
// not a bug -- the strip always describes what's actually in the table).
function renderAbsentBucketSummary(rows) {
  const counts = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, outside: 0, unknown: 0 };
  for (const r of rows) counts[r.absent_bucket] = (counts[r.absent_bucket] || 0) + 1;
  const order = [
    ['0', 'This month'], ['1', '1 month'], ['2', '2 months'], ['3', '3 months'],
    ['4', '4 months (final window)'], ['outside', 'Outside window'],
  ];
  if (counts.unknown) order.push(['unknown', 'Unknown']);
  el('absentBucketSummary').innerHTML = order.map(([key, label]) => `
    <div class="summary-card absent-bucket-${key}">
      <div class="summary-count">${counts[key] || 0}</div>
      <div class="summary-label">${label}</div>
    </div>
  `).join('');
}

async function loadAbsentTable() {
  const tbody = el('absentTableBody');
  tbody.innerHTML = '<tr><td colspan="9" class="loading">Loading…</td></tr>';
  const rows = await api('/api/absent?' + currentAbsentFilters().toString());
  state.absentRows = rows;
  el('absentResultCount').textContent = `${rows.length} student${rows.length === 1 ? '' : 's'}`;

  const monthVal = el('absentMonthFilter').value;
  el('absentMonthLabel').textContent = monthVal === 'all'
    ? 'All absent students'
    : `Absent for the month of ${monthVal ? fmtMonth(monthVal) : (state.activeMonth ? state.activeMonth.label : '')}`;

  renderAbsentBucketSummary(rows);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">No matching students.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td><div class="student-name">${escapeHtml(r.last_name)}, ${escapeHtml(r.first_name)}</div></td>
      <td class="student-grade">${escapeHtml(r.grade || '—')}</td>
      <td>${fmtSubjectIcons(r.subjects)}</td>
      <td>${escapeHtml(r.teacher_label)}</td>
      <td>${escapeHtml(r.absent_reported_date || '—')}</td>
      <td>${fmtAbsentBucket(r)}</td>
      <td class="risk-signals-cell">${fmtRiskSignals(r)}</td>
      <td>${r.absent_source_note ? escapeHtml(r.absent_source_note) : '<span class="no-level">—</span>'}</td>
      <td><button type="button" class="row-edit-btn" data-absent-edit="${i}">Edit</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-absent-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openAbsentEditPanel(rows[Number(btn.dataset.absentEdit)]));
  });
}

async function loadAbsent() {
  await loadAbsentMonths();
  loadAbsentTable();
}

// The Absent tab's rows are one-per-student (subjects are already Absent
// history, so there's no single "the" enrollment the way Roster/Payments
// have one) -- fetch that student's enrollments and reuse the very first
// one just to open the shared panel; every field the panel needs beyond
// that (roster_status, the retention section) comes off the student record,
// not the particular enrollment chosen.
async function openAbsentEditPanel(absentRow) {
  try {
    const enrollments = await api(`/api/enrollments?studentId=${absentRow.student_id}`);
    if (!enrollments.length) {
      alert(`${absentRow.last_name}, ${absentRow.first_name} has no enrollment records to open.`);
      return;
    }
    // listEnrollments doesn't compute risk flags (that's specific to the
    // Absent list query) -- carry them over from the row already fetched
    // for this tab rather than adding a second endpoint just for this.
    openEditPanel({
      ...enrollments[0],
      risk_flags: absentRow.risk_flags,
      risk_checked: absentRow.risk_checked,
      worksheets_tracked: absentRow.worksheets_tracked,
    });
  } catch (e) {
    alert('Could not open: ' + e.message);
  }
}

// ---- bulk SOA / paid marking (Aug 19) ------------------------------------
// Deliberately narrow: one action, one date, applied to whichever rows are
// checked -- matches how SOAs actually go out (one message to a whole group
// chat), not a general bulk-edit tool. Reuses the same undo mechanism as
// every other edit surface: the server bundles every affected row into one
// combined last_undo entry, so a single Undo click reverses the whole batch.

function clearPaymentSelection() {
  state.payments.selection.clear();
  el('paySelectAllCheckbox').checked = false;
  updatePayBulkBar();
}

function setPaymentSelected(studentId, checked) {
  if (checked) state.payments.selection.add(studentId);
  else state.payments.selection.delete(studentId);
  const rows = state.payments.rows || [];
  el('paySelectAllCheckbox').checked = rows.length > 0 && rows.every((r) => state.payments.selection.has(r.student_id));
  updatePayBulkBar();
}

function toggleSelectAllPayments(checked) {
  const rows = state.payments.rows || [];
  for (const r of rows) {
    if (checked) state.payments.selection.add(r.student_id);
    else state.payments.selection.delete(r.student_id);
  }
  el('paymentsTableBody').querySelectorAll('[data-pay-select]').forEach((cb) => { cb.checked = checked; });
  updatePayBulkBar();
}

function todayDateInputValue() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function updatePayBulkBar() {
  const count = state.payments.selection.size;
  const bar = el('payBulkBar');
  bar.classList.toggle('hidden', count === 0);
  if (count > 0) {
    el('payBulkCount').textContent = `${count} student${count === 1 ? '' : 's'} selected`;
    if (!el('payBulkDate').value) el('payBulkDate').value = todayDateInputValue();
  }
}

async function applyBulkPayment() {
  const studentIds = [...state.payments.selection];
  if (!studentIds.length) return;
  const action = el('payBulkAction').value;
  const date = el('payBulkDate').value;
  const actionLabels = {
    soa1: 'SOA1 sent', soa2: 'SOA2 sent', soa3: 'SOA3 sent', soa4: 'SOA4 sent', paid: 'paid',
  };
  if (!date) { alert('Pick a date first.'); return; }
  const monthVal = el('payMonthFilter').value;
  const monthLabelText = monthVal ? fmtMonth(monthVal) : (state.activeMonth ? state.activeMonth.label : 'the current month');
  const ok = confirm(
    `Mark ${actionLabels[action]} (${date}) for ${studentIds.length} student${studentIds.length === 1 ? '' : 's'} ` +
    `in ${monthLabelText}?\n\nThis is covered by Undo, same as any other edit.`
  );
  if (!ok) return;
  const btn = el('payBulkApplyBtn');
  btn.disabled = true;
  try {
    await api('/api/payments/bulk', {
      method: 'POST',
      body: JSON.stringify({ studentIds, action, date, month: monthVal || undefined }),
    });
    loadPaymentsTable();
    if (!el('comebackSection').classList.contains('hidden')) loadComebackList();
    if (!el('view-roster').classList.contains('hidden')) loadTable();
    refreshUndoButton();
  } catch (e) {
    alert('Could not apply: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

// ---- come-back list (4-month re-registration-fee-free window) -----------

function toggleComebackList() {
  const section = el('comebackSection');
  section.classList.toggle('hidden');
  const visible = !section.classList.contains('hidden');
  el('payComebackToggle').textContent = visible ? 'Hide come-back list' : 'Show come-back list';
  if (visible) loadComebackList();
}

function comebackRow(s, extra) {
  return `
    <div class="not-arrived-item">
      <span class="not-arrived-name">${escapeHtml(s.last_name)}, ${escapeHtml(s.first_name)}</span>
      <span class="not-arrived-meta">${escapeHtml(s.grade || '—')}${extra ? ` · ${extra}` : ''}</span>
    </div>
  `;
}

async function loadComebackList() {
  const container = el('comebackList');
  container.innerHTML = '<p class="cal-empty">Loading…</p>';
  const data = await api('/api/payments/comeback-list');
  const sections = [];
  if (data.comeback.length) {
    sections.push(`
      <div class="not-arrived-group">
        <div class="not-arrived-teacher">Within window (1–4 months) — ${data.comeback.length}</div>
        ${data.comeback.map((s) => comebackRow(s, `${s.months_absent} month${s.months_absent === 1 ? '' : 's'} since last payment (${fmtMonth(s.last_paid_month)})`)).join('')}
      </div>
    `);
  }
  if (data.pastWindow.length) {
    sections.push(`
      <div class="not-arrived-group">
        <div class="not-arrived-teacher">Past 4 months — ${data.pastWindow.length}</div>
        ${data.pastWindow.map((s) => comebackRow(s, `${s.months_absent} months since last payment (${fmtMonth(s.last_paid_month)})`)).join('')}
      </div>
    `);
  }
  if (data.noHistory.length) {
    sections.push(`
      <div class="not-arrived-group">
        <div class="not-arrived-teacher">No payment ever on record — ${data.noHistory.length}</div>
        ${data.noHistory.map((s) => comebackRow(s)).join('')}
      </div>
    `);
  }
  container.innerHTML = sections.length ? sections.join('') : '<p class="cal-empty">No students currently absent on payment.</p>';
}

// ---- editing a student's payment record for one month --------------------

// Set by openPaymentEditPanel, read by the "Mark absent" button's onclick --
// see that button's wiring below for why this is a plain variable rather
// than a data attribute (tagPaymentRowAbsent needs the full row object,
// including active_enrollments, not just the student id).
let currentPaymentEditRow = null;

function openPaymentEditPanel(row) {
  currentPaymentEditRow = row;
  el('pay_studentId').value = row.student_id;
  el('pay_month').value = row.month;
  el('paymentPanelSubtitle').textContent = `${row.last_name}, ${row.first_name} — ${fmtMonth(row.month)}`;
  // Reassigned (not addEventListener) each time the panel opens so the
  // click always targets the row currently loaded into the panel, with no
  // risk of stale listeners piling up across repeated Edit clicks.
  el('payMarkAbsentBtn').onclick = () => tagPaymentRowAbsent(currentPaymentEditRow);
  el('pay_soa1').value = row.soa1_sent_date || '';
  el('pay_soa2').value = row.soa2_sent_date || '';
  el('pay_soa3').value = row.soa3_sent_date || '';
  el('pay_soa4').value = row.soa4_sent_date || '';
  el('pay_amountPaid').value = row.amount_paid === null || row.amount_paid === undefined ? '' : row.amount_paid;
  el('pay_paidDate').value = row.paid_date || '';
  el('pay_absentDate').value = row.marked_absent_date || '';
  el('pay_notes').value = row.payment_notes || '';
  el('pay_needsAttention').checked = !!row.needs_attention;
  el('pay_needsAttentionNote').value = row.needs_attention_note || '';
  el('paymentTuitionSummary').innerHTML = fmtTuitionSummary(row);
  const reconciledNote = el('paymentReconciledNote');
  if (row.reconciled) {
    reconciledNote.textContent = row.reconciled_note;
    reconciledNote.classList.remove('hidden');
  } else {
    reconciledNote.classList.add('hidden');
  }
  el('payReceiptDropzone').className = 'receipt-dropzone';
  el('payReceiptDropzone').innerHTML = `${RECEIPT_ICON_SVG} Drop a receipt screenshot here`;
  const payGroupInfo = row.billing_group_id
    ? { billingGroupId: row.billing_group_id, billingGroupName: row.billing_group_name }
    : null;
  wireReceiptDropzone(el('payReceiptDropzone'), row.student_id, row.month,
    () => refreshEditPanelReceipts(row.student_id, row.month), payGroupInfo);
  loadReceiptsForEditPanel(row.student_id, row.month);
  el('overlay').classList.remove('hidden');
  el('paymentEditPanel').classList.remove('hidden');
}

// Read-only breakdown shown in the edit panel so a teacher/admin knows what
// number to actually type into "Amount paid" -- tuition due is auto-computed
// (grade x active subjects), never manually entered.
function fmtTuitionSummary(row) {
  if (row.tuition_flagged) {
    return `⚠ Grade not recognized ("${escapeHtml(row.grade || '—')}") — tuition couldn't be auto-calculated.` +
      (row.previous_balance ? ` Previous balance: ${fmtMoney(row.previous_balance)}.` : '') +
      ` Enter the amount paid manually.`;
  }
  const parts = [
    `Tuition due this month: ${fmtMoney(row.amount_due)} (${row.subject_count} subject${row.subject_count === 1 ? '' : 's'} × ${fmtMoney(row.tuition_rate)})`,
  ];
  if (row.previous_balance) parts.push(`Previous balance: ${fmtMoney(row.previous_balance)}`);
  if (row.advance_applied) parts.push(`Advance credit applied: ${fmtMoney(row.advance_applied)}`);
  const totalOwed = row.amount_due + row.previous_balance - row.advance_applied;
  parts.push(`Currently owed before this payment: ${fmtMoney(totalOwed)}`);
  return parts.map(escapeHtml).join(' · ');
}

function closePaymentEditPanel() {
  el('paymentEditPanel').classList.add('hidden');
  currentPaymentEditRow = null;
  hideOverlayIfAllClosed();
}

async function savePaymentEdit(ev) {
  ev.preventDefault();
  const studentId = el('pay_studentId').value;
  const body = {
    month: el('pay_month').value,
    soa1SentDate: el('pay_soa1').value || null,
    soa2SentDate: el('pay_soa2').value || null,
    soa3SentDate: el('pay_soa3').value || null,
    soa4SentDate: el('pay_soa4').value || null,
    amountPaid: el('pay_amountPaid').value === '' ? null : Number(el('pay_amountPaid').value),
    paidDate: el('pay_paidDate').value || null,
    markedAbsentDate: el('pay_absentDate').value || null,
    notes: el('pay_notes').value.trim() || null,
    needsAttention: el('pay_needsAttention').checked,
    needsAttentionNote: el('pay_needsAttentionNote').value.trim() || null,
  };
  try {
    await api(`/api/payments/${studentId}`, { method: 'PUT', body: JSON.stringify(body) });
    closePaymentEditPanel();
    loadPaymentsTable();
    if (!el('comebackSection').classList.contains('hidden')) loadComebackList();
    if (!el('view-roster').classList.contains('hidden')) loadTable();
    refreshUndoButton();
  } catch (e) {
    alert('Could not save: ' + e.message);
  }
}

// ---- "Mark absent" from the Payments tab (Aug 25; moved inside the Edit
// panel Aug 27) --------------------------------------------------------
// Deliberately separate from the "Marked finally absent on" date field
// above -- that one's a billing note only (feeds the payment_status label),
// this is the real Active/Absent status that also drives the Roster and
// the Absent tab, same as the Roster edit panel's "Report absent" button.
// A Payments row can carry more than one active subject (Math + Reading),
// so this branches: exactly one active subject skips the picker entirely
// and goes straight to a confirm() dialog (fast path, matches how Roster's
// single-subject report already feels); more than one opens absentTagPanel
// so she can uncheck whichever subject is still coming. Aug 27: originally
// a one-click button directly on the Payments row; Nina felt that was too
// easy to trigger by accident, so it now lives behind the Edit panel's
// "Mark absent" button instead (payMarkAbsentBtn, wired in
// openPaymentEditPanel) -- same underlying action, just one more
// deliberate step to reach it. Both success paths below close the Edit
// panel afterward since the row's status just changed underneath it.
async function tagPaymentRowAbsent(row) {
  if (!row || !row.active_enrollments || !row.active_enrollments.length) return;
  if (row.active_enrollments.length === 1) {
    const only = row.active_enrollments[0];
    const name = `${row.last_name}, ${row.first_name}`;
    if (!confirm(`Report ${name}'s ${only.subject} enrollment as absent? This marks ${only.subject} Absent on the Roster right away. Since this is their only active subject, they'll also move to the Absent tab. You can undo this right after with the Undo button if it's a mistake.`)) {
      return;
    }
    try {
      await api(`/api/students/${row.student_id}/absent-status`, {
        method: 'PUT',
        body: JSON.stringify({ action: 'report', enrollmentIds: [only.id] }),
      });
      closePaymentEditPanel();
      loadPaymentsTable();
      if (!el('view-calendar').classList.contains('hidden')) loadCalendar();
      if (!el('view-ashr').classList.contains('hidden')) loadAshrTable();
      if (!el('view-absent').classList.contains('hidden')) loadAbsentTable();
      refreshUndoButton();
    } catch (e) {
      alert('Could not save: ' + e.message);
    }
  } else {
    openAbsentTagPanel(row);
  }
}

function openAbsentTagPanel(row) {
  el('tag_studentId').value = row.student_id;
  el('absentTagSubtitle').textContent = `${row.last_name}, ${row.first_name} — ${fmtMonth(row.month)}`;
  el('absentTagSubjectList').innerHTML = row.active_enrollments.map((e) => `
    <label class="checkbox-label">
      <input type="checkbox" class="tag-subject-checkbox" value="${e.id}" checked />
      ${escapeHtml(e.subject)}
    </label>
  `).join('');
  el('overlay').classList.remove('hidden');
  el('absentTagPanel').classList.remove('hidden');
}

function closeAbsentTagPanel() {
  el('absentTagPanel').classList.add('hidden');
  hideOverlayIfAllClosed();
}

async function confirmAbsentTag(ev) {
  ev.preventDefault();
  const studentId = el('tag_studentId').value;
  const ids = [...document.querySelectorAll('.tag-subject-checkbox:checked')].map((cb) => Number(cb.value));
  if (!ids.length) {
    alert('Select at least one subject to report absent, or Cancel.');
    return;
  }
  try {
    await api(`/api/students/${studentId}/absent-status`, {
      method: 'PUT',
      body: JSON.stringify({ action: 'report', enrollmentIds: ids }),
    });
    closeAbsentTagPanel();
    // Also close the Payment Edit panel this picker was opened from (Aug
    // 27) -- the underlying row's status just changed, so leaving it open
    // would show stale data. Cancel, above via closeAbsentTagPanel alone,
    // deliberately leaves the Edit panel open instead.
    closePaymentEditPanel();
    loadPaymentsTable();
    if (!el('view-calendar').classList.contains('hidden')) loadCalendar();
    if (!el('view-ashr').classList.contains('hidden')) loadAshrTable();
    if (!el('view-absent').classList.contains('hidden')) loadAbsentTable();
    refreshUndoButton();
  } catch (e) {
    alert('Could not save: ' + e.message);
  }
}

// ---- Billing Groups tab (Aug 25 follow-up, roadmap Phase 4) --------------
// Rendered as one card per group -- deliberately not a flat table like
// every other tab, since a group's member list IS the point here, not a
// row property. Current-state only, no month-by-month history (see
// server.js/lib/db.js for why that's a separate, later item).

// Multi-select add-member state (Aug 25, same-day follow-up: Nina asked
// for the add box to be multiselect so staff don't have to reopen/re-
// search the dropdown for every single student). Keyed by group id
// (string) so it survives a full tab re-render -- e.g. removing a member
// from group A shouldn't wipe an in-progress multi-pick on group B.
// billingGroupPendingAdds: groupId -> Map<studentId, {last_name, first_name}>
// billingGroupLastResults: groupId -> the most recent search result array,
//   so a keyboard Enter or a checkbox click can look up a student's name
//   without a second network round-trip.
const billingGroupPendingAdds = {};
const billingGroupLastResults = {};

function getBillingGroupPending(groupId) {
  const key = String(groupId);
  return billingGroupPendingAdds[key] || (billingGroupPendingAdds[key] = new Map());
}

async function loadBillingGroupsTab() {
  const container = el('billingGroupsList');
  container.innerHTML = '<p class="cal-empty">Loading…</p>';
  const groups = await loadBillingGroupsIntoState();
  el('billingGroupsResultCount').textContent = `${groups.length} group${groups.length === 1 ? '' : 's'}`;

  if (!groups.length) {
    container.innerHTML = '<p class="cal-empty">No billing groups yet -- create one to get started.</p>';
    return;
  }

  container.innerHTML = groups.map((g, i) => `
    <div class="billing-group-card">
      <div class="billing-group-header">
        <div>
          <div class="billing-group-name">${escapeHtml(g.name)}</div>
          ${g.notes ? `<div class="billing-group-notes">${escapeHtml(g.notes)}</div>` : ''}
        </div>
        <div class="billing-group-header-right">
          <div class="billing-group-total">
            ${g.members.length ? fmtMoney(g.total_amount_due) + '/mo' : '<span class="no-level">—</span>'}
            ${g.total_flagged_count ? `<span class="no-level">(${g.total_flagged_count} unresolved)</span>` : ''}
          </div>
          <div class="billing-group-actions">
            <button type="button" class="row-edit-btn" data-bg-edit="${i}">Edit</button>
            <button type="button" class="row-edit-btn row-danger-link" data-bg-delete="${i}">Delete</button>
          </div>
        </div>
      </div>
      <div class="billing-group-members">
        ${g.members.length ? g.members.map((m) => `
          <div class="billing-group-member">
            <span class="billing-group-member-name">
              ${escapeHtml(m.last_name)}, ${escapeHtml(m.first_name)}
              <span class="no-level">${escapeHtml(m.grade || '—')}</span>
              ${fmtSubjectIcons(m.subjects)}
            </span>
            <span class="billing-group-member-amount">${m.subjects.length ? fmtMoney(m.amount_due) : '<span class="no-level">—</span>'}</span>
            <button type="button" class="link-btn" data-bg-remove="${m.student_id}">Remove</button>
          </div>
        `).join('') : '<p class="cal-empty">No students in this group yet.</p>'}
      </div>
      <div class="billing-group-add">
        <input type="search" class="input" placeholder="Add students by name…" data-bg-add-input="${g.id}" autocomplete="off" />
        <div class="billing-group-add-pending" data-bg-add-pending="${g.id}"></div>
        <div class="billing-group-add-results" data-bg-add-results="${g.id}"></div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-bg-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openBillingGroupEditPanel(groups[Number(btn.dataset.bgEdit)]));
  });
  container.querySelectorAll('[data-bg-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteBillingGroup(groups[Number(btn.dataset.bgDelete)]));
  });
  container.querySelectorAll('[data-bg-remove]').forEach((btn) => {
    btn.addEventListener('click', () => removeBillingGroupMember(Number(btn.dataset.bgRemove)));
  });
  container.querySelectorAll('[data-bg-add-input]').forEach((input) => {
    input.addEventListener('input', debounce(() => searchBillingGroupAddCandidates(input), 250));
    input.addEventListener('keydown', (e) => handleBillingGroupAddKeydown(e, input));
    renderBillingGroupPending(input.dataset.bgAddInput, input);
  });
}

// Dropdown-style multi-select combobox for adding members: type to search,
// results appear as a floating dropdown (styles.css
// .billing-group-add-results), navigable with the arrow keys/Enter/Escape.
// Clicking (or Enter-selecting) a result toggles it into the pending
// selection shown as chips above the dropdown, rather than adding it
// immediately -- lets staff pick several students from one or more
// searches before committing them all in a single "Add N" action.
async function searchBillingGroupAddCandidates(input) {
  const groupId = input.dataset.bgAddInput;
  const resultsEl = document.querySelector(`[data-bg-add-results="${groupId}"]`);
  const q = input.value.trim();
  if (!q) {
    resultsEl.innerHTML = '';
    resultsEl.dataset.activeIndex = '-1';
    billingGroupLastResults[groupId] = [];
    return;
  }
  const results = await api('/api/billing-groups/search-students?q=' + encodeURIComponent(q));
  billingGroupLastResults[groupId] = results;
  resultsEl.dataset.activeIndex = '-1';
  if (!results.length) {
    resultsEl.innerHTML = '<p class="no-level">No matching students (already-grouped and Absent students don’t show up here).</p>';
    return;
  }
  const pending = getBillingGroupPending(groupId);
  resultsEl.innerHTML = results.map((s, idx) => `
    <button type="button" class="billing-group-add-result${pending.has(s.student_id) ? ' is-selected' : ''}" data-bg-add-pick="${s.student_id}" data-idx="${idx}">
      <span class="bg-add-checkbox" aria-hidden="true"></span>
      ${escapeHtml(s.last_name)}, ${escapeHtml(s.first_name)} <span class="no-level">${escapeHtml(s.grade || '—')}</span>
    </button>
  `).join('');
  resultsEl.querySelectorAll('[data-bg-add-pick]').forEach((btn) => {
    btn.addEventListener('click', () => toggleBillingGroupAddSelection(groupId, Number(btn.dataset.bgAddPick), input));
  });
}

// Toggles one candidate in/out of the pending selection and refreshes both
// the checkbox state in the open dropdown and the chip row above it --
// no network round-trip needed since the candidate's name is already in
// billingGroupLastResults from the search that produced it.
function toggleBillingGroupAddSelection(groupId, studentId, input) {
  const pending = getBillingGroupPending(groupId);
  if (pending.has(studentId)) {
    pending.delete(studentId);
  } else {
    const record = (billingGroupLastResults[groupId] || []).find((s) => s.student_id === studentId);
    if (record) pending.set(studentId, { last_name: record.last_name, first_name: record.first_name });
  }
  const resultsEl = document.querySelector(`[data-bg-add-results="${groupId}"]`);
  if (resultsEl) {
    resultsEl.querySelectorAll('[data-bg-add-pick]').forEach((b) => {
      b.classList.toggle('is-selected', pending.has(Number(b.dataset.bgAddPick)));
    });
  }
  renderBillingGroupPending(groupId, input);
}

// Renders the "N selected" chip row + Add button above the dropdown.
// Persists across a full tab reload (the Map lives outside this function),
// so it's re-called once per card right after loadBillingGroupsTab
// rebuilds the DOM to restore any in-progress multi-pick.
function renderBillingGroupPending(groupId, input) {
  const pendingEl = document.querySelector(`[data-bg-add-pending="${groupId}"]`);
  if (!pendingEl) return;
  const pending = getBillingGroupPending(groupId);
  if (!pending.size) { pendingEl.innerHTML = ''; return; }
  const chips = [...pending.entries()].map(([sid, s]) => `
    <span class="bg-add-chip">${escapeHtml(s.first_name)}
      <button type="button" class="bg-add-chip-remove" data-bg-add-unselect="${sid}" aria-label="Remove ${escapeHtml(s.first_name)} from selection">×</button>
    </span>
  `).join('');
  pendingEl.innerHTML = `${chips}<button type="button" class="btn btn-small btn-primary" data-bg-add-commit>Add ${pending.size}</button>`;
  pendingEl.querySelectorAll('[data-bg-add-unselect]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pending.delete(Number(btn.dataset.bgAddUnselect));
      const resultsEl = document.querySelector(`[data-bg-add-results="${groupId}"]`);
      if (resultsEl) {
        resultsEl.querySelectorAll('[data-bg-add-pick]').forEach((b) => {
          b.classList.toggle('is-selected', pending.has(Number(b.dataset.bgAddPick)));
        });
      }
      renderBillingGroupPending(groupId, input);
    });
  });
  const commitBtn = pendingEl.querySelector('[data-bg-add-commit]');
  if (commitBtn) commitBtn.addEventListener('click', () => commitBillingGroupAdds(groupId, input));
}

function handleBillingGroupAddKeydown(e, input) {
  const groupId = input.dataset.bgAddInput;
  const resultsEl = document.querySelector(`[data-bg-add-results="${groupId}"]`);
  if (e.key === 'Escape') {
    input.value = '';
    resultsEl.innerHTML = '';
    resultsEl.dataset.activeIndex = '-1';
    getBillingGroupPending(groupId).clear();
    renderBillingGroupPending(groupId, input);
    input.blur();
    return;
  }
  const buttons = Array.from(resultsEl.querySelectorAll('[data-bg-add-pick]'));
  let idx = Number(resultsEl.dataset.activeIndex ?? '-1');
  if (e.key === 'ArrowDown' && buttons.length) {
    e.preventDefault();
    idx = Math.min(idx + 1, buttons.length - 1);
    setActiveBillingGroupResult(buttons, idx, resultsEl);
  } else if (e.key === 'ArrowUp' && buttons.length) {
    e.preventDefault();
    idx = Math.max(idx - 1, 0);
    setActiveBillingGroupResult(buttons, idx, resultsEl);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const pending = getBillingGroupPending(groupId);
    // Folding the highlighted (or sole) candidate into the pending
    // selection first means a pure keyboard flow -- type, arrow down,
    // Enter -- still adds in one keystroke exactly like before multi-
    // select existed, while an in-progress multi-pick just keeps growing.
    const target = idx >= 0 ? buttons[idx] : (buttons.length === 1 ? buttons[0] : null);
    if (target) toggleBillingGroupAddSelection(groupId, Number(target.dataset.bgAddPick), input);
    if (pending.size) commitBillingGroupAdds(groupId, input);
  }
}

function setActiveBillingGroupResult(buttons, idx, resultsEl) {
  buttons.forEach((b, i) => b.classList.toggle('is-active', i === idx));
  resultsEl.dataset.activeIndex = String(idx);
  if (buttons[idx]) buttons[idx].scrollIntoView({ block: 'nearest' });
}

async function commitBillingGroupAdds(groupId, input) {
  const pending = getBillingGroupPending(groupId);
  if (!pending.size) return;
  try {
    await api(`/api/billing-groups/${groupId}/members`, {
      method: 'PUT',
      body: JSON.stringify({ studentIds: [...pending.keys()] }),
    });
    pending.clear();
    delete billingGroupLastResults[groupId];
    if (input) input.value = '';
    const resultsEl = document.querySelector(`[data-bg-add-results="${groupId}"]`);
    if (resultsEl) { resultsEl.innerHTML = ''; resultsEl.dataset.activeIndex = '-1'; }
    loadBillingGroupsTab();
    if (!el('view-roster').classList.contains('hidden')) loadTable();
    if (!el('view-payments').classList.contains('hidden')) loadPaymentsTable();
    refreshUndoButton();
  } catch (e) {
    alert('Could not add: ' + e.message);
  }
}

async function removeBillingGroupMember(studentId) {
  try {
    await api(`/api/students/${studentId}/billing-group`, { method: 'PUT', body: JSON.stringify({ groupId: null }) });
    loadBillingGroupsTab();
    if (!el('view-roster').classList.contains('hidden')) loadTable();
    if (!el('view-payments').classList.contains('hidden')) loadPaymentsTable();
    refreshUndoButton();
  } catch (e) {
    alert('Could not remove: ' + e.message);
  }
}

async function deleteBillingGroup(group) {
  const memberNote = group.members.length
    ? ` Its ${group.members.length} student${group.members.length === 1 ? '' : 's'} will go back to individual billing, not get deleted.`
    : '';
  if (!confirm(`Delete billing group "${group.name}"?${memberNote} You can undo this right after with the Undo button if it's a mistake.`)) {
    return;
  }
  try {
    await api(`/api/billing-groups/${group.id}`, { method: 'DELETE' });
    loadBillingGroupsTab();
    refreshUndoButton();
  } catch (e) {
    alert('Could not delete: ' + e.message);
  }
}

function openBillingGroupEditPanel(group) {
  el('billingGroupPanelTitle').textContent = group ? 'Edit billing group' : 'New billing group';
  el('bg_id').value = group ? group.id : '';
  el('bg_name').value = group ? group.name : '';
  el('bg_notes').value = group ? (group.notes || '') : '';
  el('overlay').classList.remove('hidden');
  el('billingGroupEditPanel').classList.remove('hidden');
}

function closeBillingGroupEditPanel() {
  el('billingGroupEditPanel').classList.add('hidden');
  hideOverlayIfAllClosed();
}

async function saveBillingGroupEdit(ev) {
  ev.preventDefault();
  const id = el('bg_id').value;
  const name = el('bg_name').value.trim();
  const notes = el('bg_notes').value.trim() || null;
  if (!name) { alert('Name is required.'); return; }
  try {
    if (id) {
      await api(`/api/billing-groups/${id}`, { method: 'PUT', body: JSON.stringify({ name, notes }) });
    } else {
      await api('/api/billing-groups', { method: 'POST', body: JSON.stringify({ name, notes }) });
    }
    closeBillingGroupEditPanel();
    loadBillingGroupsTab();
    refreshUndoButton();
  } catch (e) {
    alert('Could not save: ' + e.message);
  }
}

// ---- SOA (Combined Family Statement of Account, Phase 5) ----------------
// Originally a dedicated "SOA" tab (pick a billing group + month, view an
// on-screen HTML statement, download it as a PNG). Nina asked to delete
// that tab (Aug 27) now that the Payments tab's per-row "⬇ SOA" button
// covers the same need in fewer clicks. The tab's own picker UI
// (loadSoaTab/loadSoaStatement) and its on-screen HTML renderer
// (soaMemberLine/renderSoaStatementHtml, which had no other caller) are
// gone with it; only the canvas-based PNG export below survives, since
// that's the part downloadPaymentRowSoa (further down) still needs.
// Computed live from the exact same per-student payment math the Payments
// tab uses (server.js's computePaymentSummary via
// getStudentSoa/getBillingGroupSoa), so a downloaded statement can never
// disagree with a member's own Payments row. Deliberately read-only: no
// payment is recorded here, no "sent/downloaded" status is tracked (per
// Nina's Aug 25 scoping answers) -- just a PNG export of a live view.

// PNG export -- drawn by hand onto a <canvas> from the same SOA data the
// on-screen view renders from (never a screenshot of the DOM), so this
// stays a zero-dependency export exactly like the rest of the app (no
// npm packages anywhere in this codebase). Downloaded via a throwaway
// object URL + <a download>, entirely client-side.
// Draws the full statement onto ctx and returns the final y position --
// called twice (see renderAndDownloadSoaPng below): once against a
// generously-tall scratch canvas purely to measure how much height the
// real content needs (member count and the optional extra lines per member
// make this hard to predict up front), then again against a canvas sized
// exactly to that measurement. Avoids guessing a fixed height that either
// clips content or (as an earlier version of this did) leaves a large
// blank gap at the bottom of the downloaded image.
// Aug 27, same-day follow-up -- Nina sent the center's actual paper SOA
// template (navy-blue header, bold white/yellow text) plus a couple of
// dashboard screenshots and asked for "something easy to understand with
// bolder texts but still following the Kumon branding." Redesigned around
// that paper template: a navy header/footer bookending a clean white body,
// bold pill-shaped status badges per member instead of plain colored text,
// a large gold "grand total" line for the same at-a-glance emphasis the
// dashboard references used for their big total numbers, and Math/Reading
// color-coded the same blue/red used everywhere else in the app (subject
// icons, calendar chips) -- a detail lifted straight from the paper
// template's own blue-Math/red-Reading legend. Purely visual: still the
// exact same live data (computePaymentSummary via getStudentSoa /
// getBillingGroupSoa), same two-pass measure-then-draw mechanism below.

// Small manual roundRect -- avoids depending on ctx.roundRect (only
// reliably available in quite recent browsers), consistent with this
// app's zero-dependency, don't-assume-bleeding-edge approach elsewhere.
function fillRoundedRect(ctx, x, y, w, h, r, color) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// A small bold status pill (SETTLED / DUE ₱x / CREDIT ₱x), right-edge
// aligned at rightX, auto-sized to its text -- the "easy to understand at
// a glance" upgrade over the old plain colored text.
function drawStatusPill(ctx, text, rightX, baselineY, bgColor) {
  const padX = 12;
  const h = 24;
  ctx.font = 'bold 13px Arial, sans-serif';
  const w = ctx.measureText(text).width + padX * 2;
  fillRoundedRect(ctx, rightX - w, baselineY - h + 6, w, h, h / 2, bgColor);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(text, rightX - w / 2, baselineY);
}

// Draws a subject list left-to-right starting at x, coloring "Math" blue
// and "Reading" red -- the exact same #0b6fa8/#b3261e used by every
// subject icon/chip elsewhere in the app (styles.css .subject-icon.math /
// .reading), so a printed statement's subject labels read consistently
// with the rest of the app, and match the paper template's own
// blue-Math/red-Reading legend.
function drawColoredSubjects(ctx, subjects, x, y) {
  let cx = x;
  ctx.textAlign = 'left';
  ctx.font = 'bold 16px Arial, sans-serif';
  const list = subjects.length ? subjects : ['—'];
  list.forEach((s, i) => {
    ctx.fillStyle = /math/i.test(s) ? '#0b6fa8' : /read/i.test(s) ? '#b3261e' : '#111827';
    ctx.fillText(s, cx, y);
    cx += ctx.measureText(s).width;
    if (i < list.length - 1) {
      ctx.fillStyle = '#374151';
      ctx.fillText(' + ', cx, y);
      cx += ctx.measureText(' + ').width;
    }
  });
  return cx;
}

// Aug 27, same-day follow-up: Nina compared the baby-blue pass above
// against the original navy/gold pass and asked to go back to the
// navy/gold look, just with bigger font sizes throughout. Restored the
// navy header/footer + gold grand-total palette (matching the paper
// template) and scaled up every font size + the layout spacing that goes
// with it, so nothing overlaps at the larger sizes. Data/mechanics
// unchanged -- same two-pass measure-then-draw canvas render.
const SOA_NAVY = '#15205c';
const SOA_GOLD = '#ffcb3d';
const SOA_NAVY_MUTED = '#9fb3d9';

function drawSoaContent(ctx, data, width) {
  const marginX = 56;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, 10000);

  // ---- Navy header band -- bold branded block up top, matching the
  // paper template. Every line here is a fixed size regardless of the
  // data, so the header's total height never varies -- safe to fill the
  // band first, then draw text on top of it.
  const headerHeight = 206;
  ctx.fillStyle = SOA_NAVY;
  ctx.fillRect(0, 0, width, headerHeight);

  let y = 46;
  ctx.textAlign = 'center';
  ctx.font = 'bold 27px Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('KUMON ILIGAN CITY LEARNING CENTER', width / 2, y);
  y += 30;
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillStyle = SOA_NAVY_MUTED;
  ctx.fillText('S T A T E M E N T   O F   A C C O U N T', width / 2, y);
  y += 46;
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillStyle = SOA_NAVY_MUTED;
  ctx.fillText(data.scope === 'individual' ? 'BILLED TO' : 'BILLING GROUP', width / 2, y);
  y += 30;
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillStyle = SOA_GOLD;
  ctx.fillText(data.group.name.toUpperCase(), width / 2, y);
  y += 32;
  ctx.font = 'bold 17px Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(data.monthLabel, width / 2, y);

  // ---- White body: notices, then one bold "table header" row, then the
  // member list.
  y = headerHeight + 38;
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.textAlign = 'left';
  if (data.historicalCaveat) {
    ctx.fillStyle = '#b45309';
    ctx.fillText(`Figures reflect each student's current grade/subjects, not necessarily ${data.monthLabel}.`, marginX, y);
    y += 26;
  }
  if (data.totals.flaggedCount) {
    ctx.fillStyle = '#b42318';
    ctx.fillText(`${data.totals.flaggedCount} student(s) flagged for review — excluded from totals below.`, marginX, y);
    y += 26;
  }
  y += 6;

  const amountX = width - marginX - 210;
  const pillRightX = width - marginX;
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.fillStyle = '#6b7280';
  ctx.textAlign = 'left';
  ctx.fillText('STUDENT', marginX, y);
  ctx.textAlign = 'right';
  ctx.fillText('TUITION DUE', amountX, y);
  ctx.fillText('STATUS', pillRightX, y);
  y += 14;
  ctx.strokeStyle = SOA_NAVY;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(marginX, y); ctx.lineTo(width - marginX, y); ctx.stroke();
  ctx.lineWidth = 1;
  y += 30;

  for (const m of data.members) {
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillStyle = SOA_NAVY;
    ctx.textAlign = 'left';
    const nameText = `${m.last_name}, ${m.first_name}  `;
    ctx.fillText(nameText, marginX, y);
    const nameWidth = ctx.measureText(nameText).width;
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.fillText('(', marginX + nameWidth, y);
    const openParenWidth = ctx.measureText('(').width;
    const afterSubjectsX = drawColoredSubjects(ctx, m.subjects, marginX + nameWidth + openParenWidth, y);
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.fillStyle = SOA_NAVY;
    ctx.fillText(')', afterSubjectsX, y);
    ctx.font = '16px Arial, sans-serif';
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'right';
    ctx.fillText(m.tuitionFlagged ? 'needs review' : fmtMoney(m.amountDue), amountX, y);

    const pillText = m.remainingBalance > 0.005 ? `DUE · ${fmtMoney(m.remainingBalance)}`
      : m.remainingBalance < -0.005 ? `CREDIT · ${fmtMoney(-m.remainingBalance)}` : 'SETTLED';
    const pillColor = m.remainingBalance > 0.005 ? '#b42318' : m.remainingBalance < -0.005 ? '#0b6fa8' : '#6b7280';
    drawStatusPill(ctx, pillText, pillRightX, y, pillColor);

    y += 28;
    if (m.previousBalance > 0.005 || m.amountPaid > 0.005) {
      ctx.font = '13px Arial, sans-serif';
      ctx.fillStyle = '#6b7280';
      ctx.textAlign = 'left';
      const extras = [];
      if (m.previousBalance > 0.005) extras.push(`Previous balance ${fmtMoney(m.previousBalance)}`);
      if (m.amountPaid > 0.005) extras.push(`Paid this month ${fmtMoney(m.amountPaid)}`);
      ctx.fillText(extras.join('   ·   '), marginX + 12, y);
      y += 24;
    }
    y += 12;
  }

  y += 6;
  ctx.strokeStyle = '#d1d5db';
  ctx.beginPath(); ctx.moveTo(marginX, y); ctx.lineTo(width - marginX, y); ctx.stroke();
  y += 26;

  // ---- Navy totals footer, gold grand total -- same bold-and-unmissable
  // structure as the paper template's own "TOTAL AMOUNT DUE" line and the
  // header band above.
  const hasPrevBalance = data.totals.previousBalance > 0.005;
  const footerPadTop = 34;
  const lineH = 30;
  const smallLineCount = 2 + (hasPrevBalance ? 1 : 0);
  const dividerGapTop = 20;
  const dividerGapBottom = 30;
  const bigTotalH = 54;
  const footerPadBottom = 36;
  const footerHeight = footerPadTop + smallLineCount * lineH + dividerGapTop + dividerGapBottom + bigTotalH + footerPadBottom;
  const footerTop = y;
  ctx.fillStyle = SOA_NAVY;
  ctx.fillRect(0, footerTop, width, footerHeight);

  let fy = footerTop + footerPadTop + 8;
  const footerLine = (label, value) => {
    ctx.font = '16px Arial, sans-serif';
    ctx.fillStyle = SOA_NAVY_MUTED;
    ctx.textAlign = 'left';
    ctx.fillText(label, marginX, fy);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(value, width - marginX, fy);
    fy += lineH;
  };
  footerLine('Total tuition due', fmtMoney(data.totals.amountDue));
  if (hasPrevBalance) footerLine('Total previous balance', fmtMoney(data.totals.previousBalance));
  footerLine('Total paid this month', fmtMoney(data.totals.amountPaid));

  fy += dividerGapTop;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.moveTo(marginX, fy); ctx.lineTo(width - marginX, fy); ctx.stroke();
  fy += dividerGapBottom;

  const isCredit = data.totals.remainingBalance < -0.005;
  const remLabel = isCredit ? 'TOTAL CREDIT' : 'TOTAL REMAINING BALANCE';
  const remValue = isCredit ? fmtMoney(-data.totals.remainingBalance) : fmtMoney(Math.max(0, data.totals.remainingBalance));
  ctx.font = 'bold 17px Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(remLabel, marginX, fy);
  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.fillStyle = SOA_GOLD;
  ctx.textAlign = 'right';
  ctx.fillText(remValue, width - marginX, fy);

  y = footerTop + footerHeight;

  y += 26;
  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#9ca3af';
  ctx.textAlign = 'left';
  ctx.fillText(`Generated ${new Date().toLocaleString('en-PH')}`, marginX, y);
  y += 22;

  // Thin navy frame around the whole card, now that the final height is
  // known.
  ctx.strokeStyle = SOA_NAVY;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, y - 2);
  ctx.lineWidth = 1;

  return y;
}

// Used by the Payments tab's per-row "⬇ SOA" button (originally also shared
// with a dedicated SOA tab's own download button, removed Aug 27 -- see the
// note further up) -- takes the exact shape GET /api/payments/:id/soa
// returns (a "group", even when it's really a solo student -- see
// getStudentSoa() in server.js) and renders/downloads it, so a group SOA
// and an individual SOA look like the same kind of document, just with one
// row instead of several.
function renderAndDownloadSoaPng(data) {
  if (!data || !data.members.length) return;

  const width = 900;

  // Pass 1: measure. A real canvas clips fillRect/fillText to its own
  // bounds automatically, so a tall scratch canvas is a safe place to run
  // the exact same drawing code just to find out how tall the content is.
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = 10000;
  const finalY = drawSoaContent(scratch.getContext('2d'), data, width);

  // Pass 2: draw for real, at the measured height.
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = finalY + 20;
  drawSoaContent(canvas.getContext('2d'), data, width);

  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = data.group.name.replace(/[^a-z0-9]+/gi, '_');
    a.href = url;
    a.download = `SOA_${safeName}_${data.month}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, 'image/png');
}

// Payments tab: one click, no group/individual choice to make -- the
// server (getStudentSoa) already resolved that by checking whether this
// student has a billing_group_id, so this just fetches whatever it
// decided and downloads it. Uses the Payments tab's own currently-selected
// month, same as every other figure on that row.
async function downloadPaymentRowSoa(row, btn) {
  const month = el('payMonthFilter').value;
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  // innerHTML, not textContent -- the button holds the download-icon SVG
  // (Aug 27) as a child element, not just a text node, so a textContent
  // swap would silently replace the icon with plain text on restore.
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const data = await api(`/api/payments/${row.student_id}/soa?${params.toString()}`);
    renderAndDownloadSoaPng(data);
  } catch (e) {
    alert(e.message || 'Could not generate this statement.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ---- tabs ---------------------------------------------------------------

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  el('view-roster').classList.toggle('hidden', tab !== 'roster');
  el('view-calendar').classList.toggle('hidden', tab !== 'calendar');
  el('view-ashr').classList.toggle('hidden', tab !== 'ashr');
  el('view-payments').classList.toggle('hidden', tab !== 'payments');
  el('view-absent').classList.toggle('hidden', tab !== 'absent');
  el('view-billing-groups').classList.toggle('hidden', tab !== 'billing-groups');
  el('view-verification').classList.toggle('hidden', tab !== 'verification');
  if (tab === 'calendar') loadCalendar();
  if (tab === 'ashr') { loadAshrCycles().then(loadAshrTable); }
  if (tab === 'payments') { loadPayments(); }
  if (tab === 'absent') { loadAbsent(); }
  if (tab === 'billing-groups') { loadBillingGroupsTab(); }
  if (tab === 'verification') { loadVerificationQueue(); }
}

// ---- wire up ----------------------------------------------------------

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---- undo last edit (Aug 19) ---------------------------------------------
// One level only, by design (Nina asked for a simple Ctrl-Z-style safety
// net, not a full history tab) -- see server.js/lib/db.js for what counts
// as a covered edit. The button in the top bar shows what it would undo, so
// it's never a mystery action; Ctrl+Z is a shortcut for the same thing.

async function refreshUndoButton() {
  const btn = el('undoBtn');
  try {
    const status = await api('/api/undo');
    if (status.available) {
      btn.textContent = `↩ Undo: ${status.description}`;
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  } catch (e) {
    // Non-critical -- leave the button as it was rather than surface this.
  }
}

async function doUndo() {
  const btn = el('undoBtn');
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const result = await api('/api/undo', { method: 'POST' });
    if (result.ok) {
      // Refresh whatever's currently visible rather than guessing which one
      // view needs it -- cheap, and keeps this correct as new undo-covered
      // actions get added later.
      loadTable();
      if (!el('view-calendar').classList.contains('hidden')) loadCalendar();
      if (!el('view-ashr').classList.contains('hidden')) loadAshrTable();
      if (!el('view-payments').classList.contains('hidden')) loadPaymentsTable();
      if (!el('view-absent').classList.contains('hidden')) loadAbsentTable();
      if (!el('view-billing-groups').classList.contains('hidden')) loadBillingGroupsTab();
      if (!el('view-verification').classList.contains('hidden')) loadVerificationQueue();
      if (!el('editPanel').classList.contains('hidden')) {
        loadProgressHistory(el('f_studentId').value);
      }
      if (!el('paymentEditPanel').classList.contains('hidden') && currentPaymentEditRow) {
        refreshEditPanelReceipts(currentPaymentEditRow.student_id, currentPaymentEditRow.month);
      }
    }
  } finally {
    btn.disabled = false;
    refreshUndoButton();
  }
}

// Only fires when focus isn't in a text field, so it doesn't fight with the
// browser's own native undo while someone's mid-typing in an input.
function handleGlobalKeydown(ev) {
  const isUndoCombo = (ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z';
  if (!isUndoCombo) return;
  const active = document.activeElement;
  const tag = active ? active.tagName : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (active && active.isContentEditable)) return;
  if (el('undoBtn').classList.contains('hidden')) return;
  ev.preventDefault();
  doUndo();
}

async function init() {
  await loadFilters();
  await loadTable();

  el('searchInput').addEventListener('input', debounce(loadTable, 200));
  el('subjectFilter').addEventListener('change', loadTable);
  el('teacherFilter').addEventListener('change', () => { el('groupFilter').value = ''; loadTable(); });
  el('groupFilter').addEventListener('change', () => { el('teacherFilter').value = ''; loadTable(); });
  el('dayFilter').addEventListener('change', () => { updateMoreFiltersLabel(); loadTable(); });
  el('timeFilter').addEventListener('change', () => { updateMoreFiltersLabel(); loadTable(); });
  el('statusFilter').addEventListener('change', () => { updateMoreFiltersLabel(); loadTable(); });
  el('monthFilter').addEventListener('change', onMonthFilterChange);
  el('moreFiltersToggle').addEventListener('click', toggleMoreFilters);
  updateMoreFiltersLabel();

  el('calTeacherFilter').addEventListener('change', () => { el('calGroupFilter').value = ''; loadCalendar(); });
  el('calGroupFilter').addEventListener('change', () => { el('calTeacherFilter').value = ''; loadCalendar(); });
  el('calModeFilter').addEventListener('change', () => loadCalendar());

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  el('manageMonthLink').addEventListener('click', openAdminPanel);
  el('adminPanelClose').addEventListener('click', closeAdminPanel);
  el('adminCloseMonthBtn').addEventListener('click', adminDoCloseMonth);
  el('adminChangePasswordBtn').addEventListener('click', adminDoChangePassword);
  el('adminLockAshrBtn').addEventListener('click', adminDoLockAshr);

  el('ashrSearchInput').addEventListener('input', debounce(loadAshrTable, 200));
  el('ashrSubjectFilter').addEventListener('change', loadAshrTable);
  el('ashrGradeFilter').addEventListener('change', loadAshrTable);
  el('ashrTeacherFilter').addEventListener('change', loadAshrTable);
  el('ashrResultFilter').addEventListener('change', loadAshrTable);
  el('ashrShowDoubleFilter').addEventListener('change', loadAshrTable);

  el('undoBtn').addEventListener('click', doUndo);
  document.addEventListener('keydown', handleGlobalKeydown);
  refreshUndoButton();

  el('addStudentBtn').addEventListener('click', () => openEditPanel(null));
  el('panelClose').addEventListener('click', closeEditPanel);
  el('cancelBtn').addEventListener('click', closeEditPanel);
  el('deleteEnrollmentBtn').addEventListener('click', deleteEnrollment);
  el('deleteStudentBtn').addEventListener('click', deleteStudent);
  el('overlay').addEventListener('click', () => {
    // Whichever modal sits on top gets closed first, rather than whatever
    // panel may be open behind it. The receipt viewer and the group-split
    // panel can both be opened from inside the payment Edit panel, so
    // they're checked first -- otherwise clicking the overlay to dismiss
    // one would also close whatever panel it was opened from underneath.
    if (!el('receiptViewerPanel').classList.contains('hidden')) {
      closeReceiptViewer();
    } else if (!el('receiptGroupSplitPanel').classList.contains('hidden')) {
      closeReceiptGroupSplitPanel();
    } else if (!el('adminPanel').classList.contains('hidden')) {
      closeAdminPanel();
    } else if (!el('historyEditPanel').classList.contains('hidden')) {
      closeHistoryEditPanel();
    } else if (!el('ashrEditPanel').classList.contains('hidden')) {
      closeAshrEditPanel();
    } else if (!el('paymentEditPanel').classList.contains('hidden')) {
      closePaymentEditPanel();
    } else if (!el('absentTagPanel').classList.contains('hidden')) {
      closeAbsentTagPanel();
    } else if (!el('billingGroupEditPanel').classList.contains('hidden')) {
      closeBillingGroupEditPanel();
    } else {
      closeEditPanel();
    }
  });
  el('editForm').addEventListener('submit', saveForm);

  el('historyPanelClose').addEventListener('click', closeHistoryEditPanel);
  el('historyCancelBtn').addEventListener('click', closeHistoryEditPanel);
  el('historyEditForm').addEventListener('submit', saveHistoryEdit);

  el('ashrPanelClose').addEventListener('click', closeAshrEditPanel);
  el('ashrCancelBtn').addEventListener('click', closeAshrEditPanel);
  el('ashrEditForm').addEventListener('submit', saveAshrEdit);

  el('paySearchInput').addEventListener('input', debounce(loadPaymentsTable, 200));
  el('payMonthFilter').addEventListener('change', loadPaymentsTable);
  el('payTeacherFilter').addEventListener('change', () => { el('payGroupFilter').value = ''; loadPaymentsTable(); });
  el('payGroupFilter').addEventListener('change', () => { el('payTeacherFilter').value = ''; loadPaymentsTable(); });
  el('payStatusFilter').addEventListener('change', loadPaymentsTable);
  el('payNeedsAttentionFilter').addEventListener('change', loadPaymentsTable);
  el('payComebackToggle').addEventListener('click', toggleComebackList);
  el('paySelectAllCheckbox').addEventListener('change', (ev) => toggleSelectAllPayments(ev.target.checked));
  el('payBulkApplyBtn').addEventListener('click', applyBulkPayment);
  el('payBulkClearBtn').addEventListener('click', clearPaymentSelection);

  el('paymentPanelClose').addEventListener('click', closePaymentEditPanel);
  el('paymentCancelBtn').addEventListener('click', closePaymentEditPanel);
  el('paymentEditForm').addEventListener('submit', savePaymentEdit);

  el('absentTagPanelClose').addEventListener('click', closeAbsentTagPanel);
  el('absentTagCancelBtn').addEventListener('click', closeAbsentTagPanel);
  el('absentTagForm').addEventListener('submit', confirmAbsentTag);

  el('newBillingGroupBtn').addEventListener('click', () => openBillingGroupEditPanel(null));
  el('billingGroupPanelClose').addEventListener('click', closeBillingGroupEditPanel);
  el('billingGroupCancelBtn').addEventListener('click', closeBillingGroupEditPanel);
  el('billingGroupEditForm').addEventListener('submit', saveBillingGroupEdit);
  // Close any open "add a student" search dropdown when clicking elsewhere
  // on the page. Deliberately does NOT clear a card's pending multi-select
  // chips -- those are a separate, persistent staging area (Escape or each
  // chip's own × clears them explicitly), so an accidental click away from
  // the dropdown never silently throws away students already picked.
  document.addEventListener('click', (e) => {
    if (e.target.closest('.billing-group-add')) return;
    document.querySelectorAll('.billing-group-add-results').forEach((r) => {
      r.innerHTML = '';
      r.dataset.activeIndex = '-1';
    });
  });

  el('absentSearchInput').addEventListener('input', debounce(loadAbsentTable, 200));
  el('absentMonthFilter').addEventListener('change', loadAbsentTable);
  el('absentTeacherFilter').addEventListener('change', loadAbsentTable);
  el('absentGradeFilter').addEventListener('change', loadAbsentTable);
  el('absentSubjectFilter').addEventListener('change', loadAbsentTable);
  el('absentBucketFilter').addEventListener('change', loadAbsentTable);
  el('reportAbsentBtn').addEventListener('click', reportAbsent);
  el('reactivateBtn').addEventListener('click', reactivateStudent);
  el('saveAbsentNoteBtn').addEventListener('click', saveAbsentNote);

  el('receiptViewerClose').addEventListener('click', closeReceiptViewer);

  el('receiptGroupSplitClose').addEventListener('click', closeReceiptGroupSplitPanel);
  el('receiptGroupSplitCancelBtn').addEventListener('click', closeReceiptGroupSplitPanel);
  el('receiptGroupSplitForm').addEventListener('submit', confirmReceiptGroupSplit);
}

init().catch((e) => {
  console.error(e);
  el('tableBody').innerHTML = `<tr><td colspan="10" class="empty">Failed to load: ${escapeHtml(e.message)}</td></tr>`;
});
