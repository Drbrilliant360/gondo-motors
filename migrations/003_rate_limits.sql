-- Shared counters for rate limiting. On Vercel each request may hit a different server instance,
-- so attempt counts have to live in the database rather than in one instance's memory.
BEGIN;
CREATE TABLE rate_limits (
  key       TEXT        PRIMARY KEY,
  hits      INTEGER     NOT NULL,
  reset_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX rate_limits_reset_idx ON rate_limits (reset_at);
COMMIT;
