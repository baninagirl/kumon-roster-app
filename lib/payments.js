// Payments -- pure reference data + computation module, same role as
// lib/ashr.js: no database access here, just the rules for turning a raw
// payment_record row (or the absence of one) into a display-ready status,
// plus the small date-math helpers the payments feature needs. Kept
// separate from lib/db.js and server.js so the actual business rules (what
// counts as "paid", what the SOA cadence is, how a late payment reconciles
// against an earlier "absent" report) live in one place, testable on their
// own with plain function calls.

// Kumon Iligan City's monthly billing cadence, per Nina: a Statement of
// Account reminder goes out through the group chat on the 15th (SOA1), 20th
// (SOA2), and 30th (SOA4) -- the 25th is both SOA3 *and* the actual tuition
// due date.
const SOA_SEND_DAY = { 1: 15, 2: 20, 3: 25, 4: 30 };
const TUITION_DUE_DAY = 25;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dueDateForMonth(month) {
  return `${month}-${pad2(TUITION_DUE_DAY)}`;
}

function soaSendDateForMonth(month, n) {
  const day = SOA_SEND_DAY[n];
  if (!day) return null;
  return `${month}-${pad2(day)}`;
}

// Resolves one (student, month)'s payment amounts into a display status.
// Aug 20 follow-up: this used to look only at paid_date/marked_absent_date
// (a boolean-ish "has this been marked paid"). Now that real amounts exist
// (see lib/tuition.js + server.js's computePaymentSummary, which does the
// db-backed amount-due/previous-balance/advance-credit math and calls this
// with the result), status is derived from what's actually owed vs. actually
// paid -- Paid, Partially Paid, and Advance/Credit are now genuinely
// distinct, not all folded into one "paid" bucket.
//
// paidDate and absentDate are still kept as independent facts even when they
// conflict (a parent pays on the 15th of the *next* month, after the student
// was already reported "finally absent" to head office for this month): the
// `reconciled` flag surfaces that mismatch rather than silently rewriting
// whichever was reported at the time -- same behavior as before, just now
// only fires when the record actually nets out to fully paid.
function resolvePaymentStatus({ amountPaid, remainingBalance, paidDate, absentDate }) {
  const paid = amountPaid || 0;
  const reconciled = !!(paidDate && absentDate);
  const reconciledNote = reconciled ? `Paid ${paidDate} — reported absent ${absentDate}` : null;

  if (paid > 0 && remainingBalance < -0.005) {
    return { status: 'advance', label: 'Advance / Credit', reconciled, reconciledNote };
  }
  if (paid > 0 && remainingBalance <= 0.005) {
    return { status: 'paid', label: 'Paid', reconciled, reconciledNote };
  }
  if (paid > 0) {
    return { status: 'partial', label: 'Partially Paid', reconciled: false, reconciledNote: null };
  }
  if (absentDate) {
    return { status: 'absent', label: 'Absent (reported)', reconciled: false, reconciledNote: null };
  }
  return { status: 'unpaid', label: 'Unpaid', reconciled: false, reconciledNote: null };
}

// Only meaningful for a record that still has money owed -- "overdue" means
// the tuition due date (the 25th) has passed with a positive remaining
// balance, regardless of whether any SOA reminders were sent.
function isOverdue(status, remainingBalance, month, todayStr) {
  if (status === 'paid' || status === 'advance') return false;
  if (!(remainingBalance > 0)) return false;
  return todayStr > dueDateForMonth(month);
}

// Whole-month difference, toMonth minus fromMonth, both 'YYYY-MM'. Positive
// means toMonth is later. Used to compute how many months a student has
// gone without a recorded payment.
function monthsBetween(fromMonth, toMonth) {
  const [fy, fm] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad2(nm)}`;
}

module.exports = {
  SOA_SEND_DAY,
  TUITION_DUE_DAY,
  dueDateForMonth,
  soaSendDateForMonth,
  resolvePaymentStatus,
  isOverdue,
  monthsBetween,
  addMonths,
};
