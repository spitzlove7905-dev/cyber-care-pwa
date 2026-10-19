import {collectionMessage,selectIncidents} from './security-data.js';
const $=id=>document.getElementById(id);let incidents=[],visible=30,matches=[],reference=Date.now();
const node=(tag,value,cls)=>{const n=document.createElement(tag);if(value!=null)n.textContent=String(value);if(cls)n.className=cls;return n;};
const format=value=>!value?'不明':/^\d{4}-\d{2}-\d{2}$/.test(value)?value.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1年$2月$3日')+'（時刻不明）':Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))+'（日本時間）':'不明';
function card(r){
 const el=node('article');const badges=node('div',null,'badges');
 for(const value of [reference-Date.parse(r.publishedAt)<=7*86400000?'最新速報':'過去の重大事件・注意喚起',r.state,r.attackType,'重大度：'+r.severity,'緊急性：'+(['低','中','高','最優先'][r.urgency]||'未評価')])badges.append(node('span',value,'badge'));
 el.append(badges,node('h2',r.title));const dl=node('dl');
 for(const [label,value] of [['対象企業・組織',r.organization],['発生日',format(r.occurredAt)],['情報公開日',format(r.publishedAt)],['最終更新日（データベース）',format(r.updatedAt)],['情報源の更新日',format(r.sourceUpdatedAt)],['確認区分',r.confirmation],['概要',r.summary],['重大度の根拠',r.severityReason],['CVSS',r.cvss==null?'情報源に記載なし（独自のCVSSは付与しません）':r.cvss],['緊急性の根拠',r.urgencyReason],['被害状況',r.damage],['現在の対応状況',r.responseStatus],['利用者が取るべき対策',r.action]])dl.append(node('dt',label),node('dd',value||'不明'));
 el.append(dl);const sources=node('ul',null,'source-list');
 for(const source of r.sources){try{const url=new URL(source.url);if(url.protocol!=='https:'||url.username||url.password)continue;const li=node('li');const a=node('a',source.name||url.hostname);a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';li.append(a,node('small',' 確認日時：'+format(source.checkedAt)));sources.append(li);}catch{}}
 el.append(node('h3','情報源'),sources);return el;
}
function paint(){const results=$('results');results.replaceChildren(...matches.slice(0,visible).map(card));$('resultCount').textContent=matches.length+'件（'+Math.min(visible,matches.length)+'件表示）';$('more').hidden=visible>=matches.length;if(!matches.length)results.append(node('p',incidents.length?'条件に一致する情報がありません。':'公開済み情報はまだありません。収集状態を確認してください。'));}
function filter(){const options=Object.fromEntries(['query','sort','category','severity','attack','period'].map(id=>[id,$(id).value]));matches=selectIncidents(incidents,options,reference);visible=30;paint();}
$('filters').addEventListener('submit',e=>e.preventDefault());let timer;$('filters').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(filter,120);});$('filters').addEventListener('change',filter);$('filters').addEventListener('reset',()=>setTimeout(filter,0));$('more').addEventListener('click',()=>{visible+=30;paint();});
fetch('/api/security/database',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
 incidents=data.incidents;reference=Date.now();$('securityCheckedAt').textContent=collectionMessage(data.collection);$('collectionScope').textContent=data.collection.scope;
 $('sourceStatus').replaceChildren(...data.collection.sources.map(s=>node('li',s.name+'：'+({success:'確認成功',failed:'確認失敗',unconfirmed:'未確認'}[s.status]||'処理中'))));filter();
}).catch(()=>{$('securityCheckedAt').textContent=collectionMessage({status:'unavailable'});$('resultCount').textContent='情報を取得できませんでした。時間をおいて再度お試しください。';});
