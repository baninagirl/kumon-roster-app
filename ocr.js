// Receipt OCR text parsing -- pure logic, same role as lib/payments.js and
// lib/tuition.js: no network access, no database access, just turning raw
// text (already recognized by an external OCR service, see server.js's
// callOcrSpace()) into a best-guess reference number/amount/date. Kept
// separate from the actual network call for the same reason the rest of
// this app separates I/O from business rules -- these regexes are
// independently testable with plain strings, no server or API key needed.
//
// Aug 27, 2026 -- built alongside the receipt-upload/verification feature
// (Nina: teachers drag a GCash/bank-transfer receipt screenshot onto a
// student's Payments row instead of emailing it; Joanne's job becomes
// verifying the extracted reference number against her own bank access,
// not retyping it from scratch). Nina explicitly doesn't want to pay for
// OCR -- OCR.space's free tier (see server.js's OCR_SPACE_ENDPOINT) is a
// plain text-recognition engine, not a "understand this is a receipt and
// find me the reference number" service, so this module is the part that
// actually looks for one in whatever text comes back.
//
// "Flag rather than guess" applies here same as everywhere else in this
// app: every extractor below returns null rather than a low-confidence
// guess when it isn't reasonably sure, leaving the field blank for a human
// to fill in rather than silently populating it with something wrong that
// looks confident. This will need real tuning against actual receipts
// Nina's teachers send -- these patterns cover the common GCash/bank-app
// wording seen in the Philippines, not an exhaustive list.

// Common reference/transaction-number labels seen on GCash and Philippine
// bank-transfer receipts, in the rough order a screenshot tends to list
// them. Case-insensitive; a colon or dash between the label and the value
// is optional (OCR often drops punctuation).
//
// Aug 28 (Vercel go-live follow-up): GCash's own receipt layout prints the
// reference number in space-grouped digit blocks, card-number style --
// e.g. "Ref No. 8044 314 639540", not one unbroken token. The original
// patterns here only captured a single run of [A-Za-z0-9] characters, so
// they matched "Ref No." itself but then stopped at the first space,
// capturing nothing usable ("8044" alone is under the 6-character
// minimum) -- confirmed against a real receipt from the first live
// upload, where amount and date both extracted fine but the reference
// number came back blank. GROUPED_DIGITS covers that shape (2-4 digit
// groups of 3-6 digits, separated by single spaces) alongside the
// original single-token shape; extractReferenceNumber() strips the
// internal spaces back out before returning, so the stored value is one
// clean token either way.
const GROUPED_DIGITS = String.raw`\d{3,6}(?:[ \t]\d{3,6}){1,3}`;
const SINGLE_TOKEN = `[A-Za-z0-9]{6,20}`;

const REFERENCE_LABEL_PATTERNS = [
  new RegExp(String.raw`reference\s*(?:no\.?|number|#)?\s*[:\-]?\s*(${GROUPED_DIGITS}|${SINGLE_TOKEN})`, 'i'),
  new RegExp(String.raw`ref\.?\s*(?:no\.?|#)?\s*[:\-]?\s*(${GROUPED_DIGITS}|${SINGLE_TOKEN})`, 'i'),
  new RegExp(String.raw`transaction\s*(?:id|no\.?|number)?\s*[:\-]?\s*(${GROUPED_DIGITS}|${SINGLE_TOKEN})`, 'i'),
  new RegExp(String.raw`trace\s*(?:no\.?|number)?\s*[:\-]?\s*(${GROUPED_DIGITS}|${SINGLE_TOKEN})`, 'i'),
];

// A lone long digit run is a reasonable fallback guess for GCash's own
// 13-digit reference numbers specifically (e.g. "2026050000005") when none
// of the labeled patterns above matched -- still bounded (12-14 digits) so
// it doesn't grab a phone number or amount by accident. BARE_GROUPED_DIGITS
// is the same fallback for the space-grouped shape, bounded to the same
// 12-14 total digits for the same reason (a phone number grouped as
// "0917 704 1432" is 10 digits and correctly won't match).
const BARE_LONG_DIGIT_RUN = /\b(\d{12,14})\b/;
const BARE_GROUPED_DIGITS = new RegExp(String.raw`\b(${GROUPED_DIGITS})\b`);

function extractReferenceNumber(rawText) {
  if (!rawText) return null;
  for (const pattern of REFERENCE_LABEL_PATTERNS) {
    const m = rawText.match(pattern);
    if (m && m[1]) return m[1].replace(/\s+/g, '').trim();
  }
  const bare = rawText.match(BARE_LONG_DIGIT_RUN);
  if (bare) return bare[1];
  const bareGrouped = rawText.match(BARE_GROUPED_DIGITS);
  if (bareGrouped) {
    const digitsOnly = bareGrouped[1].replace(/\s+/g, '');
    if (digitsOnly.length >= 12 && digitsOnly.length <= 14) return digitsOnly;
  }
  return null;
}

// Peso amounts on a receipt are usually the single largest, most prominent
// number, often preceded by a peso sign or the words "amount"/"total"/
// "amount sent". Deliberately requires a currency cue (₱, PHP, "amount",
// "total") rather than grabbing the single biggest number on the page --
// dates and reference numbers are often larger numerically than a typical
// tuition payment, so an uncued guess would be more likely wrong than
// useful.
const AMOUNT_PATTERNS = [
  /(?:amount\s*(?:sent|paid)?|total(?:\s*amount)?)\s*[:\-]?\s*(?:php|₱)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /(?:php|₱)\s*([\d,]+(?:\.\d{1,2})?)/i,
];

function extractAmount(rawText) {
  if (!rawText) return null;
  for (const pattern of AMOUNT_PATTERNS) {
    const m = rawText.match(pattern);
    if (m && m[1]) {
      const n = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

// GCash/bank-app receipts commonly show a date as "Aug 27, 2026",
// "27 Aug 2026", or "2026-08-27" / "08/27/2026". Returns an ISO
// 'YYYY-MM-DD' string, or null if nothing matched confidently -- no
// attempt to disambiguate an ambiguous MM/DD vs DD/MM slash-date, since
// guessing wrong there is worse than leaving it blank.
const MONTH_NAMES = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function extractDate(rawText) {
  if (!rawText) return null;
  const iso = rawText.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const monthFirst = rawText.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(20\d{2})\b/);
  if (monthFirst) {
    const mon = MONTH_NAMES[monthFirst[1].slice(0, 3).toLowerCase()];
    if (mon) return `${monthFirst[3]}-${mon}-${String(monthFirst[2]).padStart(2, '0')}`;
  }

  const dayFirst = rawText.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})\b/);
  if (dayFirst) {
    const mon = MONTH_NAMES[dayFirst[2].slice(0, 3).toLowerCase()];
    if (mon) return `${dayFirst[3]}-${mon}-${String(dayFirst[1]).padStart(2, '0')}`;
  }
  return null;
}

function parseReceiptText(rawText) {
  return {
    referenceNumber: extractReferenceNumber(rawText),
    amount: extractAmount(rawText),
    date: extractDate(rawText),
  };
}

module.exports = {
  parseReceiptText,
  extractReferenceNumber,
  extractAmount,
  extractDate,
};
