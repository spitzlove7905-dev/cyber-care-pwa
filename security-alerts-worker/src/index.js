import { SOURCES, candidateFromKev, publicationDecision, sha256, shouldMonitorKevRecord } from './policy.js';
import { adminPage, alertsPage } from './pages.js';
import { authenticateAdmin } from './auth.js';
import { localizedBulletin } from './localization.js';
import { buildSocialDraft, sendSocialDraft, ensureSocialStorage } from './social.js';
import { checkBufferConnection } from './buffer-connection.js';
import { officialGuidance } from './guidance.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
// Withdrawal must become visible immediately, including to browser clients.
const PUBLIC_CACHE_HEADERS = JSON_HEADERS;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/admin') return Response.redirect(`${url.origin}/admin/`, 302);
    if (request.method === 'GET' && url.pathname === '/admin/') {
      if ((env.ACCESS_TEAM_DOMAIN || env.ACCESS_AUD) && !await authenticateAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
      return html(adminPage);
    }
    if (request.method === 'GET' && url.pathname === '/alerts') return html(alertsPage);
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
  const savedState = await env.DB.prepare('SELECT etag, last_modified, last_success_at FROM source_state WHERE source_key = ?').bind(source.key).first();
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
    if (!shouldMonitorKevRecord(raw, savedState?.last_success_at, new Date(now))) continue;
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
  // Reviewed decisions persist. A source refresh must never republish a rejection.
  const desiredStatus = existing && existing.status !== 'pending_review' ? existing.status : decision.status;
  // Freeze reviewed text until a separate revision review workflow is available.
  if (existing && existing.status !== 'pending_review') return;
  if (existing?.content_hash === contentHash && existing.status === desiredStatus) return;
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
  return { id: row.id, cveId: row.cve_id, title: row.title, summary: row.summary, recommendedAction: row.recommended_action, evidence: JSON.parse(row.evidence_json), severityScore: row.severity_score, sourceUrl: row.source_url, sourceUpdatedAt: row.source_updated_at, publishedAt: row.published_at, languages: localizedBulletin(row), officialGuidance: officialGuidance(row) };
}

