import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { sha256 } from './policy.js';
import {storeCandidates} from './database-store.js';

export const DATABASE_SOURCES = [
 {key:'cisa-kev',name:'CISA KEV',url:'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'},
 {key:'jpcert',name:'JPCERT/CC 注意喚起',url:'https://www.jpcert.or.jp/rss/jpcert.rdf'}
];
export const text = value => String(value ?? '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,6000);
export function safeUrl(value) {
 try { const u=new URL(value); return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u.href:null; } catch { return null; }
}
export function date(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.test(value))return null;
 const day=value.slice(0,10);if(!Number.isFinite(Date.parse(value))||new Date(day).toISOString().slice(0,10)!==day)return null;
 return value.length===10?value:new Date(value).toISOString();
}

export function parseAdvisories(xml) {
 if (xml.length>2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml)!==true) throw Error('invalid_feed');
 const doc=new XMLParser({ignoreAttributes:true,removeNSPrefix:true,processEntities:false,parseTagValue:false}).parse(xml);
 if(!doc.RDF)throw Error('invalid_feed');
 const items=doc.RDF.item ? (Array.isArray(doc.RDF.item)?doc.RDF.item:[doc.RDF.item]) : [];
 if(!items.length)throw Error('empty_feed');
 return items.flatMap(item=>{
  const url=safeUrl(item.link);if(!url||new URL(url).hostname!=='www.jpcert.or.jp'||!new URL(url).pathname.startsWith('/at/'))return [];
  const title=text(item.title);const published=date(item.date);if(!title||!published)throw Error('invalid_advisory');
  return [{title,sourceUrl:url,published,summary:text(item.description)||'JPCERT/CCの公式注意喚起です。対象・影響・対処は情報源を確認してください。'}];
 });
}

export async function readLimited(response, limit=12_000_000) {
 if(!response.ok)throw Error('source_http_'+response.status);
 const reader=response.body.getReader();const chunks=[];let size=0;
 try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('feed_too_large');chunks.push(value);}} finally {await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return new TextDecoder().decode(bytes);
}

