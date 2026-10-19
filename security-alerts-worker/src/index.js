import { SOURCES, candidateFromKev, sha256, shouldMonitorKevRecord } from './policy.js';
import { adminPage, alertsPage } from './pages.js';
import { authenticateAdmin } from './auth.js';
import { localizedBulletin } from './localization.js';
import { buildSocialDraft, sendSocialDraft, ensureSocialStorage } from './social.js';
import { checkBufferConnection } from './buffer-connection.js';
import { officialGuidance } from './guidance.js';
import { runSocialSchedule, ensureScheduleStorage } from './scheduler.js';
import { DATABASE_SOURCES, ingestAdvisories, collectionStatus, databaseRecords, readLimited } from './database.js';
import {databaseAdminPage,saveReviewedIncident} from './database-admin.js';
import {storeCandidates} from './database-store.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
// Withdrawal must become visible immediately, including to browser clients.
const PUBLIC_CACHE_HEADERS = JSON_HEADERS;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if(request.method==='GET' && url.pathname==='/v1/database/status') return json(await collectionStatus(env));
    if(request.method==='GET' && url.pathname==='/v1/database') return json({collection:await collectionStatus(env),incidents:await databaseRecords(env)});
    if (url.pathname === '/admin') return Response.redirect(`${url.origin}/admin/`, 302);
    if (request.method === 'GET' && url.pathname === '/admin/') {
      if ((env.ACCESS_TEAM_DOMAIN || env.ACCESS_AUD) && !await authenticateAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
      return html(adminPage);
    }
    if (request.method === 'GET' && url.pathname === '/alerts') return html(alertsPage);
    if (request.method === 'GET' && url.pathname === '/healthz') return json({ ok: true });
    if (request.method === 'GET' && url.pathname === '/v1/alerts') return listPublishedAlerts(env);
    if (request.method === 'GET' && url.pathname.startsWith('/v1/digests/')) {
      const id=url.pathname.slice('/v1/digests/'.length);
      if(!/^[a-f0-9]{64}$/.test(id))return json({error:'invalid_id'},400);
      let run;try{run=await env.DB.prepare('SELECT alert_ids_json FROM social_runs WHERE id = ?').bind(id).first()}catch{return json({error:'not_found'},404)}
      if(!run)return json({error:'not_found'},404);
      const ids=JSON.parse(run.alert_ids_json);
      if(!Array.isArray(ids)||!ids.length||ids.length>10||!ids.every(value=>/^[a-f0-9]{64}$/.test(value)))return json({error:'not_found'},404);
      const result=await env.DB.prepare("SELECT * FROM alerts WHERE status = 'published' AND id IN ("+ids.map(()=>'?').join(',')+") ORDER BY published_at DESC").bind(...ids).all();
      return json({alerts:result.results.map(publicAlert)});
    }
    if (request.method === 'GET' && url.pathname.startsWith('/v1/alerts/')) return getPublishedAlert(env, url.pathname.slice('/v1/alerts/'.length));
    if (url.pathname.startsWith('/admin/')) return handleAdmin(request, env, url);
    return json({ error: 'not_found' }, 404);
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runMonitor(env,_controller.scheduledTime));
  }
};

export async function runMonitor(env,scheduledTime=Date.now()) {
  const runId=crypto.randomUUID();const started=new Date().toISOString();const outcomes=[];
  await env.DB.prepare("INSERT INTO collection_runs(id,started_at,status) VALUES(?,?,'running')").bind(runId,started).run();
  for (const source of SOURCES) {
    try {
      if (source.key === 'cisa-kev') await ingestCisaKev(env, source);
      outcomes.push({name:source.name,key:source.key,status:'success'});
    } catch (error) {
      outcomes.push({name:source.name,key:source.key,status:'failed'});
      try{await recordSourceFailure(env, source.key, error);}catch{/* Preserve the run outcome even if failure auditing is unavailable. */}
    }
  }
  try{await ingestAdvisories(env);outcomes.push({name:DATABASE_SOURCES[1].name,key:'jpcert',status:'success'});}
  catch{outcomes.push({name:DATABASE_SOURCES[1].name,key:'jpcert',status:'failed'});}
  const count=outcomes.filter(s=>s.status==='success').length;
  const status=count===outcomes.length?'success':count?'partial':'failed';
  await env.DB.prepare('UPDATE collection_runs SET status=?,completed_at=?,sources_json=? WHERE id=?').bind(status,new Date().toISOString(),JSON.stringify(outcomes),runId).run();
  // A failed/partial collection is never interpreted as an empty news day.
  if(status!=='success')return;
  try{await runSocialSchedule(env,scheduledTime)}catch{await audit(env,null,'social_schedule_failed','system',{reason:'connection_or_storage_failure'})}
}

