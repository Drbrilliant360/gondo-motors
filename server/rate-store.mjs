// Postgres-backed store for express-rate-limit, so limits hold across serverless instances and restarts.
import { query } from './db.mjs';

export class PgRateStore {
  constructor(prefix) { this.prefix = prefix; this.localKeys = false; }
  init(options) { this.windowMs = options.windowMs; }
  async increment(key) {
    const { rows } = await query(
      `INSERT INTO rate_limits (key, hits, reset_at) VALUES ($1, 1, now() + $2 * interval '1 millisecond')
       ON CONFLICT (key) DO UPDATE SET
         hits = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.hits + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at <= now() THEN now() + $2 * interval '1 millisecond' ELSE rate_limits.reset_at END
       RETURNING hits, reset_at`, [this.prefix + key, this.windowMs]);
    if (Math.random() < 0.02) query("DELETE FROM rate_limits WHERE reset_at < now() - interval '1 day'").catch(() => {}); // occasional tidy-up
    return { totalHits: rows[0].hits, resetTime: rows[0].reset_at };
  }
  async decrement(key) { await query('UPDATE rate_limits SET hits = GREATEST(hits - 1, 0) WHERE key = $1 AND reset_at > now()', [this.prefix + key]); }
  async resetKey(key) { await query('DELETE FROM rate_limits WHERE key = $1', [this.prefix + key]); }
}