async function handleAdmin(request, env, url) {
  const identity = await authenticateAdmin(request, env);
  if (!identity) return json({ error: 'unauthorized' }, 401);
  if (request.method === 'POST' && url.pathname === '/admin/social-draft') {
    if (request.headers.get('origin') !== url.origin || request.headers.get('content-type') !== 'application/json') return json({ error: 'invalid_request' }, 403);
    if (env.BUFFER_DRAFTS_ENABLED !== 'true' || !env.BUFFER_API_TOKEN) return json({ error: 'drafts_disabled' }, 403);
    const raw = await request.text();
    if (raw.length > 512) return json({ error: 'request_too_large' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
    if (!body || !/^[a-f0-9]{64}$/.test(body.id || '') || !/^[a-f0-9]{64}$/.test(body.contentHash || '') || !['x','threads'].includes(body.platform) || !['ja','en'].includes(body.language)) return json({ error: 'invalid_request' }, 400);
    try {
      const connection = await checkBufferConnection(env);
      const matches = connection.channels.filter(channel => channel.platform === body.platform && channel.name === env.BUFFER_ALLOWED_ACCOUNT);
      if (matches.length !== 1) return json({ error: 'channel_selection_required' }, 409);
      const row = await env.DB.prepare("SELECT * FROM alerts WHERE id = ? AND status = 'published' AND content_hash = ?").bind(body.id, body.contentHash).first();
      if (!row) return json({ error: 'changed_or_not_published' }, 409);
      await ensureSocialStorage(env.DB);
      return json(await sendSocialDraft({ ...env, BUFFER_SEND_ENABLED: 'true', BUFFER_CHANNELS_JSON: JSON.stringify({ [body.platform]: matches[0].id }) }, row, body.platform, body.language, identity.actor));
    } catch (error) {
      const known = ['already_submitted_or_daily_limit','buffer_needs_manual_check','buffer_auth_failed','buffer_rate_limited'];
      return json({ error: known.includes(error.message) ? error.message : 'buffer_draft_failed' }, error.message === 'already_submitted_or_daily_limit' ? 409 : 502);
    }
  }
  if (request.method === 'POST' && url.pathname === '/admin/social-connection') {
    if (request.headers.get('origin') !== url.origin || request.headers.get('content-type') !== 'application/json') return json({ error: 'invalid_request' }, 403);
    if ((await request.text()).length > 32) return json({ error: 'request_too_large' }, 413);
    try { return json(await checkBufferConnection(env)); }
    catch (error) {
      const safe = ['buffer_auth_failed', 'buffer_rate_limited', 'buffer_organization_selection_required'];
      return json({ error: safe.includes(error.message) ? error.message : 'buffer_connection_failed' }, 502);
    }
  }
  if (request.method === 'GET' && url.pathname === '/admin/social-drafts') {
    const id = url.searchParams.get('id') || '';
    const language = url.searchParams.get('lang') || 'ja';
    if (!/^[a-f0-9]{64}$/.test(id) || !['ja','en'].includes(language)) return json({ error: 'invalid_request' }, 400);
    const row = await env.DB.prepare("SELECT * FROM alerts WHERE id = ? AND status = 'published'").bind(id).first();
    if (!row) return json({ error: 'not_found' }, 404);
    // Read-only preview. This route never calls Buffer or changes publication state.
    return json({ drafts: ['x','threads'].map(platform => buildSocialDraft(row, platform, language)), sendingEnabled: false, draftsEnabled: env.BUFFER_DRAFTS_ENABLED === 'true' && Boolean(env.BUFFER_API_TOKEN) });
  }
  if (request.method === 'GET' && url.pathname === '/admin/preview') return html(alertsPage);
  if (request.method === 'GET' && url.pathname.startsWith('/admin/preview-data/')) {
    const id = url.pathname.slice('/admin/preview-data/'.length);
    if (!/^[a-f0-9]{64}$/.test(id)) return json({ error: 'invalid_id' }, 400);
    const row = await env.DB.prepare('SELECT * FROM alerts WHERE id = ?').bind(id).first();
    return row ? json({ alert: publicAlert(row) }) : json({ error: 'not_found' }, 404);
  }
  if (request.method === 'GET' && url.pathname === '/admin/status') return json({ reviewActionsEnabled: env.REVIEW_ACTIONS_ENABLED === 'true', serverTime: new Date().toISOString() });
  if (request.method === 'GET' && url.pathname === '/admin/published') {
    const result = await env.DB.prepare("SELECT * FROM alerts WHERE status = 'published' ORDER BY published_at DESC LIMIT 100").all();
    return json({ alerts: result.results.map(row => ({ ...publicAlert(row), contentHash: row.content_hash })) });
  }
  if (request.method === 'GET' && url.pathname === '/admin/audit') {
    const result = await env.DB.prepare('SELECT alert_id, action, actor, created_at FROM audit_events ORDER BY id DESC LIMIT 100').all();
    return json({ events: result.results });
  }
  if (request.method === 'GET' && url.pathname === '/admin/pending') {
    if (url.searchParams.has('snapshot')) {
      const snapshot = url.searchParams.get('snapshot');
      const cursor = url.searchParams.get('cursor') || '';
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(snapshot) || !Number.isFinite(Date.parse(snapshot)) || (cursor && !/^[a-f0-9]{64}$/.test(cursor))) return json({ error: 'invalid_cursor' }, 400);
      const result = await env.DB.prepare("SELECT * FROM alerts WHERE status = 'pending_review' AND created_at <= ? AND id > ? ORDER BY id LIMIT 100").bind(snapshot, cursor).all();
      return json({ alerts: result.results.map(row => ({ ...publicAlert(row), contentHash: row.content_hash })), nextCursor: result.results.length === 100 ? result.results.at(-1).id : null });
    }
    const result = await env.DB.prepare(`SELECT id, cve_id, title, summary, recommended_action, evidence_json, severity_score, source_url, source_updated_at, created_at, content_hash FROM alerts WHERE status = 'pending_review' ORDER BY severity_score DESC, created_at DESC LIMIT 100`).all();
    return json({ alerts: result.results.map(row => ({ ...publicAlert(row), contentHash: row.content_hash })) });
  }
  if (request.method === 'POST' && url.pathname === '/admin/review') {
    if (env.REVIEW_ACTIONS_ENABLED !== 'true') return json({ error: 'review_actions_disabled' }, 403);
    if (request.headers.get('origin') !== url.origin || request.headers.get('content-type') !== 'application/json') return json({ error: 'invalid_request' }, 403);
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: 'request_too_large' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
    if (!/^[a-f0-9]{64}$/.test(body.id || '') || !/^[a-f0-9]{64}$/.test(body.contentHash || '') || !['published', 'rejected', 'withdrawn'].includes(body.status)) return json({ error: 'invalid_review' }, 400);
    const now = new Date().toISOString();
    const previousStatus = body.status === 'withdrawn' ? 'published' : 'pending_review';
    // Batch is transactional; the audit INSERT only sees the matching update.
    const results = await env.DB.batch([
      env.DB.prepare("UPDATE alerts SET status = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ?, published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END WHERE id = ? AND content_hash = ? AND status = ?").bind(body.status, now, identity.actor, now, body.status, now, body.id, body.contentHash, previousStatus),
      env.DB.prepare("INSERT INTO audit_events (alert_id, action, actor, detail_json, created_at) SELECT ?, ?, ?, ?, ? WHERE changes() = 1").bind(body.id, body.status === 'published' ? 'manually_published' : body.status, identity.actor, JSON.stringify({ contentHash: body.contentHash }), now)
    ]);
    return results[0].meta.changes === 1 ? json({ ok: true }) : json({ error: 'changed_or_already_reviewed' }, 409);
  }
  return json({ error: 'not_found' }, 404);
}

async function updateSourceState(env, sourceKey, etag, lastModified, now, error) {
  await env.DB.prepare(`INSERT INTO source_state (source_key, etag, last_modified, last_fetched_at, last_success_at, last_error) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(source_key) DO UPDATE SET etag = COALESCE(excluded.etag, source_state.etag), last_modified = COALESCE(excluded.last_modified, source_state.last_modified), last_fetched_at = excluded.last_fetched_at, last_success_at = COALESCE(excluded.last_success_at, source_state.last_success_at), last_error = excluded.last_error`).bind(sourceKey, etag, lastModified, now, error ? null : now, error).run();
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

function html(body) {
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
}
