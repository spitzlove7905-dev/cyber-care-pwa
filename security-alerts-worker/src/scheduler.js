import twitterText from 'twitter-text';
import { checkBufferConnection } from './buffer-connection.js';
import { sha256 } from './policy.js';

const SOURCE='https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
export const SCHEDULE_SCHEMA=[
 "CREATE TABLE IF NOT EXISTS social_runs (id TEXT PRIMARY KEY, day TEXT NOT NULL, slot TEXT NOT NULL, platform TEXT NOT NULL, status TEXT NOT NULL, alert_ids_json TEXT NOT NULL, post_text TEXT NOT NULL, buffer_post_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(day,slot,platform))",
 "CREATE TABLE IF NOT EXISTS social_run_items (alert_id TEXT NOT NULL REFERENCES alerts(id), platform TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES social_runs(id), PRIMARY KEY(alert_id,platform))"
];
export async function ensureScheduleStorage(db){await db.batch(SCHEDULE_SCHEMA.map(sql=>db.prepare(sql)));}

export function scheduledSlot(time){
 const date=new Date(time+9*3600000);if(!Number.isFinite(date.getTime())||date.getUTCMinutes()!==0)return null;
 const hour=date.getUTCHours();return hour===8?{day:date.toISOString().slice(0,10),slot:'morning'}:hour===18?{day:date.toISOString().slice(0,10),slot:'evening'}:null;
}
export function eligibleForSocial(row){
 let evidence;try{evidence=JSON.parse(row.evidence_json)}catch{return false}
 return row.status==='published'&&row.source_url===SOURCE&&row.severity_score>=70&&Array.isArray(evidence)&&evidence.includes('CISA KEV掲載')&&evidence.includes('公的機関が実悪用を確認')&&Boolean(row.recommended_action);
}
export function digestText(rows,id){
 const url='https://cyber-care-security-alerts.spitz-love-7905.workers.dev/alerts?digest='+id;
 const shown=rows.slice(0,2).map(row=>row.cve_id).join(' / ');
 const text='【セキュリティ速報】新着'+rows.length+'件\n'+shown+(rows.length>2?' ほか':'')+'\n\n速報の詳細はこちら ↓\n'+url+'\n\n記録・相談準備を支えるCyber Careは、プロフィールのリンクから。';
 if(!twitterText.parseTweet(text).valid||Array.from(text).length>450)throw Error('digest_too_long');
 return text;
}
async function submit(env,channelId,text,fetcher){
 const query='mutation { createPost(input: { text: '+JSON.stringify(text)+', channelId: '+JSON.stringify(channelId)+', schedulingType: automatic, mode: shareNow }) { ... on PostActionSuccess { post { id } } ... on MutationError { message } } }';
 const response=await fetcher('https://api.buffer.com',{method:'POST',headers:{authorization:'Bearer '+env.BUFFER_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('social_submission_unconfirmed');
 const body=await response.json();const id=body.data?.createPost?.post?.id;
 if(body.errors?.length||typeof id!=='string'||!id)throw Error('social_submission_unconfirmed');
 return id;
}
export async function runSocialSchedule(env,time=Date.now(),now=Date.now(),fetcher=fetch,override=null){
 if(env.SOCIAL_AUTO_ENABLED!=='true'||!env.BUFFER_API_TOKEN)return {status:'disabled'};
 const slot=override||scheduledSlot(time);
 // Do not replay old cron deliveries at an unrelated time.
 if(!slot||Math.abs(now-time)>10*60000)return {status:'outside_schedule'};
 const start=Date.parse(env.SOCIAL_START_AT||'');if(!Number.isFinite(start)||time<start)return {status:'not_started'};
 await ensureScheduleStorage(env.DB);
 const pending=[];
 for(const platform of ['x','threads']){
  const prior=await env.DB.prepare('SELECT id FROM social_runs WHERE day = ? AND slot = ? AND platform = ?').bind(slot.day,slot.slot,platform).first();
  if(prior)continue;
  const result=await env.DB.prepare("SELECT a.* FROM alerts a WHERE a.status = 'published' AND a.published_at >= ? AND a.published_at <= ? AND NOT EXISTS (SELECT 1 FROM social_run_items i WHERE i.alert_id = a.id AND i.platform = ?) ORDER BY a.published_at, a.id LIMIT 50").bind(env.SOCIAL_START_AT,new Date(now).toISOString(),platform).all();
  const rows=result.results.filter(eligibleForSocial).slice(0,10);if(rows.length)pending.push({platform,rows});
 }
 if(!pending.length)return {status:'no_new_alerts'};
 const connection=await checkBufferConnection(env,fetcher);const results=[];
 for(const {platform,rows} of pending){
  const matches=connection.channels.filter(c=>c.platform===platform&&c.name===env.BUFFER_ALLOWED_ACCOUNT);
  if(matches.length!==1||matches[0].queuePaused){results.push({platform,status:'channel_unavailable'});continue}
  const id=await sha256(slot.day+':'+slot.slot+':'+platform);const text=digestText(rows,id);const stamp=new Date(now).toISOString();
  const claim=await env.DB.prepare("INSERT OR IGNORE INTO social_runs (id,day,slot,platform,status,alert_ids_json,post_text,created_at,updated_at) SELECT ?,?,?,?,'sending',?,?,?,? WHERE (SELECT COUNT(*) FROM social_runs WHERE day = ? AND platform = ?) < 3").bind(id,slot.day,slot.slot,platform,JSON.stringify(rows.map(r=>r.id)),text,stamp,stamp,slot.day,platform).run();
  if(claim.meta.changes!==1)continue;
  // Reserve bulletin identities before sending. Unknown outcomes are never auto-retried.
  await env.DB.batch(rows.map(row=>env.DB.prepare('INSERT OR IGNORE INTO social_run_items (alert_id,platform,run_id) VALUES (?,?,?)').bind(row.id,platform,id)));
  // Recheck withdrawal immediately before the external write.
  const valid=await env.DB.prepare("SELECT id FROM alerts WHERE status = 'published' AND id IN ("+rows.map(()=>'?').join(',')+")").bind(...rows.map(r=>r.id)).all();
  if(valid.results.length!==rows.length){
   await env.DB.prepare("UPDATE social_runs SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(stamp,id).run();results.push({platform,status:'cancelled'});continue;
  }
  let postId;
  try{postId=await submit(env,matches[0].id,text,fetcher)}
  catch{
   await env.DB.prepare("UPDATE social_runs SET status = 'needs_check', updated_at = ? WHERE id = ?").bind(stamp,id).run();
   await env.DB.prepare("INSERT INTO audit_events (alert_id,action,actor,detail_json,created_at) VALUES (NULL,'social_auto_needs_check','system',?,?)").bind(JSON.stringify({platform,run:id}),stamp).run();
   results.push({platform,status:'needs_check'});continue;
  }
  await env.DB.batch([
   env.DB.prepare("UPDATE social_runs SET status = 'submitted', buffer_post_id = ?, updated_at = ? WHERE id = ?").bind(postId,stamp,id),
   env.DB.prepare("INSERT INTO audit_events (alert_id,action,actor,detail_json,created_at) VALUES (NULL,'social_auto_submitted','system',?,?)").bind(JSON.stringify({platform,run:id,count:rows.length}),stamp)
  ]);results.push({platform,status:'submitted'});
 }
 return {status:'processed',results};
}