export async function saveDetails(env,id,details,source,checkedAt,curated=false) {
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO incident_details(alert_id,organization,organization_reading,occurred_at,attack_type,severity,severity_reason,cvss,urgency,urgency_reason,incident_state,damage,response_status,confirmation)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(alert_id) DO UPDATE SET organization=excluded.organization,organization_reading=excluded.organization_reading,occurred_at=excluded.occurred_at,attack_type=excluded.attack_type,severity=excluded.severity,severity_reason=excluded.severity_reason,cvss=excluded.cvss,urgency=excluded.urgency,urgency_reason=excluded.urgency_reason,incident_state=excluded.incident_state,damage=excluded.damage,response_status=excluded.response_status,confirmation=excluded.confirmation WHERE incident_details.curated=0 OR ?=1`)
   .bind(id,details.organization,details.organizationReading||'',details.occurredAt||null,details.attackType,details.severity,details.severityReason,details.cvss??null,details.urgency,details.urgencyReason,details.state,details.damage,details.responseStatus,details.confirmation,curated?1:0),
  env.DB.prepare('INSERT INTO incident_sources(alert_id,source_url,source_name,checked_at) VALUES(?,?,?,?) ON CONFLICT(alert_id,source_url) DO UPDATE SET checked_at=excluded.checked_at').bind(id,source.url,source.name,checkedAt)
 ]);
 if(curated)await env.DB.prepare('UPDATE incident_details SET curated=1 WHERE alert_id=?').bind(id).run();
}

export async function ingestAdvisories(env,fetcher=fetch) {
 const source=DATABASE_SOURCES[1];
 const response=await fetcher(source.url,{signal:AbortSignal.timeout(15000),redirect:'manual'});
 const items=parseAdvisories(await readLimited(response,2_000_000));
 const stamp=new Date().toISOString();const records=[];
 for(const item of items){
  const cves=[...new Set(((item.title+' '+item.summary).match(/CVE-\d{4}-\d{4,}/gi)||[]).map(c=>c.toUpperCase()))];
  const eventKey=cves.length===1?'cve:'+cves[0]+':cisa-kev':'advisory:'+item.sourceUrl;
  const id=await sha256(eventKey);
  const action='対象製品・バージョンを確認し、情報源に記載された更新・回避策を実施してください。';
  const hash=await sha256(JSON.stringify([item.title,item.summary,action,item.published]));
  records.push({id,eventKey,sourceKey:source.key,sourceUrl:item.sourceUrl,sourceName:source.name,cve:cves.length===1?cves[0]:null,title:item.title,summary:item.summary,action,evidence:'["公式一次情報","公的機関の注意喚起"]',score:70,status:env.AUTO_PUBLISH_ENABLED==='true'?'published':'pending_review',publishedAt:item.published,sourceUpdatedAt:null,stamp,hash,organization:'情報源を確認',attackType:/ランサム|ransom/i.test(item.title)?'ランサムウェア':/脆弱性|CVE-/i.test(item.title)?'脆弱性':'注意喚起',severity:'未評価',severityReason:'RSSには客観的な重大度の記載なし',urgency:1,urgencyReason:'公的機関の注意喚起。対象かどうかの確認が必要',state:'注意',damage:'不明（注意喚起は被害発生の確認とは限りません）',responseStatus:'情報源の対処案内を確認',confirmation:'公式注意喚起確認済み（被害の詳細は未確認）'});
 }
 await storeCandidates(env,records,stamp);
}

export async function collectionStatus(env) {
 const latest=await env.DB.prepare('SELECT * FROM collection_runs ORDER BY started_at DESC,id DESC LIMIT 1').first();
 const last=await env.DB.prepare("SELECT completed_at FROM collection_runs WHERE status='success' ORDER BY completed_at DESC LIMIT 1").first();
 const partial=await env.DB.prepare("SELECT completed_at FROM collection_runs WHERE status='partial' ORDER BY completed_at DESC LIMIT 1").first();
 const status=latest?.status==='running'&&Date.now()-Date.parse(latest.started_at)>15*60000?'incomplete':latest?.status||'unconfirmed';
 return {status,lastSuccessAt:last?.completed_at||null,lastPartialAt:partial?.completed_at||null,sources:latest?JSON.parse(latest.sources_json):DATABASE_SOURCES.map(s=>({name:s.name,status:'unconfirmed'})),scope:'設定された情報源の収集・保存完了時刻です。全事件の網羅や、この時刻までの被害確認を保証するものではありません。JPCERT/CCのRSSは掲載件数に制限があります。'};
}

export async function databaseRecords(env) {
 const rows=await env.DB.prepare(`SELECT a.*,d.organization,d.organization_reading,d.occurred_at,d.attack_type,d.severity,d.severity_reason,d.cvss,d.urgency,d.urgency_reason,d.incident_state,d.damage,d.response_status,d.confirmation FROM alerts a LEFT JOIN incident_details d ON a.id=d.alert_id WHERE a.status='published' ORDER BY a.updated_at DESC LIMIT 10000`).all();
 const sources=await env.DB.prepare("SELECT s.* FROM incident_sources s JOIN alerts a ON a.id=s.alert_id WHERE a.status='published'").all();
 const byId=new Map();for(const s of sources.results){if(!byId.has(s.alert_id))byId.set(s.alert_id,[]);byId.get(s.alert_id).push({url:s.source_url,name:s.source_name,checkedAt:s.checked_at});}
 return rows.results.map(r=>({id:r.id,eventId:r.event_key,title:r.title,organization:r.organization||'不明',organizationReading:r.organization_reading||'',occurredAt:r.occurred_at||null,publishedAt:r.source_published_at||null,updatedAt:r.updated_at,sourceUpdatedAt:r.source_updated_at||null,firstSeenAt:r.created_at,cve:r.cve_id,summary:r.summary,action:r.recommended_action,severity:r.severity||'未評価',severityReason:r.severity_reason||'評価情報なし',cvss:r.cvss??null,urgency:r.urgency??1,urgencyReason:r.urgency_reason||'公式情報を確認してください',state:r.incident_state||'注意',attackType:r.attack_type||'脆弱性',damage:r.damage||'不明',responseStatus:r.response_status||'不明',confirmation:r.confirmation||'公式発表確認済み',sources:byId.get(r.id)||[{url:r.source_url,name:r.source_key,checkedAt:null}]}));
}
