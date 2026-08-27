// Parses the messy free-text schedule fields from the source spreadsheets
// ("MON THU" / "TUE\nFRI" / "5:30 PM\n10:00 AM" / "16:00:00" / "(RI)" markers)
// into structured {day, time24, label} slots. Used once to backfill legacy
// data; going forward the UI writes structured slots directly.

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DAY_MAP = {
  MON: 'Mon', MONDAY: 'Mon',
  TUE: 'Tue', TUES: 'Tue', TUESDAY: 'Tue',
  WED: 'Wed', WEDNESDAY: 'Wed',
  TH: 'Thu', THU: 'Thu', THUR: 'Thu', THURS: 'Thu', THURSDAY: 'Thu',
  FRI: 'Fri', FRIDAY: 'Fri',
  SAT: 'Sat', SATURDAY: 'Sat',
  SUN: 'Sun', SUNDAY: 'Sun',
};

function splitLines(s) {
  return String(s || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

// Pull day tokens out of one line, e.g. "MON WED (RI) FRI" -> ['Mon','Wed','Fri']
function parseDayLine(line) {
  const cleaned = line.replace(/\([^)]*\)/g, ' '); // drop "(RI)" "(ONLINE)" etc.
  const tokens = cleaned.split(/[\s,\/]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
  const days = [];
  for (const t of tokens) {
    const key = t.replace(/[^A-Z]/g, '');
    if (DAY_MAP[key]) days.push(DAY_MAP[key]);
  }
  return days;
}

// Matches "16:00:00", "5:30 PM", "5 30 PM", "4PM", "10 AM" -- colon/space/
// nothing between hour and minutes, minutes optional when AM/PM is present.
const TIME_RE = /(\d{1,2})(?:[:\s](\d{2}))?(?::\d{2})?\s*(AM|PM|am|pm)?/;

// Extract the first clean time from a line, return 24h "HH:MM" or null.
function parseTimeLine(line) {
  const m = TIME_RE.exec(line);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] || '00';
  const ap = (m[3] || '').toUpperCase();
  if (!ap && min === '00' && !line.includes(':')) return null; // bare number, not a time
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (!ap) {
    // No AM/PM marker -- this is either a 24h "HH:MM:SS" style value pulled
    // from an Excel time-serial cell, or a bare hour typed by a teacher
    // directly into a text cell (e.g. "9:00", "1:00 / 9:00"). Either way,
    // hours 1-7 are never legitimate for this center: it doesn't open before
    // ~8 AM even on Saturdays, so a bare "1:00"-"7:59" always means the PM
    // equivalent. This also covers a real source-data pattern: teachers typed
    // a bare "1:30" (meaning 1:30 PM) straight into an Excel time cell, and
    // Excel silently defaulted the unmarked entry to AM, storing "01:30:00" --
    // that's an error made in the source spreadsheet itself, not something
    // our parsing introduces, so the same correction applies to both forms.
    // Hours 8-11 are left as typed (8-11 AM Saturday classes are common and
    // appear in the source at real volume) since AM vs PM is genuinely
    // ambiguous there.
    if (h >= 1 && h <= 7) h += 12;
  }
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${min}`;
}

/**
 * @param {string} daysRaw
 * @param {string} timeRaw
 * @returns {{ slots: {day:string, time:string|null}[], ok: boolean }}
 */
function parseSchedule(daysRaw, timeRaw) {
  // Flatten every day token mentioned, in order (handles "MON WED", "MON\nWED",
  // and "MON / WED" all the same way -- parseDayLine already splits on
  // whitespace, commas, and slashes).
  const dayTokens = splitLines(daysRaw).flatMap(parseDayLine);
  if (!dayTokens.length) return { slots: [], ok: false };

  // Flatten every time token mentioned, in order. Split on newline OR slash,
  // since teachers write both "5:30 PM\n10:00 AM" and "1:00 PM / 10:00 AM"
  // for "different time on different days".
  const timeSegments = String(timeRaw || '').split(/[\r\n/]+/).map((s) => s.trim()).filter(Boolean);
  const timeTokens = timeSegments.map(parseTimeLine);

  let times;
  if (timeTokens.length === 0) {
    times = dayTokens.map(() => null);
  } else if (timeTokens.length === 1) {
    times = dayTokens.map(() => timeTokens[0]);
  } else if (timeTokens.length === dayTokens.length) {
    times = timeTokens; // 1:1 positional pairing, e.g. Fri->5:30PM, Sat->10:00AM
  } else if (dayTokens.length === 1) {
    // one day mentioned, several time-like tokens (often a note like "5:30
    // PM RI\n6:00 PM" or a genuine alternate time) -- take the first valid
    // one rather than discarding real data.
    times = [timeTokens.find((t) => t !== null) || null];
  } else {
    // ambiguous count mismatch (e.g. 3 days, 2 times) -- don't guess which
    // day gets which time, leave for manual review instead.
    times = dayTokens.map(() => null);
  }

  const slots = dayTokens.map((day, i) => ({ day, time: times[i] }));

  // dedupe identical (day,time) pairs
  const seen = new Set();
  const deduped = slots.filter((s) => {
    const k = s.day + '|' + s.time;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const ok = deduped.length > 0 && deduped.every((s) => s.time !== null);
  return { slots: deduped, ok };
}

// RI/IC (Remote Instruction / In-Center) mode detection -- Aug 20 follow-up
// to the Master Platform Specification audit, which confirmed this really is
// recorded per scheduled day in the source data, just inconsistently across
// teachers' sheets. The source uses a few different spellings for the same
// two ideas: confirmed with Nina before building this so real per-student
// data wasn't guessed at --
//   RI-equivalent markers: "(RI)", "(ONLINE)", "(PURE ONLINE)".
//   IC-equivalent markers: "(IC)", "F2F" (not always parenthesized).
// Anything else attached to a day -- the literal ambiguous "(IC/RI)" seen in
// two rows, or the unrecognized "(CV)" seen in three -- is left unresolved
// (mode: null, flagged: true) rather than guessed either way.
const RI_MARKERS = new Set(['RI', 'ONLINE', 'PURE ONLINE']);
const IC_MARKERS = new Set(['IC', 'F2F']);

// Parses which days in a raw schedule_days cell are explicitly marked RI vs
// IC. A day mentioned with no marker attached defaults to IC, per Nina's
// confirmed direction ("where the source doesn't mark a day, it defaults to
// IC unless explicitly marked RI"). Returns [{day, mode, flagged}, ...] --
// only for day tokens this recognizes (same tokens parseDayLine would find;
// a day inside a compressed/range token this tokenizer doesn't understand,
// e.g. "MON-FRI" or "TTHF", simply won't appear here -- same limitation
// parseDayLine already has for those rare cells, not something new this
// introduces).
function parseModePerDay(daysRaw) {
  const out = [];
  for (let line of splitLines(daysRaw)) {
    // "F2F" sometimes appears bare, not wrapped in parens like every other
    // marker -- normalize it to look like one so the same split-on-marker
    // logic below handles it without a special case.
    line = line.replace(/\bF2F\b/gi, '(F2F)');
    const parts = line.split(/(\([^)]*\))/);
    let pendingText = [];
    const flush = (markerRaw) => {
      const days = parseDayLine(pendingText.join(' '));
      pendingText = [];
      if (!days.length) return;
      let mode = 'IC';
      let flagged = false;
      if (markerRaw) {
        const key = markerRaw.replace(/[()]/g, '').trim().toUpperCase();
        if (RI_MARKERS.has(key)) mode = 'RI';
        else if (IC_MARKERS.has(key)) mode = 'IC';
        else { mode = null; flagged = true; }
      }
      for (const day of days) out.push({ day, mode, flagged });
    };
    for (const part of parts) {
      if (/^\([^)]*\)$/.test(part)) flush(part);
      else pendingText.push(part);
    }
    if (pendingText.join('').trim()) flush(null); // trailing days, no marker -> default IC
  }
  return out;
}

function to12h(time24) {
  if (!time24) return null;
  const [h, m] = time24.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

function sortDays(days) {
  return [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
}

module.exports = { parseSchedule, parseModePerDay, to12h, DAY_ORDER, DAY_MAP };
