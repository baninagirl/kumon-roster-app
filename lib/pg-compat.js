// Thin compatibility layer so server.js's ~140 direct database call sites
// didn't all need their SQL rewritten by hand for the Postgres port.
//
// The old node:sqlite code everywhere in server.js looked like:
//   db.prepare(`SELECT * FROM student WHERE id = ?`).get(studentId)
//   db.prepare(`UPDATE student SET x = ? WHERE id = ?`).run(x, id)
//   db.prepare(`SELECT * FROM student`).all()
// wrapDb() below gives back an object with the same `.prepare(sql).get/all/run(...)`
// shape, backed by a real `pg`-style Pool underneath -- `?` placeholders are
// auto-converted to Postgres's `$1, $2, ...`, and `.get/.all/.run` become
// async (a real network round trip replaces what used to be a synchronous
// local file read). That means every call site in server.js only needed
// one mechanical change: add `await`. The actual SQL text and business
// logic didn't need re-deriving from scratch, which is what made porting
// a 2800-line file with 140+ call sites tractable to actually verify.
//
// `.run()` doesn't get SQLite's automatic `lastInsertRowid` from Postgres --
// the handful of call sites that relied on it (creating a student, an
// enrollment, a receipt, a billing group) had `RETURNING id` added to
// their INSERT statement, and `.run()` here surfaces that as
// `lastInsertRowid` for those call sites specifically, same field name as
// before so nothing downstream needed to change.

function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function wrapDb(pool) {
  return {
    prepare(sql) {
      const pgSql = convertPlaceholders(sql);
      return {
        async all(...args) {
          const result = await pool.query(pgSql, args);
          return result.rows;
        },
        async get(...args) {
          const result = await pool.query(pgSql, args);
          return result.rows[0];
        },
        async run(...args) {
          const result = await pool.query(pgSql, args);
          return {
            changes: result.rowCount,
            lastInsertRowid: result.rows && result.rows[0] ? result.rows[0].id : undefined,
          };
        },
      };
    },
    // Passthrough so the small app_state helpers imported from lib/db.js
    // (which talk to the raw pool directly, not through .prepare()) keep
    // working when handed this same wrapped object.
    async query(text, params) {
      return pool.query(text, params);
    },
  };
}

module.exports = { wrapDb };
