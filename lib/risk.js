// Absence risk signals (Aug 21) -- pure reference data + computation, same
// role as lib/tuition.js and lib/ashr.js: no database access here, just the
// thresholds and the rule for turning already-fetched attendance/ASHR data
// into a short list of auto-flagged warning signs. The actual queries that
// gather the raw numbers live in server.js (getRiskFlagsForStudent), same
// split as every other lib/*.js module in this app.
//
// Origin: Nina described wanting the Absent tab to show, per student,
// whether an absence looks "avoidable" (early warning signs were visible)
// or "unavoidable" -- and specifically asked for this to be "something the
// app auto-flags based on thresholds" rather than a manual judgment call.
// She named three metrics: worksheets/sets answered per month, days
// attended per month, and time-to-first-KIS-award from enrollment.
//
// Only two of the three are implemented here. Worksheets/sets completed
// per month isn't tracked anywhere in this app yet -- lib/db.js's
// monthly_progress table only has page numbers within a level, and a page
// delta isn't a safe stand-in (a "set" isn't one page, and a level-up
// resets the page number low right when a student is doing well, which
// would look like a red flag exactly when it shouldn't). That one needs a
// decision from Nina on where the number comes from before it can be
// added -- see the README/roadmap. Every result from this module also
// reports worksheetsTracked: false so callers can show that gap honestly
// rather than implying "no flags" means "no reason for concern at all."
//
// Thresholds are plain named constants, not a settings UI -- deliberately
// easy to tune by editing this file once real-world data shows whether
// they're set right, rather than over-building configurability for a v1
// nobody's validated yet.

const EXPECTED_MONTHLY_VISITS = 8; // Nina's stated expectation
const LOW_ATTENDANCE_RATIO = 0.5; // flag if attended < 50% of expected
const KIS_WINDOW_MONTHS = 6; // Nina: "KIS within six months or less"

// 'YYYY-MM-DD' -> 'YYYY-MM' of the calendar month immediately BEFORE it.
// Used to look at the last FULL month before a student was reported
// absent, rather than the report month itself (which is usually partial --
// they could have been reported absent on the 3rd of the month).
function monthBefore(dateStr) {
  const [y, m] = dateStr.slice(0, 7).split('-').map(Number);
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  return `${prevY}-${String(prevM).padStart(2, '0')}`;
}

// Adds N months to a 'YYYY-MM-DD' date string, returning a plain Date.
function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

// ASHR cycles are 'YYYY-08' or 'YYYY-02' (twice-yearly award periods,
// confirmed in lib/ashr.js) -- there's no exact award day recorded, so
// this converts a cycle to its approximate end-of-cycle date for window
// comparisons. This is a deliberate precision tradeoff: "which 6-month
// cycle" is all the data supports, not an exact day count.
function cycleToApproxDate(cycle) {
  const [y, m] = cycle.split('-');
  const day = m === '08' ? '08-31' : '02-28';
  return new Date(`${y}-${day}T00:00:00Z`);
}

function attendanceFlag(visits, month) {
  if (visits >= EXPECTED_MONTHLY_VISITS * LOW_ATTENDANCE_RATIO) return null;
  return {
    type: 'low_attendance',
    label: `Low attendance: only ${visits} of ~${EXPECTED_MONTHLY_VISITS} expected visits in ${month}`,
  };
}

// enrollments: [{ subject, dateEnrolled, firstKisCycle }] -- firstKisCycle
// is the earliest 'YYYY-MM' cycle with an ASHR result of 'KIS' for that
// subject, or null if the student has never gotten one. asOfDate is the
// date to judge "has enough time passed" against -- the student's
// absent_reported_date for a reported-absent student, so the flag reflects
// what was knowable at the time they left, not shifting later as "today"
// moves forward.
// Returns { flags, checked } -- `checked` is how many enrollments actually
// had a fair judgment made (dateEnrolled present AND the window already
// closed), regardless of whether that judgment produced a flag. Callers
// need this to tell "checked every subject, all clear" apart from
// "couldn't check anything" -- an empty flags list means something very
// different in each case, and collapsing them would misrepresent a data
// gap as a clean bill of health.
function kisTimingFlags(enrollments, asOfDate) {
  const flags = [];
  let checked = 0;
  const asOf = new Date(asOfDate + 'T00:00:00Z');
  for (const e of enrollments) {
    if (!e.dateEnrolled) continue;
    const windowEnd = addMonths(e.dateEnrolled, KIS_WINDOW_MONTHS);
    if (asOf < windowEnd) continue; // too early to judge fairly
    checked += 1;
    if (!e.firstKisCycle) {
      flags.push({
        type: 'slow_kis',
        label: `No KIS award within ${KIS_WINDOW_MONTHS} months of enrolling in ${e.subject} (enrolled ${e.dateEnrolled})`,
      });
      continue;
    }
    const kisDate = cycleToApproxDate(e.firstKisCycle);
    if (kisDate > windowEnd) {
      flags.push({
        type: 'slow_kis',
        label: `First KIS in ${e.subject} came after the ${KIS_WINDOW_MONTHS}-month window (enrolled ${e.dateEnrolled}, first KIS ${e.firstKisCycle})`,
      });
    }
  }
  return { flags, checked };
}

// visits/visitsMonth: pre-counted attendance for the month before asOfDate
// (null visitsMonth if asOfDate wasn't available, e.g. no absent_reported_date
// on record -- attendance flag is skipped in that case).
// hasAttendanceHistory: whether this student has ANY attendance row ever
// recorded (any date, not just the target month) -- see the note at the
// top of this file on why this matters: the daily "Not arrived today"
// toggle this data comes from has never actually been used in practice
// (0 rows app-wide as of Aug 21), so a 0-visit month right now almost
// always means "never logged," not "confirmed didn't show up." Without
// this guard, every absent student would get falsely flagged the moment
// this shipped. Only trust a 0-visit reading once there's at least some
// attendance history for this student to judge it against.
// enrollments/asOfDate: see kisTimingFlags above.
function computeRiskFlags({ visits, visitsMonth, hasAttendanceHistory, enrollments, asOfDate }) {
  const flags = [];
  if (visitsMonth != null && hasAttendanceHistory) {
    const af = attendanceFlag(visits, visitsMonth);
    if (af) flags.push(af);
  }
  let kisChecked = 0;
  if (asOfDate) {
    const kis = kisTimingFlags(enrollments || [], asOfDate);
    flags.push(...kis.flags);
    kisChecked = kis.checked;
  }
  // "Checked" = at least one metric actually had enough data to judge --
  // used by callers to distinguish "we looked and it's clean" from "we
  // couldn't check anything for this student yet," which an empty flags
  // list alone can't tell apart.
  const checked = !!hasAttendanceHistory || kisChecked > 0;
  return { flags, checked, worksheetsTracked: false, attendanceTracked: !!hasAttendanceHistory };
}

module.exports = {
  EXPECTED_MONTHLY_VISITS,
  LOW_ATTENDANCE_RATIO,
  KIS_WINDOW_MONTHS,
  monthBefore,
  computeRiskFlags,
};
