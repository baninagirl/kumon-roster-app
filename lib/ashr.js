// ASHR (Advanced Student Honor Roll) reference data and computation.
//
// Kumon evaluates ASHR twice a year -- an August cutoff and a February
// cutoff -- comparing a student's curriculum level against a published
// qualifying-level table for their school grade. Reaching a tier's
// threshold earns KIS / Bronze / Silver / Gold / ASF; reaching the *same*
// tier again next cycle doesn't earn a second certificate (shows as
// "DOUBLE AWARD" instead, per Nina and matching what the real source
// sheets already record).
//
// Both Math and Reading are computed live as of Aug 19. Reading was
// initially held back because the Gold column's cells rendered as "A1",
// "B1", "C1"... which could have meant the same thing as Silver's
// "AI"/"BI"/"CI" pattern (a font-rendering quirk) or a genuinely different
// notation -- Nina confirmed it's the same thing ("A1 and AI mean the same
// thing"), so that ambiguity is resolved: any bare digit "1"/"2"
// immediately after a level letter is shorthand for the Roman-numeral
// sub-level marker "I"/"II" (see parseReadingLevel() below), consistent
// with how the real source data itself mixes both notations for the same
// students (e.g. "D1 190" and "DI 190" both appear in the real roster).
//
// Level I is a special case: its own letter *is* the Roman-numeral-I
// marker, so a plain concatenation ("I" + "I" = "II", or "I" + "II" =
// "III") is genuinely hard to read/typeset. The February flyer resolves
// this with an explicit hyphen ("I-I 100" / "I-II 100"); this file uses
// that same hyphenated form as the canonical internal token.
//
// Two specific cells in the August Reading flyer read like typos once
// cross-checked against the very consistent pattern in every other cell
// (and against the February flyer, which spells out the identical case
// explicitly): grade 7's Gold column reads "J1 100" even though J is an
// unsplit letter everywhere else it appears (grade 5's ASF, grade 8's
// Silver) -- read here as a stray character, i.e. "J 100". And grade 9's
// Bronze column reads "II 100" where the pattern calls for "I-II 100" (a
// letter-I-plus-double-sub case, which the February flyer spells out in
// full for its own equivalent cells) -- read here as "I-II 100". Both are
// called out in the README; flag to Nina if either reads wrong in
// practice.

const MATH_LEVEL_ORDER = [
  '7A', '6A', '5A', '4A', '3A', '2A',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
];
const MATH_INDEX = {};
MATH_LEVEL_ORDER.forEach((t, i) => { MATH_INDEX[t] = i; });

