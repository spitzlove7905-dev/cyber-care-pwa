// JSON table-valued inserts keep historical imports within D1's per-invocation
// query budget, without a service or paid-plan dependency.
const field=key=>`json_extract(j.value,'$.${key}')`;
export async function storeCandidates(env,records,stamp){
 for(let offset=0;offset<records.length;offset+=200){
  const chunk=records.slice(offset,offset+200);const payload=JSON.stringify(chunk);
  const columns=['id','event_key','source_key','source_url','cve_id','title','summary','recommended_action','evidence_json','severity_score','status','source_published_at','source_updated_at','published_at','content_hash','created_at','updated_at'];
  const keys=['id','eventKey','sourceKey','sourceUrl','cve','title','summary','action','evidence','score','status','publishedAt','sourceUpdatedAt','stamp','hash','stamp','stamp'];
  const details=['alert_id','organization','attack_type','severity','severity_reason','urgency','urgency_reason','incident_state','damage','response_status','confirmation','data_hash'];
  const detailKeys=['id','organization','attackType','severity','severityReason','urgency','urgencyReason','state','damage','responseStatus','confirmation','hash'];
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO alerts(${columns.join(',')}) SELECT ${keys.map(field).join(',')} FROM json_each(?) j WHERE 1
    ON CONFLICT(event_key) DO UPDATE SET source_key=excluded.source_key,source_url=excluded.source_url,cve_id=excluded.cve_id,title=excluded.title,summary=excluded.summary,recommended_action=excluded.recommended_action,evidence_json=excluded.evidence_json,severity_score=excluded.severity_score,source_published_at=excluded.source_published_at,source_updated_at=excluded.source_updated_at,content_hash=excluded.content_hash,updated_at=excluded.updated_at
    WHERE alerts.status IN ('published','pending_review') AND alerts.source_key<>'manual-reviewed' AND alerts.content_hash<>excluded.content_hash AND (alerts.source_key<>'cisa-kev' OR excluded.source_key='cisa-kev')`).bind(payload),
   env.DB.prepare(`INSERT INTO incident_details(${details.join(',')}) SELECT ${detailKeys.map(field).join(',')} FROM json_each(?) j JOIN alerts a ON a.id=${field('id')} WHERE a.source_key=${field('sourceKey')}
    ON CONFLICT(alert_id) DO UPDATE SET ${details.slice(1).map(c=>`${c}=excluded.${c}`).join(',')} WHERE incident_details.curated=0 AND incident_details.data_hash<>excluded.data_hash`).bind(payload),
   env.DB.prepare(`INSERT INTO incident_sources(alert_id,source_url,source_name,checked_at) SELECT ${['id','sourceUrl','sourceName','stamp'].map(field).join(',')} FROM json_each(?) j WHERE 1 ON CONFLICT(alert_id,source_url) DO UPDATE SET checked_at=excluded.checked_at`).bind(payload),
   env.DB.prepare(`INSERT INTO audit_events(alert_id,action,actor,detail_json,created_at) SELECT a.id,'source_imported_or_updated','system',json_object('source',a.source_key,'contentHash',a.content_hash),a.updated_at FROM json_each(?) j JOIN alerts a ON a.id=${field('id')} WHERE a.updated_at=? AND a.content_hash=${field('hash')}`).bind(payload,stamp)
  ]);
 }
}
