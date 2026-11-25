// Applies migrations/*.sql in filename order, once each.   Usage: npm run migrate
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../server/db.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const client = await pool.connect();
try {
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    process.stdout.write(`Applying ${file} … `);
    try {
      await client.query(readFileSync(join(dir, file), 'utf8')); // each file wraps itself in BEGIN/COMMIT
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      console.log('done');
      applied++;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.log('FAILED');
      throw err;
    }
  }
  console.log(applied ? `${applied} migration(s) applied.` : 'Database is up to date.');
} finally {
  client.release();
  await pool.end();
}