// Standardized grade list, per Nina (Aug 19): PK3 is younger than PK2;
// P1-P11 replace the previously-inconsistent "4" / "P4" / "1ST" values.
// PK3 and anything past P11 (P12/P13/P14 -- real grades, just too old for
// these particular award rules) are valid grades that simply never
// qualify for ASHR.
const GRADE_ORDER = ['PK3', 'PK2', 'PK1', 'K', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11'];

// Grades PK3 always shows N/A (confirmed by Nina -- not covered by these
// tables). PK2 through P11 are covered for Math. Reading's table only goes
// to P9 -- P10/P11 are real grades, just not covered by the Reading table
// (same "valid grade, not in this table" treatment as Math's P12+).
const MATH_ASHR_ELIGIBLE_GRADES = new Set(['PK2', 'PK1', 'K', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11']);
const READING_ASHR_ELIGIBLE_GRADES = new Set(['PK2', 'PK1', 'K', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9']);

// Qualifying-level tables, transcribed directly from the flyers Nina sent
// (Aug 19), plus the PK3 row she dictated and confirmed as a linear
// one-level-earlier shift of the PK2 row. `null` means "N/A" -- not
// achievable at that grade per the table (e.g. no Silver/Gold for P10/P11).
const MATH_QUALIFYING_LEVELS = {
  August: {
    PK3: { KIS: '5A1', Bronze: '5A150', Silver: '3A50', Gold: '2A50', ASF: 'B50' },
    PK2: { KIS: '4A1', Bronze: '4A150', Silver: '2A50', Gold: 'A50', ASF: 'C50' },
    PK1: { KIS: '3A1', Bronze: '3A150', Silver: 'A50', Gold: 'B50', ASF: 'D50' },
    K: { KIS: '2A1', Bronze: '2A150', Silver: 'B50', Gold: 'C50', ASF: 'E50' },
    P1: { KIS: 'A1', Bronze: 'A150', Silver: 'C50', Gold: 'D50', ASF: 'F50' },
    P2: { KIS: 'B1', Bronze: 'B150', Silver: 'D50', Gold: 'E50', ASF: 'G50' },
    P3: { KIS: 'C1', Bronze: 'C150', Silver: 'E50', Gold: 'F50', ASF: 'H50' },
    P4: { KIS: 'D1', Bronze: 'D150', Silver: 'F50', Gold: 'G50', ASF: 'I50' },
    P5: { KIS: 'E1', Bronze: 'E150', Silver: 'G50', Gold: 'H50', ASF: 'J50' },
    P6: { KIS: 'F1', Bronze: 'F150', Silver: 'H50', Gold: 'I50', ASF: 'K50' },
    P7: { KIS: 'G1', Bronze: 'G150', Silver: 'I50', Gold: 'J50', ASF: 'L50' },
    P8: { KIS: 'H1', Bronze: 'H150', Silver: 'J50', Gold: 'K50', ASF: 'M50' },
    P9: { KIS: 'I1', Bronze: 'I150', Silver: 'K50', Gold: 'L50', ASF: 'N50' },
    P10: { KIS: 'J1', Bronze: 'K100', Silver: null, Gold: null, ASF: 'O50' },
    P11: { KIS: 'K1', Bronze: 'M100', Silver: null, Gold: null, ASF: null },
  },
  February: {
    PK2: { KIS: '4A1', Bronze: '3A50', Silver: '2A150', Gold: 'A150', ASF: 'C150' },
    PK1: { KIS: '3A1', Bronze: '2A50', Silver: 'A150', Gold: 'B150', ASF: 'D150' },
    K: { KIS: '2A1', Bronze: 'A50', Silver: 'B150', Gold: 'C150', ASF: 'E150' },
    P1: { KIS: 'A1', Bronze: 'B50', Silver: 'C150', Gold: 'D150', ASF: 'F150' },
    P2: { KIS: 'B1', Bronze: 'C50', Silver: 'D150', Gold: 'E150', ASF: 'G150' },
    P3: { KIS: 'C1', Bronze: 'D50', Silver: 'E150', Gold: 'F150', ASF: 'H150' },
    P4: { KIS: 'D1', Bronze: 'E50', Silver: 'F150', Gold: 'G150', ASF: 'I150' },
    P5: { KIS: 'E1', Bronze: 'F50', Silver: 'G150', Gold: 'H150', ASF: 'J150' },
    P6: { KIS: 'F1', Bronze: 'G50', Silver: 'H150', Gold: 'I150', ASF: 'K150' },
    P7: { KIS: 'G1', Bronze: 'H50', Silver: 'I150', Gold: 'J150', ASF: 'L150' },
    P8: { KIS: 'H1', Bronze: 'I50', Silver: 'J150', Gold: 'K150', ASF: 'M150' },
    P9: { KIS: 'I1', Bronze: 'J50', Silver: 'K150', Gold: 'L150', ASF: 'N150' },
    P10: { KIS: 'J1', Bronze: 'L100', Silver: null, Gold: null, ASF: null },
    P11: { KIS: 'K1', Bronze: 'N100', Silver: null, Gold: null, ASF: null },
    // Note: PK3 not given for the February cutoff -- since PK3 always
    // resolves to N/A regardless of cutoff (see MATH_ASHR_ELIGIBLE_GRADES),
    // this table never needs to be consulted for PK3 anyway.
  },
};

// Reading qualifying-level table, transcribed and cross-validated from
// Nina's flyers (Aug 19) -- see the file header for the two corrected cells
// (August grade 7 Gold, grade 9 Bronze) and the "A1 means AI" resolution.
// Letters A-I sub-split into a first half ("I") and second half ("II");
// J-O do not split. `null` means "N/A" -- not achievable at that grade.
const READING_QUALIFYING_LEVELS = {
  August: {
    PK2: { KIS: '4A1', Bronze: '4A150', Silver: '2A50', Gold: 'AI100', ASF: 'CI100' },
    PK1: { KIS: '3A1', Bronze: '3A150', Silver: 'AI100', Gold: 'BI100', ASF: 'DI100' },
    K: { KIS: '2A1', Bronze: '2A150', Silver: 'BI100', Gold: 'CI100', ASF: 'EI100' },
    P1: { KIS: 'AI1', Bronze: 'AII100', Silver: 'CI100', Gold: 'DI100', ASF: 'FI100' },
    P2: { KIS: 'BI1', Bronze: 'BII100', Silver: 'DI100', Gold: 'EI100', ASF: 'GI100' },
    P3: { KIS: 'CI1', Bronze: 'CII100', Silver: 'EI100', Gold: 'FI100', ASF: 'HI100' },
    P4: { KIS: 'DI1', Bronze: 'DII100', Silver: 'FI100', Gold: 'GI100', ASF: 'I-I100' },
    P5: { KIS: 'EI1', Bronze: 'EII100', Silver: 'GI100', Gold: 'HI100', ASF: 'J100' },
    P6: { KIS: 'FI1', Bronze: 'FII100', Silver: 'HI100', Gold: 'I-I100', ASF: 'K100' },
    P7: { KIS: 'GI1', Bronze: 'GII100', Silver: 'I-I100', Gold: 'J100', ASF: 'L100' },
    P8: { KIS: 'HI1', Bronze: 'HII100', Silver: 'J100', Gold: 'K50', ASF: 'M100' },
    P9: { KIS: 'I-I1', Bronze: 'I-II100', Silver: 'K100', Gold: 'L50', ASF: 'N100' },
  },
  February: {
    PK2: { KIS: '4A1', Bronze: '3A50', Silver: '2A150', Gold: 'AII100', ASF: 'CII100' },
    PK1: { KIS: '3A1', Bronze: '2A50', Silver: 'AII150', Gold: 'BII100', ASF: 'DII100' },
    K: { KIS: '2A1', Bronze: 'AI100', Silver: 'BII100', Gold: 'CII100', ASF: 'EII100' },
    P1: { KIS: 'AI1', Bronze: 'BI100', Silver: 'CII100', Gold: 'DII100', ASF: 'FII100' },
    P2: { KIS: 'BI1', Bronze: 'CI100', Silver: 'DII100', Gold: 'EII100', ASF: 'GII100' },
    P3: { KIS: 'CI1', Bronze: 'DI100', Silver: 'EII100', Gold: 'FII100', ASF: 'HII100' },
    P4: { KIS: 'DI1', Bronze: 'EI100', Silver: 'FII100', Gold: 'GII100', ASF: 'I-II100' },
    P5: { KIS: 'EI1', Bronze: 'FI100', Silver: 'GII100', Gold: 'HII100', ASF: 'J100' },
    P6: { KIS: 'FI1', Bronze: 'GI100', Silver: 'HII100', Gold: 'I-II100', ASF: 'K100' },
    P7: { KIS: 'GI1', Bronze: 'HI100', Silver: 'I-II100', Gold: 'J150', ASF: 'L100' },
    P8: { KIS: 'HI1', Bronze: 'I-I100', Silver: 'J150', Gold: 'K150', ASF: null },
    P9: { KIS: 'I-I1', Bronze: 'J50', Silver: 'K150', Gold: 'L150', ASF: null },
  },
};

const TIER_ORDER = ['KIS', 'Bronze', 'Silver', 'Gold', 'ASF'];

// --- Grade normalization ---------------------------------------------------

function normalizeGrade(raw) {
  if (raw === null || raw === undefined) return null;
  const g = String(raw).trim().toUpperCase();
  if (!g) return null;
  if (g === '1ST') return 'P1';
  if (g === 'PK') return 'K';
  if (g === 'PK1' || g === 'PK2' || g === 'PK3' || g === 'K') return g;
  const m = g.match(/^P?(\d{1,2})$/);
  if (m) return `P${parseInt(m[1], 10)}`;
  return raw.trim(); // leave anything unrecognized untouched rather than destroy it
}

function isRecognizedGrade(normalizedGrade) {
  return GRADE_ORDER.includes(normalizedGrade);
}

// --- Level parsing: Math ----------------------------------------------

function parseMathLevel(raw) {
  if (!raw) return null;
  const s = String(raw).toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^(\d*A|[A-Z])(\d*)$/);
  if (!m) return null;
  const token = m[1];
  if (!(token in MATH_INDEX)) return null;
  const page = m[2] ? parseInt(m[2], 10) : 1;
  return { index: MATH_INDEX[token], page };
}

function cmpMathLevel(a, b) {
  if (a.index !== b.index) return a.index - b.index;
  return a.page - b.page;
}

// --- Level parsing: Reading ---------------------------------------------
//
// Ascending order of Reading level tokens. Letters A-I sub-split into a
// first half ("I") and second half ("II"); J-O don't split. Level I's own
// letter doubles as the Roman-numeral-I marker, so its sub-splits use the
// hyphenated canonical form 'I-I' / 'I-II' (see file header) rather than
// the ambiguous concatenated 'II' / 'III'.
const READING_LEVEL_ORDER = [
  '7A', '6A', '5A', '4A', '3A', '2A',
  'AI', 'AII', 'BI', 'BII', 'CI', 'CII', 'DI', 'DII', 'EI', 'EII',
  'FI', 'FII', 'GI', 'GII', 'HI', 'HII', 'I-I', 'I-II',
  'J', 'K', 'L', 'M', 'N', 'O',
];
const READING_INDEX = {};
READING_LEVEL_ORDER.forEach((t, i) => { READING_INDEX[t] = i; });

// Parses a real Reading level string into a comparable position. Handles
// every notation actually seen in the source data for the same underlying
// level: Roman-numeral suffix ("AI", "AII"), the equivalent digit shorthand
// ("A1", "A2" -- confirmed by Nina to mean the same thing), and an explicit
// hyphen before the sub-marker ("G-I", "G-II") -- all three appear in the
// real roster for otherwise-identical levels. Multi-value or annotated
// entries (e.g. "5A 50 & ZII 100") are treated as unparseable rather than
// guessed at.
function parseReadingLevel(raw) {
  if (!raw) return null;
  if (/[&,\/]/.test(String(raw))) return null;
  const s = String(raw).toUpperCase().replace(/[\s-]+/g, '');
  if (!s) return null;

  // Multiplier bases (7A-2A), no sub-split -- same shape as Math.
  const baseMatch = s.match(/^([2-7]A)(\d*)$/);
  if (baseMatch) {
    const token = baseMatch[1];
    if (!(token in READING_INDEX)) return null;
    const page = baseMatch[2] ? parseInt(baseMatch[2], 10) : 1;
    return { index: READING_INDEX[token], page };
  }

  // Unsplit letters J-O.
  const unsplitMatch = s.match(/^([J-O])(\d*)$/);
  if (unsplitMatch) {
    const page = unsplitMatch[2] ? parseInt(unsplitMatch[2], 10) : 1;
    return { index: READING_INDEX[unsplitMatch[1]], page };
  }

  // Split letters A-I, each requiring a sub-level marker -- Roman numeral
  // (I/II) or the equivalent 1/2 digit shorthand.
  const splitMatch = s.match(/^([A-I])(II|I|2|1)(\d*)$/);
  if (splitMatch) {
    const letter = splitMatch[1];
    const sub = (splitMatch[2] === 'II' || splitMatch[2] === '2') ? 'II' : 'I';
    const token = letter === 'I' ? `I-${sub}` : `${letter}${sub}`;
    if (!(token in READING_INDEX)) return null;
    const page = splitMatch[3] ? parseInt(splitMatch[3], 10) : 1;
    return { index: READING_INDEX[token], page };
  }

  return null;
}

function cmpReadingLevel(a, b) {
  if (a.index !== b.index) return a.index - b.index;
  return a.page - b.page;
}

// --- Tier computation --------------------------------------------------

// Returns the highest tier ('KIS'|'Bronze'|'Silver'|'Gold'|'ASF') the given
// Math level meets for a grade + cutoff cycle, or 'N/A' if below KIS, or
// null if it can't be determined (ungraded / unparseable level / grade not
// covered by the table).
function computeMathTier(cutoff, grade, levelRaw) {
  const ng = normalizeGrade(grade);
  if (!ng || !MATH_ASHR_ELIGIBLE_GRADES.has(ng)) return null;
  const table = MATH_QUALIFYING_LEVELS[cutoff];
  if (!table || !table[ng]) return null;
  const pos = parseMathLevel(levelRaw);
  if (!pos) return null;

  let tier = 'N/A';
  for (const name of TIER_ORDER) {
    const thresholdRaw = table[ng][name];
    if (!thresholdRaw) continue;
    const thresholdPos = parseMathLevel(thresholdRaw);
    if (thresholdPos && cmpMathLevel(pos, thresholdPos) >= 0) {
      tier = name;
    }
  }
  return tier;
}

// Same as computeMathTier, for Reading.
function computeReadingTier(cutoff, grade, levelRaw) {
  const ng = normalizeGrade(grade);
  if (!ng || !READING_ASHR_ELIGIBLE_GRADES.has(ng)) return null;
  const table = READING_QUALIFYING_LEVELS[cutoff];
  if (!table || !table[ng]) return null;
  const pos = parseReadingLevel(levelRaw);
  if (!pos) return null;

  let tier = 'N/A';
  for (const name of TIER_ORDER) {
    const thresholdRaw = table[ng][name];
    if (!thresholdRaw) continue;
    const thresholdPos = parseReadingLevel(thresholdRaw);
    if (thresholdPos && cmpReadingLevel(pos, thresholdPos) >= 0) {
      tier = name;
    }
  }
  return tier;
}

// Dispatches to the right subject's computation. Returns null for any
// subject other than Math/Reading.
function computeTier(subject, cutoff, grade, levelRaw) {
  if (subject === 'Math') return computeMathTier(cutoff, grade, levelRaw);
  if (subject === 'Reading') return computeReadingTier(cutoff, grade, levelRaw);
  return null;
}

// Given this cycle's computed tier and the tier actually awarded last
// cycle, return what should be shown: a fresh award, a repeat ("Double
// Award" -- tracked, no second certificate, matches the literal label
// already used in the real source sheets), or nothing.
function resolveAwardStatus(computedTier, previousTier) {
  if (!computedTier || computedTier === 'N/A') return { result: 'N/A', status: 'none' };
  const prev = (previousTier || '').trim();
  if (prev && prev.toUpperCase() === computedTier.toUpperCase()) {
    return { result: 'Double Award', status: 'double' };
  }
  return { result: computedTier, status: 'new' };
}

function nextAshrCycle(cycle) {
  const [year, month] = cycle.split('-');
  const y = parseInt(year, 10);
  if (month === '08') return `${y + 1}-02`;
  return `${y}-08`;
}

function cycleLabel(cycle) {
  const [year, month] = cycle.split('-');
  return month === '08' ? `August ${year}` : `February ${year}`;
}

// Backfilled tiers come from the source sheets in inconsistent casing
// (KIS/BRONZE/SILVER/...). Normalize to the same display form the live
// computation uses, without inventing anything for values not on the known
// list (those pass through unchanged, so a typo in the source is visible
// rather than silently coerced).
const TIER_DISPLAY = {
  KIS: 'KIS', BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', ASF: 'ASF',
  COMPLETER: 'Completer', 'DOUBLE AWARD': 'Double Award', 'N/A': 'N/A', NA: 'N/A',
};

function normalizeTierLabel(raw) {
  if (!raw) return raw;
  const key = String(raw).trim().toUpperCase();
  return TIER_DISPLAY[key] || raw;
}

module.exports = {
  normalizeTierLabel,
  MATH_LEVEL_ORDER, READING_LEVEL_ORDER, GRADE_ORDER,
  MATH_ASHR_ELIGIBLE_GRADES, READING_ASHR_ELIGIBLE_GRADES, TIER_ORDER,
  MATH_QUALIFYING_LEVELS, READING_QUALIFYING_LEVELS,
  normalizeGrade, isRecognizedGrade,
  parseMathLevel, cmpMathLevel,
  parseReadingLevel, cmpReadingLevel,
  computeMathTier, computeReadingTier, computeTier,
  resolveAwardStatus,
  nextAshrCycle, cycleLabel,
};
