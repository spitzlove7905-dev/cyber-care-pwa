import twitterText from 'twitter-text';
import { localizedBulletin } from './localization.js';

const ORIGIN = 'https://cyber-care-security-alerts.spitz-love-7905.workers.dev';

export function buildSocialDraft(row, platform, language = 'ja') {
  if (!['x', 'threads', 'facebook'].includes(platform) || !['ja', 'en'].includes(language)) throw new Error('unsupported_channel');
  if (row.status !== 'published') throw new Error('alert_not_published');
  const content = localizedBulletin(row)[language];
  const link = `${ORIGIN}/alerts?id=${encodeURIComponent(row.id)}`;
  let text;
  if (platform === 'x') {
    const tail = language === 'ja' ? `\n速報の詳細を見る（日本語 / English）\nCyber Care\n${link}` : `\nView alert details (日本語 / English)\nCyber Care\n${link}`;
    const prefix = language === 'ja' ? '【セキュリティ速報】\n' : 'Security alert\n';
    // Preserve the complete CVE and link; shorten only the descriptive title.
    const suffix = `\n${row.cve_id || ''}${tail}`;
    let title = content.title;
    const graphemes = [...new Intl.Segmenter(language, { granularity: 'grapheme' }).segment(title)].map(s => s.segment).slice(0, 280);
    if (graphemes.join('') !== title) title = graphemes.join('') + '…';
    text = prefix + title + suffix;
    while (!twitterText.parseTweet(text).valid && graphemes.length) {
      graphemes.pop();title=graphemes.join('')+'…';text=prefix+title+suffix;
    }
    if (!twitterText.parseTweet(text).valid) throw new Error('post_too_long');
  } else if (platform === 'threads') {
    const prefix = language === 'ja' ? '【セキュリティ速報】\n' : 'Security alert\n';
    const suffix = `\n${row.cve_id || ''}\n${language === 'ja' ? '速報の詳細を見る（日本語 / English）' : 'View alert details (日本語 / English)'}\nCyber Care\n${link}`;
    // Conservative total budget, including the full URL. Preserve CVE and link.
    const segments = [...new Intl.Segmenter(language, { granularity: 'grapheme' }).segment(content.title)].map(s => s.segment);
    let title = content.title;
    while (Array.from(prefix + title + suffix).length > 450 && segments.length) {
      segments.pop(); title = segments.join('') + '…';
    }
    text = prefix + title + suffix;
    if (Array.from(text).length > 450) throw new Error('post_too_long');
  } else {
    const labels = language === 'ja' ? ['対象の人','どんな問題か','今すること'] : ['Who this affects','What happened','What to do now'];
    text = `${content.title}\n\n${labels[0]}: ${content.target}\n\n${labels[1]}: ${content.issue}\n\n${labels[2]}: ${content.action}\n\n${row.cve_id || ''}\n${language === 'ja' ? '詳細は日本語 / Englishで確認できます。困ったときの記録・相談準備にはCyber Careを。' : 'Read details in English or Japanese. Cyber Care helps you prepare notes and organize a request for support.'}\n${link}`;
  }
  return { platform, language, text, link, weightedLength: platform === 'x' ? twitterText.parseTweet(text).weightedLength : null };
}

export async function createBufferDraft(text, channelId, token, fetcher = fetch) {
  // No immediate-publication or scheduling mode is exposed here.
  const query = `mutation { createPost(input: { text: ${JSON.stringify(text)}, channelId: ${JSON.stringify(channelId)}, schedulingType: automatic, mode: addToQueue, saveToDraft: true }) { ... on PostActionSuccess { post { id } } ... on MutationError { message } } }`;
  const response = await fetcher('https://api.buffer.com', {
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({query}),signal:AbortSignal.timeout(15000)
  });
  if (response.status === 429) throw new Error('buffer_rate_limited');
  if (!response.ok) throw new Error('buffer_request_failed');
  const result = await response.json();
  const id = result.data?.createPost?.post?.id;
  if (result.errors?.length || typeof id !== 'string' || !id) throw new Error('buffer_outcome_unconfirmed');
  return id;
}

export async function sendSocialDraft(env, row, platform, language, actor, fetcher = fetch) {
  if (env.BUFFER_SEND_ENABLED !== 'true' || !env.BUFFER_API_TOKEN) throw new Error('buffer_not_configured');
  const channels = JSON.parse(env.BUFFER_CHANNELS_JSON || '{}');
  const channelId = channels[platform];
  if (typeof channelId !== 'string' || !channelId) throw new Error('channel_not_configured');
  const draft = buildSocialDraft(row, platform, language);
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now()-86400000).toISOString();
  // One receipt per bulletin/channel, irrespective of chosen language.
  // Keep a conservative five-request daily cap until actual quotas are checked.
  const claim = await env.DB.prepare("INSERT OR IGNORE INTO social_deliveries (alert_id, channel_id, platform, language, content_hash, status, created_at, updated_at) SELECT ?, ?, ?, ?, ?, 'sending', ?, ? WHERE (SELECT COUNT(*) FROM social_deliveries WHERE created_at >= ?) < 5").bind(row.id,channelId,platform,language,row.content_hash,now,now,cutoff).run();
  if (!claim.meta.changes) throw new Error('already_submitted_or_daily_limit');
  let bufferId;
  try { bufferId = await createBufferDraft(draft.text,channelId,env.BUFFER_API_TOKEN,fetcher); }
  catch {
    // A timeout can occur after Buffer accepted the draft. Never auto-retry.
    await env.DB.prepare("UPDATE social_deliveries SET status = 'needs_check', updated_at = ? WHERE alert_id = ? AND channel_id = ?").bind(now,row.id,channelId).run();
    throw new Error('buffer_needs_manual_check');
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE social_deliveries SET status = 'draft_created', buffer_post_id = ?, updated_at = ? WHERE alert_id = ? AND channel_id = ?").bind(bufferId,now,row.id,channelId),
    env.DB.prepare("INSERT INTO audit_events (alert_id, action, actor, detail_json, created_at) VALUES (?, 'buffer_draft_created', ?, ?, ?)").bind(row.id,actor,JSON.stringify({platform,language,text:draft.text,contentHash:row.content_hash}),now)
  ]);
  return { ok:true, status:'draft_created', platform, language };
}

// Additive, idempotent initialization matching migration 0002; no existing data is changed.
export async function ensureSocialStorage(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS social_deliveries (alert_id TEXT NOT NULL REFERENCES alerts(id), channel_id TEXT NOT NULL, platform TEXT NOT NULL CHECK(platform IN ('x','threads','facebook')), language TEXT NOT NULL CHECK(language IN ('ja','en')), content_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('sending','draft_created','needs_check')), buffer_post_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(alert_id, channel_id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS social_deliveries_created ON social_deliveries(created_at)")
  ]);
}
