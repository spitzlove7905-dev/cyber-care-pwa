CREATE TABLE IF NOT EXISTS social_deliveries (
  alert_id TEXT NOT NULL REFERENCES alerts(id),
  channel_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('x','threads','facebook')),
  language TEXT NOT NULL CHECK(language IN ('ja','en')),
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sending','draft_created','needs_check')),
  buffer_post_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(alert_id, channel_id)
);
CREATE INDEX IF NOT EXISTS social_deliveries_created ON social_deliveries(created_at);
