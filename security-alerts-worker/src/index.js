import { SOURCES, candidateFromKev, publicationDecision, sha256 } from './policy.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const PUBLIC_CACHE_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/healthz') return json({ ok: true });
    if (request.method === 'GET' && url.pathname === '/v1/alerts') return listPublishedAlerts(env);
    if (request.method === 'GET' && url.pathname.startsWith('/v1/alerts/')) return getPublishedAlert(env, url.pathname.slice('/v1/alerts/'.length));
    if (url.pathname.startsWith('/admin/')) return handleAdmin(request, env, url);
    return json({ error: 'not_found' }, 404);
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runMonitor(env));
  }
};

async function runMonitor(env) {
  for (const source of SOURCES) {
    try {
      if (source.key === 'cisa-kev') await ingestCisaKev(env, source);
    } catch (error) {
      await recordSourceFailure(env, source.key, error);
    }
  }
}

async function ingestCisaKev(env, source) {
  const savedState = await env.DB.prepare('SELECT etag, last_modified FROM source_state WHERE source_key = ?').bind(source.key).first();
  const headers = { accept: 'application/json' };
  if (savedState?.etag) headers['if-none-match'] = savedState.etag;
  if (savedState?.last_modified) headers['if-modified-since'] = savedState.last_modified;
  const response = await fetch(source.url, { headers, signal: AbortSignal.timeout(15_000) });
  const now = new Date().toISOString();

  if (response.status === 304) {
    await updateSourceState(env, source.key, savedState?.etag ?? null, savedState?.last_modified ?? null, now, null);
    return;
  }
  if (!response.ok) throw new Error(`${source.key} returned HTTP ${response.status}`);

  const payload = await response.json();
  if (!Array.isArray(payload.vulnerabilities)) throw new Error('Unexpected CISA KEV response');
  const autoPublishEnabled = env.AUTO_PUBLISH_ENABLED === 'true';
  for (const raw of payload.vulnerabilities) {
    const candidate = candidateFromKev(raw);
    if (candidate) await upsertCandidate(env, source, candidate, autoPublishEnabled, now);
  }
  await updateSourceState(env, source.key, response.headers.get('etag'), response.headers.get('last-modified'), now, null);
}

async function upsertCandidate(env, source, candidate, autoPublishEnabled, now) {
  const decision = publicationDecision(candidate, autoPublishEnabled);
  const contentHash = await sha256(JSON.stringify({
    title: candidate.title,
    summary: candidate.summary,
    recommendedAction: candidate.recommendedAction,
    evidence: candidate.evidence,
    score: candidate.score
  }));
  const id = await sha256(candidate.eventKey);
  const existing = await env.DB.prepare('SELECT id, content_hash, status FROM alerts WHERE event_key = ?').bind(candidate.eventKey).first();
  const desiredStatus = existing?.status === 'published' ? 'published' : decision.status;
  const publishedAt = desiredStatus === 'published' ? now : null;

  await env.DB.prepare(`
    INSERT INTO alerts (
      id, event_key, source_key, source_url, cve_id, title, summary, recommended_action,
      evidence_json, severity_score, status, source_published_at, source_updated_at,
      published_at, content_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_key) DO UPDATE SET
      source_url = excluded.source_url,
      title = excluded.title,
      summary = excluded.summary,
      recommended_action = excluded.recommended_action,
      evidence_json = excluded.evidence_json,
      severity_score = excluded.severity_score,
      source_published_at = excluded.source_published_at,
      source_updated_at = excluded.source_updated_at,
      status = CASE WHEN alerts.status = 'published' THEN 'published' ELSE excluded.status END,
      published_at = CASE WHEN alerts.status = 'published' THEN alerts.published_at ELSE excluded.published_at END,
      content_hash = excluded.content_hash,
      updated_at = excluded.updated_at
  `).bind(
    id, candidate.eventKey, source.key, candidate.sourceUrl, candidate.cveId, candidate.title,
    candidate.summary, candidate.recommendedAction, JSON.stringify(candidate.evidence), candidate.score,
    desiredStatus, candidate.dateAdded || null, candidate.dueDate || null, publishedAt, contentHash, now, now
  ).run();

  if (!existing) await audit(env, id, desiredStatus === 'published' ? 'auto_published' : 'queued_for_review', 'system', { source: source.key, score: candidate.score, reason: decision.reason });
  else if (existing.content_hash !== contentHash) await audit(env, id, 'source_updated', 'system', { source: source.key, score: candidate.score });
}

async function listPublishedAlerts(env) {
  const result = await env.DB.prepare(`SELECT id, cve_id, title, summary, recommended_action, evidence_json, severity_score, source_url, source_updated_at, published_at FROM alerts WHERE status = 'published' ORDER BY published_at DESC LIMIT 50`).all();
  return json({ alerts: result.results.map(publicAlert) }, 200, PUBLIC_CACHE_HEADERS);
}

async function getPublishedAlert(env, id) {
  const row = await env.DB.prepare(`SELECT id, cve_id, title, summary, recommended_action, evidence_json, severity_score, source_url, source_updated_at, published_at FROM alerts WHERE id = ? AND status = 'published'`).bind(id).first();
  return row ? json({ alert: publicAlert(row) }, 200, PUBLIC_CACHE_HEADERS) : json({ error: 'not_found' }, 404);
}

function publicAlert(row) {
  return { id: row.id, cveId: row.cve_id, title: row.title, summary: row.summary, recommendedAction: row.recommended_action, evidence: JSON.parse(row.evidence_json), severityScore: row.severity_score, sourceUrl: row.source_url, sourceUpdatedAt: row.source_updated_at, publishedAt: row.published_at };
}

async function handleAdmin(request, env, url) {
  if (!env.ADMIN_API_TOKEN || request.headers.get('authorization') !== `Bearer ${env.ADMIN_API_TOKEN}`) return json({ error: 'unauthorized' }, 401);
  if (request.method === 'GET' && url.pathname === '/admin/pending') {
    const result = await env.DB.prepare(`SELECT id, cve_id, title, summary, recommended_action, evidence_json, severity_score, source_url, source_updated_at, created_at FROM alerts WHERE status = 'pending_review' ORDER BY severity_score DESC, created_at DESC LIMIT 100`).all();
    return json({ alerts: result.results.map(publicAlert) });
  }
  return json({ error: 'not_found' }, 404);
}

async function updateSourceState(env, sourceKey, etag, lastModified, now, error) {
  await env.DB.prepare(`INSERT INTO source_state (source_key, etag, last_modified, last_fetched_at, last_success_at, last_error) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(source_key) DO UPDATE SET etag = excluded.etag, last_modified = excluded.last_modified, last_fetched_at = excluded.last_fetched_at, last_success_at = excluded.last_success_at, last_error = excluded.last_error`).bind(sourceKey, etag, lastModified, now, error ? null : now, error).run();
}

async function recordSourceFailure(env, sourceKey, error) {
  const now = new Date().toISOString();
  await updateSourceState(env, sourceKey, null, null, now, String(error).slice(0, 500));
  await audit(env, null, 'source_fetch_failed', 'system', { source: sourceKey, message: String(error).slice(0, 500) });
}

async function audit(env, alertId, action, actor, detail) {
  await env.DB.prepare('INSERT INTO audit_events (alert_id, action, actor, detail_json, created_at) VALUES (?, ?, ?, ?, ?)').bind(alertId, action, actor, JSON.stringify(detail), new Date().toISOString()).run();
}

function json(body, status = 200, headers = JSON_HEADERS) {
  return new Response(JSON.stringify(body), { status, headers });
}
