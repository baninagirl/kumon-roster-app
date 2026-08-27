// Tuition -- pure reference data + computation, same role as lib/ashr.js and
// lib/payments.js: no database access, just the rate table and the rule for
// turning a normalized grade + active-subject count into a monthly amount
// due. Rates and the per-subject rule are confirmed in the Aug 20 Master
// Platform Specification (Part 7 / Non-Negotiable Rules 15-17):
//   - PK1/PK2/PK3, Kindergarten, and Grades 1-6 (below Grade 7): ₱2,200 per
//     subject per month.
//   - Grade 7 through College: ₱2,350 per subject per month.
//   - Tuition is calculated per subject, not per student flat-rate.
//
// Grade strings here are whatever lib/ashr.js's normalizeGrade() already
// produces elsewhere in the app ('PK1'/'PK2'/'PK3'/'K'/'P1'..'P14'...) --
// reused rather than re-implemented, so every feature agrees on what a grade
// string means. The real roster has grades up through P14 (presumably later
// high-school/college years past the ASHR tables' own P11 ceiling) -- the
// Grade-7-and-up rate applies to all of them uniformly, since the rule is a
// single ">= Grade 7" threshold, not a bounded table.

const RATE_BELOW_GRADE_7 = 2200;
const RATE_GRADE_7_AND_UP = 2350;
const GRADE_7_THRESHOLD = 7;

// Returns the per-subject monthly rate for a normalized grade, or null if
// the grade is missing or not a recognized shape -- flagged rather than
// guessed, same as everywhere else in this app.
function ratePerSubject(normalizedGrade) {
  if (!normalizedGrade) return null;
  const g = String(normalizedGrade).trim().toUpperCase();
  if (g === 'K' || g.startsWith('PK')) return RATE_BELOW_GRADE_7;
  const m = g.match(/^P(\d+)$/);
  if (m) return parseInt(m[1], 10) >= GRADE_7_THRESHOLD ? RATE_GRADE_7_AND_UP : RATE_BELOW_GRADE_7;
  return null;
}

// Monthly tuition due for one student: rate x count of currently Active
// subject enrollments. A subjectCount of 0 is a real, confident ₱0 (a
// student with no Active subject shouldn't be billed) -- distinct from
// rate === null (grade couldn't be classified at all, amountDue is also
// null so it's never silently treated as ₱0).
function computeTuitionDue(normalizedGrade, activeSubjectCount) {
  const count = activeSubjectCount || 0;
  const rate = ratePerSubject(normalizedGrade);
  if (rate === null) {
    return { amountDue: null, rate: null, subjectCount: count, flagged: true };
  }
  return { amountDue: rate * count, rate, subjectCount: count, flagged: false };
}

module.exports = {
  RATE_BELOW_GRADE_7,
  RATE_GRADE_7_AND_UP,
  GRADE_7_THRESHOLD,
  ratePerSubject,
  computeTuitionDue,
};
