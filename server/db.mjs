// Postgres access (Neon in production). Parameterised queries only — never build SQL from user input.
import 'dotenv/config';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and add your Neon pooled connection string.');

// Money (TZS) and counts are BIGINT; they stay far below 2^53, so plain numbers are safe and simpler than strings.
pg.types.setTypeParser(20, Number);
// DATE columns stay as 'YYYY-MM-DD' strings instead of being shifted through the server's timezone.
pg.types.setTypeParser(1082, (v) => v);

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
// TLS is always on and fully verified for remote databases; sslmode is dropped from the URL so this setting is the single source of truth.
const connectionString = isLocal ? url : url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
export const pool = new pg.Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: true },
  max: isLocal ? 4 : process.env.VERCEL ? 3 : 10, // serverless instances each hold a few connections; Neon's pooler does the sharing
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
pool.on('error', (err) => console.error('Postgres pool error:', err.message));

export const query = (text, params) => pool.query(text, params);
export const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
export const many = async (text, params) => (await pool.query(text, params)).rows;

// Runs fn inside a transaction; anything that touches payments or order state goes through here.
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
