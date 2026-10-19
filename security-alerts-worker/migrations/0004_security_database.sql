CREATE TABLE IF NOT EXISTS incident_details (
 alert_id TEXT PRIMARY KEY REFERENCES alerts(id), organization TEXT NOT NULL DEFAULT '不明',
 organization_reading TEXT NOT NULL DEFAULT '', occurred_at TEXT,
 attack_type TEXT NOT NULL DEFAULT 'その他', severity TEXT NOT NULL DEFAULT '未評価',
 severity_reason TEXT NOT NULL DEFAULT '情報源に客観的な重大度の記載なし', cvss REAL,
 urgency INTEGER NOT NULL DEFAULT 1 CHECK(urgency BETWEEN 0 AND 3), urgency_reason TEXT NOT NULL DEFAULT '',
 incident_state TEXT NOT NULL DEFAULT '注意', damage TEXT NOT NULL DEFAULT '不明',
 response_status TEXT NOT NULL DEFAULT '不明', confirmation TEXT NOT NULL DEFAULT '公式発表確認済み', curated INTEGER NOT NULL DEFAULT 0, data_hash TEXT NOT NULL DEFAULT '',
 CHECK(cvss IS NULL OR (cvss >= 0 AND cvss <= 10))
);
CREATE TABLE IF NOT EXISTS incident_sources (
 alert_id TEXT NOT NULL REFERENCES alerts(id), source_url TEXT NOT NULL, source_name TEXT NOT NULL,
 checked_at TEXT NOT NULL, PRIMARY KEY(alert_id,source_url)
);
CREATE TABLE IF NOT EXISTS collection_runs (
 id TEXT PRIMARY KEY, started_at TEXT NOT NULL, completed_at TEXT,
 status TEXT NOT NULL CHECK(status IN ('running','success','partial','failed')),
 sources_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS collection_completed ON collection_runs(started_at DESC);
CREATE TABLE IF NOT EXISTS database_deliveries (
 run_id TEXT NOT NULL REFERENCES social_runs(id), alert_id TEXT NOT NULL REFERENCES alerts(id),
 platform TEXT NOT NULL, content_hash TEXT NOT NULL, kind TEXT NOT NULL,
 created_at TEXT NOT NULL, PRIMARY KEY(run_id,alert_id)
);
CREATE INDEX IF NOT EXISTS database_delivery_recent ON database_deliveries(alert_id,platform,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS database_delivery_revision ON database_deliveries(alert_id,platform,content_hash);
-- The previous importer stored CISA's remediation deadline as source_updated_at.
-- KEV has no per-record update timestamp; never present a deadline as an update.
UPDATE alerts SET source_updated_at=NULL WHERE source_key='cisa-kev';
