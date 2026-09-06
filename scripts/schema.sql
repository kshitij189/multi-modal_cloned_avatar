-- D1 schema.
--
-- Cloudflare D1 (SQLite at the edge) replaces Postgres here: 5M row-reads and 100k
-- row-writes per day on the free plan, no card, no persistent process. See PRD §7.
--
-- DELIBERATE OMISSION: there is no column anywhere for the recruiter's question text.
-- Someone typing into a candidate's demo has not meaningfully consented to that text
-- being stored and read later. Only a coarse category is kept. See PRD §12.3.

CREATE TABLE IF NOT EXISTS visit (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT,
  sid      TEXT,
  ts       INTEGER NOT NULL,
  country  TEXT,     -- CF-IPCountry header. Coarse. No IP is stored.
  ua_class TEXT      -- 'mobile' | 'desktop'. Not the raw user-agent string.
);
CREATE INDEX IF NOT EXISTS idx_visit_token ON visit (token_id, ts);
CREATE INDEX IF NOT EXISTS idx_visit_ts ON visit (ts);

CREATE TABLE IF NOT EXISTS event (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT,
  sid      TEXT,
  ts       INTEGER NOT NULL,
  type     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_sid ON event (sid, ts);
CREATE INDEX IF NOT EXISTS idx_event_ts ON event (ts);

CREATE TABLE IF NOT EXISTS ask (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id    TEXT,
  sid         TEXT,
  ts          INTEGER NOT NULL,
  provider    TEXT,
  latency_ms  INTEGER,
  refused     INTEGER NOT NULL DEFAULT 0,
  cited_nodes TEXT,     -- JSON array of node IDs
  q_class     TEXT      -- 'project'|'experience'|'meta'|'banned'|'other'|'refused:<reason>'
);
CREATE INDEX IF NOT EXISTS idx_ask_token ON ask (token_id, ts);
CREATE INDEX IF NOT EXISTS idx_ask_sid ON ask (sid, ts);

CREATE TABLE IF NOT EXISTS quota_day (
  day      TEXT NOT NULL,
  provider TEXT NOT NULL,
  calls    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, provider)
);
