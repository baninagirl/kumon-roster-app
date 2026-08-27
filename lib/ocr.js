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
const REFERENCE_LABEL_PATTERNS = [
  /reference\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Za-z0-9]{6,20})/i,
  /ref\.?\s*(?:no\.?|#)?\s*[:\-]?\s*([A-Za-z0-9]{6,20})/i,
  /transaction\s*(?:id|no\.?|number)?\s*[:\-]?\s*([A-Za-z0-9]{6,20})/i,
  /trace\s*(?:no\.?|number)?\s*[:\-]?\s*([A-Za-z0-9]{6,20})/i,
];

// A lone long digit run is a reasonable fallback guess for GCash's own
// 13-digit reference numbers specifically (e.g. "2026050000005") when none
// of the labeled patterns above matched -- still bounded (12-14 digits) so
// it doesn't grab a phone number or amount by accident.
const BARE_LONG_DIGIT_RUN = /\b(\d{12,14})\b/;

function extractReferenceNumber(rawText) {
  if (!rawText) return null;
  for (const pattern of REFERENCE_LABEL_PATTERNS) {
    const m = rawText.match(pattern);
    if (m && m[1]) return m[1].trim();
  }
  const bare = rawText.match(BARE_LONG_DIGIT_RUN);
  if (bare) return bare[1];
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
