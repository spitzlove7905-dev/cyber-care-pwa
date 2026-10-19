CREATE TABLE IF NOT EXISTS social_runs (
 id TEXT PRIMARY KEY,
 day TEXT NOT NULL,
 slot TEXT NOT NULL,
 platform TEXT NOT NULL,
 status TEXT NOT NULL,
 alert_ids_json TEXT NOT NULL,
 post_text TEXT NOT NULL,
 buffer_post_id TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(day,slot,platform)
);
CREATE TABLE IF NOT EXISTS social_run_items (
 alert_id TEXT NOT NULL REFERENCES alerts(id),
 platform TEXT NOT NULL,
 run_id TEXT NOT NULL REFERENCES social_runs(id),
 PRIMARY KEY(alert_id,platform)
);
