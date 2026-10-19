import {text,safeUrl,date,saveDetails} from './database.js';
import {sha256} from './policy.js';

export function validateIncident(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('invalid_record');
 for(const key of ['eventKey','title','organization','summary','action','severityReason','urgencyReason','damage','responseStatus','sourceName'])if(typeof body[key]!=='string'||!text(body[key])||body[key].length>6000)throw Error('required_'+key);
 if(!/^[a-zA-Z0-9:._-]{3,200}$/.test(body.eventKey))throw Error('invalid_event_key');
 const sourceUrl=safeUrl(body.sourceUrl);if(!sourceUrl)throw Error('invalid_source_url');
 for(const key of ['publishedAt','occurredAt','sourceUpdatedAt'])if(body[key]&&!date(body[key]))throw Error('invalid_'+key);
 if(!body.publishedAt)throw Error('required_published_at');
 if(!['重大','高','中','低','未評価'].includes(body.severity)||!['注意','進行中','対応中','解決'].includes(body.state)||!['個人情報漏えい','ランサムウェア','脆弱性','不正アクセス','注意喚起','その他'].includes(body.attackType))throw Error('invalid_classification');
 if(!Number.isInteger(body.urgency)||body.urgency<0||body.urgency>3)throw Error('invalid_urgency');
 if(body.cvss!=null&&(typeof body.cvss!=='number'||!Number.isFinite(body.cvss)||body.cvss<0||body.cvss>10))throw Error('invalid_cvss');
 if(!['確定情報（情報源で確認）','未確認情報を含む（詳細を参照）'].includes(body.confirmation))throw Error('invalid_confirmation');
 if(!['published','pending_review','withdrawn'].includes(body.status))throw Error('invalid_status');
 const cve=body.cve?String(body.cve).toUpperCase():null;if(cve&&!/^CVE-\d{4}-\d{4,}$/.test(cve))throw Error('invalid_cve');
 return {...Object.fromEntries(Object.entries(body).map(([k,v])=>[k,typeof v==='string'?text(v):v])),sourceUrl,cve,eventKey:cve?'cve:'+cve+':cisa-kev':body.eventKey,publishedAt:date(body.publishedAt),occurredAt:date(body.occurredAt),sourceUpdatedAt:date(body.sourceUpdatedAt)};
}
export async function saveReviewedIncident(env,body,actor){
 const item=validateIncident(body);const id=await sha256(item.eventKey);const stamp=new Date().toISOString();const hash=await sha256(JSON.stringify(item));
 await env.DB.prepare(`INSERT INTO alerts(id,event_key,source_key,source_url,cve_id,title,summary,recommended_action,evidence_json,severity_score,status,source_published_at,source_updated_at,published_at,reviewed_at,reviewed_by,content_hash,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_key) DO UPDATE SET source_key=excluded.source_key,source_url=excluded.source_url,title=excluded.title,summary=excluded.summary,recommended_action=excluded.recommended_action,evidence_json=excluded.evidence_json,status=excluded.status,source_published_at=excluded.source_published_at,source_updated_at=excluded.source_updated_at,published_at=COALESCE(alerts.published_at,excluded.published_at),reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,content_hash=excluded.content_hash,updated_at=excluded.updated_at`)
 .bind(id,item.eventKey,'manual-reviewed',item.sourceUrl,item.cve,item.title,item.summary,item.action,JSON.stringify(['管理者が情報源を確認',item.confirmation]),0,item.status,item.publishedAt,item.sourceUpdatedAt,item.status==='published'?stamp:null,stamp,actor,hash,stamp,stamp).run();
 await saveDetails(env,id,item,{url:item.sourceUrl,name:item.sourceName},stamp,true);
 await env.DB.prepare('INSERT INTO audit_events(alert_id,action,actor,detail_json,created_at) VALUES(?,?,?,?,?)').bind(id,'incident_reviewed',actor,JSON.stringify({sourceUrl:item.sourceUrl,contentHash:hash,status:item.status}),stamp).run();
 return {id,eventKey:item.eventKey};
}
export const databaseAdminPage=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>事件の登録・更新 | Cyber Care</title><style>body{font:16px/1.7 system-ui;max-width:850px;margin:auto;padding:24px}textarea{width:100%;height:65vh;font:14px/1.6 monospace;box-sizing:border-box}button{font:inherit;padding:12px}pre{white-space:pre-wrap}</style><a href="/admin/">管理画面へ</a><h1>確認済み事件の登録・更新</h1><p>公的機関・当事者・信頼できる報道の原文を確認して登録してください。同じ事件は同じeventKeyで更新します。単一CVEはCVE番号で統合します。推測で日時・CVSS・被害規模を埋めないでください。公開にはstatusをpublishedに変更します。未確認情報はconfirmationと本文で明示してください。</p><p>日時はISO 8601形式（日本時間は+09:00）。不明なoccurredAt、sourceUpdatedAt、cvssはnull。organizationReadingにカタカナの読みを入力します。</p><textarea id="record" aria-label="記事JSON"></textarea><button id="save">保存する</button><pre id="result" role="status"></pre><script>
document.getElementById('record').value=JSON.stringify({eventKey:'',title:'',organization:'',organizationReading:'',cve:null,occurredAt:null,publishedAt:'',sourceUpdatedAt:null,severity:'未評価',severityReason:'',cvss:null,urgency:1,urgencyReason:'',state:'注意',attackType:'その他',confirmation:'確定情報（情報源で確認）',summary:'',damage:'不明',responseStatus:'不明',action:'',sourceUrl:'',sourceName:'',status:'pending_review'},null,2);
document.getElementById('save').onclick=async()=>{const result=document.getElementById('result');try{const body=JSON.parse(document.getElementById('record').value);const response=await fetch('/admin/database',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});result.textContent=JSON.stringify(await response.json(),null,2);}catch{result.textContent='保存できませんでした。JSON形式・通信状態を確認してください。'}};
</script></html>`;
