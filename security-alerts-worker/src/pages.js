const shell = (title, body, script) => `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Cyber Care</title><style>body{font-family:system-ui,sans-serif;max-width:850px;margin:auto;padding:24px;background:#f5f8fa;color:#172e3d}a{color:#005e88}article,section{background:white;border:1px solid #b9cbd5;border-radius:12px;padding:20px;margin:20px 0}button,input{font:inherit;padding:12px;margin:4px;max-width:90%}button{cursor:pointer}button:disabled{cursor:default}h1{font-size:1.6rem}p{line-height:1.7}label{display:block}#message{min-height:2em}small{color:#435968}</style><header><a href="https://cyber-care-pwa.pages.dev/">Cyber Careへ戻る</a><h1>${title}</h1></header>${body}<script>${script}</script></html>`;

import { publicPageScript } from './public-page.js';

const renderHelpers = `
function text(tag, value) { const e=document.createElement(tag); e.textContent=value || ''; return e; }
function card(a) {
 const e=document.createElement('article');
 e.append(text('h2',a.title),text('p',a.summary),text('h3','公式の対処案内（原文）'),text('p',a.recommendedAction),text('p','判定根拠: '+a.evidence.join(' / ')),text('small','優先度スコア: '+a.severityScore+' / 100（CVSSではありません）'));
 const u=new URL(a.sourceUrl); if(u.protocol==='https:' && u.hostname==='www.cisa.gov') { const l=text('a','CISA公式情報を確認'); l.href=u.href; l.target='_blank'; l.rel='noopener noreferrer'; e.append(document.createElement('br'),l); }
 const preview=text('a','日英の表示をプレビュー');preview.href='/admin/preview?id='+encodeURIComponent(a.id)+'&lang=ja';e.append(document.createElement('br'),preview);
 return e;
}
`;

export const alertsPage = shell('重大サイバーセキュリティ速報', `<label for="alert-language">言語 / Language</label><select id="alert-language"><option value="ja">日本語</option><option value="en">English</option></select><p id="intro"></p><p id="message" role="status"></p><main id="list"></main><footer id="about"></footer>`, publicPageScript);

export const adminPage = shell('速報の承認待ち', `<p>公式の対象・影響範囲・対処を確認してから判断してください。取得原文は英語のまま表示します。</p><section><p>管理者ログインで認証済みです。共有端末では利用後にログアウトしてください。</p><button id="load">承認待ちを読み込む</button><button id="logout">ログアウト</button></section><p id="message" role="status"></p><main id="list"></main>`, renderHelpers + `
let enabled=false; let bulkBusy=false;
const message=document.getElementById('message'); const list=document.getElementById('list');
async function api(path,body) {const r=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'content-type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error(r.status===401?'ログインの有効期限が切れました。画面を再読み込みしてください。':r.status===409?'内容が更新されたか、審査済みです。一覧を読み直してください。':'操作できませんでした。設定や接続を確認してください。');return r.json()}
async function load(path='/admin/pending') {
 if(bulkBusy)return;
 bulkButton.disabled=true;
 list.replaceChildren(); message.textContent='読み込み中…';
 try {enabled=(await api('/admin/status')).reviewActionsEnabled;const data=await api(path);message.textContent=data.alerts.length+'件（最大100件）'+(enabled?'':'。現在は確認専用です。公開・却下・取り下げ操作は無効です。');
 for(const a of data.alerts) {const e=card(a);for(const [label,status] of (path==='/admin/published'?[['公開を取り下げる','withdrawn']]:[['公開を承認','published'],['却下','rejected']])) {const b=text('button',label);b.disabled=!enabled;b.onclick=async()=>{if(!confirm(a.title+' を'+label+'しますか？'+(status==='published'?'一般の人が閲覧できるようになります。':'')))return; b.disabled=true;try{await api('/admin/review',{id:a.id,contentHash:a.contentHash,status});await load(path)}catch(err){message.textContent=err.message}};e.append(b)}list.append(e)}
 bulkButton.disabled=!enabled || path!=='/admin/pending' || data.alerts.length===0;
 }catch(err){message.textContent=err.message}
}
const bulkButton=text('button','承認待ちをすべて公開');bulkButton.disabled=true;document.getElementById('load').after(bulkButton);
const bulkHint=text('p','上の「承認待ちをすべて公開」は、確認画面を挟まずワンタップで実行します。開始時点の承認待ちを公開し、後から追加された速報は次回の対象になります。');bulkButton.after(bulkHint);
bulkButton.onclick=async()=>{
 if(bulkBusy || !enabled)return;
 bulkBusy=true;for(const b of document.querySelectorAll('button'))b.disabled=true;
 let published=0, skipped=0;let outcome='';
 try {
  message.textContent='公開対象を取得中…';
  // Capture the queue before publishing so arrivals during the run stay pending.
  const snapshot=(await api('/admin/status')).serverTime;const targets=[];let cursor='';
  do {const data=await api('/admin/pending?snapshot='+encodeURIComponent(snapshot)+'&cursor='+cursor);targets.push(...data.alerts);cursor=data.nextCursor || '';}while(cursor);
  for(const a of targets){
   message.textContent='一括公開中… '+published+'件公開 / '+targets.length+'件';
   try{await api('/admin/review',{id:a.id,contentHash:a.contentHash,status:'published'});published++;}
   catch(err){if(err.message.includes('審査済み')){skipped++;continue;}throw err;}
  }
  outcome=published+'件を公開しました。'+(skipped?'内容変更・審査済みのため'+skipped+'件をスキップしました。':'');
 }catch(err){outcome=published+'件の公開を確認した後、処理を停止しました。'+err.message+' 最新の一覧と操作履歴を確認してください。';}
 finally{bulkBusy=false;for(const b of document.querySelectorAll('button'))b.disabled=false;await load();message.textContent=outcome;}
};
document.getElementById('load').onclick=()=>load();
document.getElementById('logout').onclick=()=>{list.replaceChildren();location.assign('/cdn-cgi/access/logout');};
const publishedButton=text('button','公開済みを確認');publishedButton.onclick=()=>load('/admin/published');document.getElementById('load').after(publishedButton);
const auditButton=text('button','操作履歴を確認');auditButton.onclick=async()=>{bulkButton.disabled=true;list.replaceChildren();try{const data=await api('/admin/audit');message.textContent='最近の操作（最大100件）';for(const event of data.events)list.append(text('p',event.created_at+' / '+event.action+' / '+event.actor))}catch(err){message.textContent=err.message}};publishedButton.after(auditButton);
load();
`);