async function ingestCisaKev(env, source) {
  const savedState = await env.DB.prepare('SELECT etag, last_modified, last_success_at FROM source_state WHERE source_key = ?').bind(source.key).first();
  const headers = { accept: 'application/json' };
  if (savedState?.etag) headers['if-none-match'] = savedState.etag;
  if (savedState?.last_modified) headers['if-modified-since'] = savedState.last_modified;
  const response = await fetch(source.url, { headers, signal: AbortSignal.timeout(15_000), redirect:'error' });
  const now = new Date().toISOString();

  const needsBackfill=await env.DB.prepare("SELECT id FROM collection_runs WHERE status='success' LIMIT 1").first();
  if (response.status === 304 && needsBackfill) {
    await updateSourceState(env, source.key, savedState?.etag ?? null, savedState?.last_modified ?? null, now, null);
    return;
  }
  if (!response.ok&&response.status!==304) throw new Error(`${source.key} returned HTTP ${response.status}`);

  // Ignore old conditional headers for the first historical import.
  const payload = JSON.parse(await readLimited(response.status===304?await fetch(source.url,{signal:AbortSignal.timeout(15000),redirect:'error'}):response));
  if (!Array.isArray(payload.vulnerabilities)||!payload.vulnerabilities.length||payload.vulnerabilities.some(raw=>!candidateFromKev(raw)||!/^\d{4}-\d{2}-\d{2}$/.test(raw.dateAdded))) throw new Error('Unexpected CISA KEV response');
  const records=[];
  for(const raw of payload.vulnerabilities){
    if(!shouldMonitorKevRecord(raw,null,new Date(now),90)&&raw.knownRansomwareCampaignUse!=='Known')continue;
    const c=candidateFromKev(raw);const id=await sha256(c.eventKey);
    const hash=await sha256(JSON.stringify([c.title,c.summary,c.recommendedAction,c.evidence,c.dueDate]));
    records.push({id,eventKey:c.eventKey,sourceKey:source.key,sourceUrl:c.sourceUrl,sourceName:source.name,cve:c.cveId,title:c.title,summary:c.summary,action:c.recommendedAction,evidence:JSON.stringify(c.evidence),score:c.score,status:env.AUTO_PUBLISH_ENABLED==='true'?'published':'pending_review',publishedAt:c.dateAdded,sourceUpdatedAt:null,stamp:now,hash,organization:c.vendorProject,attackType:raw.knownRansomwareCampaignUse==='Known'?'ランサムウェア':'脆弱性',severity:'高',severityReason:'CISAが実悪用を確認した脆弱性。CVSS・被害規模は未確認',urgency:3,urgencyReason:'実悪用が確認され、利用対象なら公式の更新・回避策を確認する必要があります。現在進行中の攻撃の断定ではありません',state:'注意',damage:'実悪用確認済み。被害組織・規模・発生日は不明',responseStatus:'CISAの対処案内あり。利用者の対策状況は不明。CISA対策期限：'+(c.dueDate||'不明'),confirmation:'脆弱性の実悪用は公式確認済み。個別被害は未確認'});
  }
  await storeCandidates(env,records,now);
  await updateSourceState(env,source.key,response.headers.get('etag'),response.headers.get('last-modified'),new Date().toISOString(),null);
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
  return { id: row.id, informationKind:row.source_published_at&&Date.now()-Date.parse(row.source_published_at)>7*86400000?'history':'advisory', cveId: row.cve_id, title: row.title, summary: row.summary, recommendedAction: row.recommended_action, evidence: JSON.parse(row.evidence_json), severityScore: row.severity_score, sourceUrl: row.source_url, sourceUpdatedAt: row.source_updated_at, publishedAt: row.published_at, languages: localizedBulletin(row), officialGuidance: officialGuidance(row) };
}

async function handleAdmin(request, env, url) {
  const identity = await authenticateAdmin(request, env);
  if (!identity) return json({ error: 'unauthorized' }, 401);
  if(request.method==='GET'&&url.pathname==='/admin/database')return html(databaseAdminPage);
  if(request.method==='POST'&&url.pathname==='/admin/database'){
    if(env.REVIEW_ACTIONS_ENABLED!=='true')return json({error:'review_actions_disabled'},403);
    if(request.headers.get('origin')!==url.origin||request.headers.get('content-type')!=='application/json')return json({error:'invalid_request'},403);
    const raw=await request.text();if(raw.length>50000)return json({error:'request_too_large'},413);
    let body;try{body=JSON.parse(raw)}catch{return json({error:'invalid_json'},400)}
    try{return json(await saveReviewedIncident(env,body,identity.actor))}catch(error){return json({error:/^(invalid_|required_)/.test(error.message)?error.message:'save_failed'},400)}
  }
  if(request.method==='POST'&&url.pathname==='/admin/social-emergency'){
   if(request.headers.get('origin')!==url.origin||request.headers.get('content-type')!=='application/json')return json({error:'invalid_request'},403);
   if((await request.text()).length>32)return json({error:'request_too_large'},413);
   const now=Date.now();const day=new Date(now+9*3600000).toISOString().slice(0,10);
   await audit(env,null,'emergency_social_requested',identity.actor,{day});
   try{return json(await runSocialSchedule(env,now,now,fetch,{day,slot:'emergency'}))}
   catch{return json({error:'social_emergency_failed'},502)}
  }
  if(request.method==='POST'&&url.pathname==='/admin/schedule-check'){
   if(request.headers.get('origin')!==url.origin||request.headers.get('content-type')!=='application/json')return json({error:'invalid_request'},403);
   await ensureScheduleStorage(env.DB);
   const connection=await checkBufferConnection(env);
   const channels=connection.channels.filter(c=>c.name===env.BUFFER_ALLOWED_ACCOUNT);
   const runs=await env.DB.prepare('SELECT day,slot,platform,status,created_at FROM social_runs ORDER BY created_at DESC LIMIT 10').all();
   return json({enabled:env.SOCIAL_AUTO_ENABLED==='true',times:['08:00','18:00'],timezone:'Asia/Tokyo',emergency:'admin_approved_once_daily',startAt:env.SOCIAL_START_AT,channels:channels.map(c=>({platform:c.platform,name:c.name,queuePaused:c.queuePaused})),runs:runs.results});
  }
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
