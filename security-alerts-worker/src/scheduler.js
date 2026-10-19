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
export function digestText(rows,id,kind='new'){
 const url='https://cyber-care-security-alerts.spitz-love-7905.workers.dev/alerts?digest='+id;
 const shown=rows.slice(0,2).map(row=>row.cve_id||'公的注意喚起').join(' / ');
 const product=(rows[0].title||'製品の安全情報').replace(/^【重要】/,'').replace(/の脆弱性（CVE-\d{4}-\d+）$/,'');
 const headline=Array.from(product).slice(0,28).join('')+(Array.from(product).length>28?'…':'')+(rows.length>1?' ほか':'');
 const label=kind==='history'?'【過去の重大事件・注意喚起】'+rows.length+'件（新着速報ではありません）':kind==='update'?'【重大セキュリティ情報の更新】'+rows.length+'件':'【セキュリティ速報】新着'+rows.length+'件';
 const text=label+'\n'+headline+'\n'+shown+(rows.length>2?' ほか':'')+'\n\n速報の詳細はこちら ↓\n'+url+'\n\n記録・相談準備を支えるCyber Careは、プロフィールのリンクから。';
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
 const collection=await env.DB.prepare('SELECT status,completed_at FROM collection_runs ORDER BY started_at DESC,id DESC LIMIT 1').first();
 if(collection?.status!=='success'||!collection.completed_at||now-Date.parse(collection.completed_at)>30*60000||Date.parse(collection.completed_at)>now+60000)return {status:'collection_unavailable'};
 const pending=[];
 for(const platform of ['x','threads']){
  const prior=await env.DB.prepare('SELECT id FROM social_runs WHERE day = ? AND slot = ? AND platform = ?').bind(slot.day,slot.slot,platform).first();
  if(prior)continue;
  const result=await env.DB.prepare(`SELECT a.*,d.urgency,d.severity,d.incident_state FROM alerts a JOIN incident_details d ON d.alert_id=a.id
   WHERE a.status='published' AND a.source_published_at>=? AND a.source_published_at<=? AND a.published_at>=?
   AND NOT EXISTS(SELECT 1 FROM social_run_items i WHERE i.alert_id=a.id AND i.platform=?)
   ORDER BY d.urgency DESC,a.source_published_at DESC LIMIT 50`).bind(new Date(now-7*86400000).toISOString().slice(0,10),new Date(now).toISOString(),env.SOCIAL_START_AT,platform).all();
  let rows=result.results.filter(eligibleForDatabaseSocial).slice(0,5);let kind='new';
  if(!rows.length){
   const updates=await env.DB.prepare(`SELECT a.*,d.urgency,d.severity,d.incident_state FROM alerts a JOIN incident_details d ON d.alert_id=a.id
    WHERE a.status='published' AND a.updated_at>=? AND a.source_published_at>=? AND a.source_published_at<=? AND d.urgency=3
    AND EXISTS(SELECT 1 FROM social_run_items i WHERE i.alert_id=a.id AND i.platform=?)
    AND EXISTS(SELECT 1 FROM database_deliveries i WHERE i.alert_id=a.id AND i.platform=? AND i.content_hash<>a.content_hash)
    AND NOT EXISTS(SELECT 1 FROM database_deliveries i WHERE i.alert_id=a.id AND i.platform=? AND i.content_hash=a.content_hash)
    AND NOT EXISTS(SELECT 1 FROM database_deliveries i JOIN social_runs s ON s.id=i.run_id WHERE i.alert_id=a.id AND i.platform=? AND s.status='needs_check')
    ORDER BY a.updated_at DESC LIMIT 50`).bind(new Date(now-7*86400000).toISOString(),new Date(now-90*86400000).toISOString().slice(0,10),new Date(now).toISOString(),platform,platform,platform,platform).all();
   rows=updates.results.filter(eligibleForDatabaseSocial).slice(0,5);kind='update';
  }
  if(!rows.length){
   const history=await env.DB.prepare(`SELECT a.*,d.urgency,d.severity,d.incident_state FROM alerts a JOIN incident_details d ON d.alert_id=a.id
    WHERE a.status='published' AND a.source_published_at>=? AND a.source_published_at<=? AND d.incident_state IN ('注意','進行中','対応中')
    AND NOT EXISTS(SELECT 1 FROM database_deliveries i WHERE i.alert_id=a.id AND i.platform=? AND i.content_hash=a.content_hash)
    AND NOT EXISTS(SELECT 1 FROM database_deliveries i JOIN social_runs s ON s.id=i.run_id WHERE i.alert_id=a.id AND i.platform=? AND (s.status='needs_check' OR i.created_at>=?))
    ORDER BY d.urgency DESC,a.updated_at DESC LIMIT 50`).bind(new Date(now-90*86400000).toISOString().slice(0,10),new Date(now).toISOString(),platform,platform,new Date(now-30*86400000).toISOString()).all();
   rows=history.results.filter(eligibleForDatabaseSocial).slice(0,5);kind='history';
  }
  if(rows.length)pending.push({platform,rows,kind});
 }
 if(!pending.length)return {status:'no_new_alerts'};
 const connection=await checkBufferConnection(env,fetcher);const results=[];
 for(const {platform,rows,kind} of pending){
  const matches=connection.channels.filter(c=>c.platform===platform&&c.name===env.BUFFER_ALLOWED_ACCOUNT);
  if(matches.length!==1||matches[0].queuePaused){results.push({platform,status:'channel_unavailable'});continue}
  const id=await sha256(slot.day+':'+slot.slot+':'+platform);const text=digestText(rows,id,kind);const stamp=new Date(now).toISOString();
  const claim=await env.DB.prepare("INSERT OR IGNORE INTO social_runs (id,day,slot,platform,status,alert_ids_json,post_text,created_at,updated_at) SELECT ?,?,?,?,'sending',?,?,?,? WHERE (SELECT COUNT(*) FROM social_runs WHERE day = ? AND platform = ?) < 3").bind(id,slot.day,slot.slot,platform,JSON.stringify(rows.map(r=>r.id)),text,stamp,stamp,slot.day,platform).run();
  if(claim.meta.changes!==1)continue;
  // Reserve bulletin identities before sending. Unknown outcomes are never auto-retried.
  const reservation=JSON.stringify(rows.map(row=>({id:row.id,hash:row.content_hash})));
  await env.DB.batch([
   env.DB.prepare("INSERT OR IGNORE INTO social_run_items(alert_id,platform,run_id) SELECT json_extract(value,'$.id'),?,? FROM json_each(?)").bind(platform,id,reservation),
   env.DB.prepare("INSERT OR IGNORE INTO database_deliveries(run_id,alert_id,platform,content_hash,kind,created_at) SELECT ?,json_extract(value,'$.id'),?,json_extract(value,'$.hash'),?,? FROM json_each(?)").bind(id,platform,kind,stamp,reservation)
  ]);
  const reserved=await env.DB.prepare('SELECT alert_id FROM database_deliveries WHERE run_id=?').bind(id).all();
  if(reserved.results.length!==rows.length){await env.DB.prepare("UPDATE social_runs SET status='cancelled',updated_at=? WHERE id=?").bind(stamp,id).run();continue;}
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

export function eligibleForDatabaseSocial(row){
 if(row.status!=='published'||!row.recommended_action||!['高','重大'].includes(row.severity))return false;
 let evidence;try{evidence=JSON.parse(row.evidence_json)}catch{return false}
 return eligibleForSocial(row)||row.source_key==='jpcert'||(row.reviewed_by!=null&&evidence.includes('確定情報（情報源で確認）'));
}
