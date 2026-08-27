# SQLite → Postgres migration (Vercel deployment prep)

Two files here:

- `postgres-schema.sql` — the app's full current database shape, translated
  from `lib/db.js`'s SQLite schema into Postgres. Safe to run more than
  once (every `CREATE TABLE` is `IF NOT EXISTS`, every `ADD COLUMN` uses
  Postgres's native `IF NOT EXISTS`).
- `sqlite-to-postgres.js` — reads every row out of a real `roster.db` and
  writes a `.sql` file of `INSERT` statements that loads the same data
  into the schema above.

## Important: run this against your REAL database, not the one in this repo

The `data/roster.db` file that ships in this repo/zip is a shared
reference copy used for testing — it has your full roster, teacher, and
schedule data, but **zero payment records, billing groups, or receipts**,
because those only ever get written to the copy on your own Mac when you
run the app day to day. Migrating the repo's copy would leave all of that
real operational data behind. Before deploying for real, run the two
steps below against the actual `data/roster.db` this app has been using
on your Mac.

## Steps

1. **Make sure your real database has every table** (it should already,
   since you use the app regularly, but this is a one-line safety check):
   ```
   cd roster-app
   node -e "require('./lib/db').getDb()"
   ```

2. **Set up your Supabase Postgres schema** (one time): open your
   Supabase project's SQL Editor and paste in the contents of
   `postgres-schema.sql`, then run it. This creates all 12 tables.

3. **Generate the data-load file from your real database**:
   ```
   node migration/sqlite-to-postgres.js data/roster.db migration/data-load.sql
   ```
   This prints a row count per table — sanity-check that it roughly
   matches what you'd expect (student count, etc.) before continuing.

4. **Load it into Supabase.** From your own Mac's Terminal (this needs a
   real internet connection to reach Supabase, which this session
   doesn't have):
   ```
   psql "<your Supabase connection string>" -f migration/data-load.sql
   ```
   Use the **session pooler** connection string from Supabase's connection
   settings (port 6543), not the direct IPv6-only one — the direct one
   isn't reachable from most networks.

5. **Verify before trusting it**: compare a few row counts and spot-check
   a real student's data between the two databases, the same way this was
   verified locally before handing this off — see the app's README for
   the exact checks run.

## Why this exists

This sandbox has no general outbound network access (confirmed in an
earlier session — plain HTTPS and raw Postgres connections both time out
here), so the actual migration into your live Supabase project has to run
from a machine that does have real internet access: yours. Everything up
to generating `data-load.sql` was built and fully verified here, against
a local Postgres instance, using an exact schema/data comparison against
SQLite (row counts, foreign-key integrity, and byte-for-byte spot checks
including names with apostrophes) — so the file itself is trustworthy;
only the final `psql` load step needs to happen on your end.
