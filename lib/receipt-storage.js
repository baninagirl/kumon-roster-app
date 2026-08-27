// Receipt image storage -- local disk in this sandbox / for local dev,
// Vercel Blob in production.
//
// Same reasoning and the same require-with-fallback pattern as lib/db.js's
// `pg` / `pg-lite` split (task #43): Vercel's serverless functions have no
// persistent local disk, so receipt screenshots can't just live in
// data/receipts/ once this app is actually deployed there -- that folder
// would be wiped (or simply unwritable) between invocations. @vercel/blob
// is the natural fit, already in the same ecosystem as the rest of this
// deployment (same team/project, same env-var-based auth pattern as
// Supabase's DATABASE_URL) -- but exactly like `pg`, it isn't installable
// here (this sandbox has no npm registry access), so this module tries to
// require it and falls back to the exact original local-disk behavior
// when it isn't present. On Vercel, `npm install` has full registry
// access, so the real module is always used there. See package.json --
// `@vercel/blob` is listed as a real dependency for exactly this reason,
// same as `pg`.
//
// IMPORTANT HONEST LIMITATION: unlike the pg/pg-lite split, there is no
// local stand-in that actually exercises the real Blob code path here --
// this sandbox has no outbound network access at all (confirmed in an
// earlier session: even plain HTTPS to arbitrary hosts fails), so the
// `usingBlob` branch below has only been verified by careful reading of
// Vercel's own docs and by `node --check`, never by an actual upload/
// download round trip. The `usingBlob === false` branch (local disk) is
// the one this app's full test suite actually exercises, unchanged from
// before this file existed. Treat the Blob branch as needing a real
// smoke test (upload one receipt, verify it displays) right after the
// first Vercel deploy, the same way the OCR.space key needed a real test
// once Nina had one -- flagged here rather than silently assumed correct.
//
// PRIVACY NOTE: blobs are stored with access: 'private', deliberately --
// not the default-looking 'public' choice. A private blob's URL is not
// fetchable by anyone who doesn't hold this app's own Blob credentials
// (an OIDC token or BLOB_READ_WRITE_TOKEN, both server-side only, never
// sent to the browser), so the only way to ever see a receipt image
// stays this app's own GET /api/payments/receipts/:id/image route --
// the exact same privacy posture as the original local-disk version,
// where the raw file path was likewise never exposed to the client and
// the only read path was that same route. This matters here specifically
// because receipt screenshots are payment proof (GCash/bank reference
// numbers, sometimes partial account info) -- see
// kumon-privacy-assessment.md's note that payment data is one of the two
// categories most likely to cause real harm if it leaked.

const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

const RECEIPTS_DIR = path.join(__dirname, '..', 'data', 'receipts');

let blob = null;
try {
  blob = require('@vercel/blob');
} catch {
  blob = null;
}

const usingBlob = !!blob;

// Saves a receipt image under `filename` (already unique -- built by
// server.js's writeReceiptFileAndRunOcr as
// `${prefix}-${timestamp}-${random}${ext}`) and returns the value to
// store in payment_receipt.file_path. Local disk: just the filename,
// exactly as before this file existed. Blob: the blob's own `pathname`
// (not its full URL -- get() below takes a pathname, and with
// addRandomSuffix left at its default of false, the pathname Blob hands
// back is simply the same filename passed in) -- so file_path's meaning
// stays identical in both modes, and no data migration is needed for
// this column when switching between them.
async function saveReceiptFile(filename, buffer, mimeType) {
  if (usingBlob) {
    const result = await blob.put(filename, buffer, {
      access: 'private',
      contentType: mimeType,
    });
    return result.pathname;
  }
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  const filePath = path.join(RECEIPTS_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return filename;
}

// Reads a receipt image back given whatever saveReceiptFile returned.
// Returns { stream, contentType } (a Node Readable either way -- Blob's
// get() hands back a web ReadableStream, converted here with
// Readable.fromWeb so the route handler can .pipe() it exactly like the
// local-disk case, no branching needed at the call site) or null if it
// can't be found -- deleted, moved, or (local-disk case) an old/malformed
// path that doesn't resolve inside RECEIPTS_DIR, the same guard the route
// handler applied before this was factored out of server.js.
async function readReceiptFile(ref, fallbackMimeType) {
  if (usingBlob) {
    const result = await blob.get(ref, { access: 'private' });
    if (!result || !result.stream) return null;
    return {
      stream: Readable.fromWeb(result.stream),
      contentType: (result.blob && result.blob.contentType) || fallbackMimeType,
    };
  }
  const filePath = path.join(RECEIPTS_DIR, ref);
  if (!filePath.startsWith(RECEIPTS_DIR) || !fs.existsSync(filePath)) return null;
  return { stream: fs.createReadStream(filePath), contentType: fallbackMimeType };
}

module.exports = { saveReceiptFile, readReceiptFile, usingBlob };
