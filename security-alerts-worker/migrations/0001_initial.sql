CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  source_key TEXT NOT NULL,
  source_url TEXT NOT NULL,
  cve_id TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  severity_score INTEGER NOT NULL CHECK (severity_score BETWEEN 0 AND 100),
  status TEXT NOT NULL CHECK (status IN ('pending_review', 'published', 'rejected', 'withdrawn')),
  source_published_at TEXT,
  source_updated_at TEXT,
  published_at TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS alerts_status_published_at ON alerts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS alerts_cve_id ON alerts(cve_id);
CREATE INDEX IF NOT EXISTS alerts_source_updated_at ON alerts(source_updated_at DESC);

CREATE TABLE IF NOT EXISTS source_state (
  source_key TEXT PRIMARY KEY,
  etag TEXT,
  last_modified TEXT,
  last_fetched_at TEXT NOT NULL,
  last_success_at TEXT,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id TEXT REFERENCES alerts(id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_events_alert_created_at ON audit_events(alert_id, created_at DESC);
