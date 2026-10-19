export function collectionMessage(collection) {
 const format=value=> value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value))+'（日本時間）':null;
 const last=format(collection?.lastSuccessAt);
 let message=last||'最終確認日時：未確認';
 if(collection?.status==='partial')message+='\n一部の情報源のみ確認しました（部分確認完了：'+(format(collection.lastPartialAt)||'不明')+'）。最新情報を確認できていません。';
 else if(collection?.status==='failed'||collection?.status==='unavailable')message+='\n最新情報を確認できていません。';
 else if(collection?.status==='running')message+='\n情報収集処理中です。前回の全情報源確認成功日時を表示しています。';
 else if(collection?.status==='incomplete')message+='\n前回の収集処理が完了していません。最新情報を確認できていません。';
 return message;
}
export function selectIncidents(incidents,{query='',sort='urgency',category='',severity='',attack='',period='all'}={},referenceTime=Date.now()) {
 const normalized=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ja');
 const terms=normalized(query).split(/\s+/).filter(Boolean);
 const age=r=>referenceTime-Date.parse(r.publishedAt||'');
 const filtered=incidents.filter(r=>{
  const haystack=normalized([r.title,r.organization,r.cve,r.attackType,r.summary,r.action,r.damage,r.responseStatus].join(' '));
  if(!terms.every(term=>haystack.includes(term)))return false;
  if(severity&&r.severity!==severity||attack&&r.attackType!==attack)return false;
  if(category==='latest'&&!(age(r)>=0&&age(r)<=7*86400000))return false;
  if(category==='past'&&!(age(r)>7*86400000))return false;
  if(category==='ongoing'&&!['注意','進行中','対応中'].includes(r.state))return false;
  if(period!=='all'&&!(age(r)>=0&&age(r)<=Number(period)*86400000))return false;
  return true;
 });
 const stamp=value=>Number.isFinite(Date.parse(value))?Date.parse(value):null;
 const dates=(a,b,field,asc=false)=>{
  const x=stamp(a[field]),y=stamp(b[field]);return x===null?(y===null?0:1):y===null?-1:asc?x-y:y-x;
 };
 const rank={'重大':4,'高':3,'中':2,'低':1,'未評価':0};
 const collator=new Intl.Collator('ja',{numeric:true,sensitivity:'base'});
 return filtered.sort((a,b)=>{
  let result=0;
  if(sort==='urgency')result=b.urgency-a.urgency||(rank[b.severity]||0)-(rank[a.severity]||0)||dates(a,b,'publishedAt');
  if(sort==='severity')result=(rank[b.severity]||0)-(rank[a.severity]||0)||(b.cvss??-1)-(a.cvss??-1);
  if(sort==='latest')result=dates(a,b,'publishedAt');
  if(sort==='occurred-desc'||sort==='occurred-asc')result=dates(a,b,'occurredAt',sort==='occurred-asc');
  if(sort==='name')result=collator.compare(a.organizationReading||a.organization,b.organizationReading||b.organization)||collator.compare(a.title,b.title);
  if(sort==='updated')result=dates(a,b,'updatedAt');
  return result||dates(a,b,'updatedAt')||a.id.localeCompare(b.id);
 });
}
