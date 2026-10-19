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
function socialPreview(a,e) {
 const button=text('button','SNS用の下書きを確認');const panel=document.createElement('section');panel.hidden=true;
 button.onclick=async()=>{
  panel.hidden=false;panel.replaceChildren(text('p','文面を確認して、必要なものだけBufferへ下書き保存できます。保存だけではSNSに公開されません。'));
  const select=document.createElement('select');select.setAttribute('aria-label','SNS下書きの言語');
  for(const [value,label] of [['ja','日本語'],['en','English']]){const option=text('option',label);option.value=value;select.append(option)}
  panel.append(select);
  const reader=text('a','速報の詳細を見る');reader.href='/alerts?id='+encodeURIComponent(a.id)+'&lang=ja';reader.target='_blank';reader.rel='noopener noreferrer';reader.style.display='inline-block';reader.style.padding='12px';panel.append(reader,text('p','このリンクは、この速報一件だけを開きます。下に続く管理用の一覧とは別のページです。'));
  const drafts=document.createElement('div');panel.append(drafts);
  let version=0;
  async function refresh(){const current=++version;reader.href='/alerts?id='+encodeURIComponent(a.id)+'&lang='+select.value;drafts.replaceChildren(text('p','読み込み中…'));try{
   const data=await api('/admin/social-drafts?id='+encodeURIComponent(a.id)+'&lang='+select.value);if(current!==version)return;drafts.replaceChildren();
   for(const draft of data.drafts){drafts.append(text('h3',draft.platform==='x'?'X':'Threads'));const area=document.createElement('textarea');area.readOnly=true;area.rows=9;area.style.width='100%';area.value=draft.text;area.setAttribute('aria-label',draft.platform+' 投稿文');drafts.append(area);
    if(data.draftsEnabled){const save=text('button',(draft.platform==='x'?'X':'Threads')+'へBuffer下書き保存（非公開）');const result=text('p','');result.setAttribute('role','status');save.onclick=async()=>{save.disabled=true;select.disabled=true;button.disabled=true;result.textContent='下書き保存中…';try{const response=await fetch('/admin/social-draft',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({id:a.id,contentHash:a.contentHash,platform:draft.platform,language:draft.language})});const outcome=await response.json();if(!response.ok){result.textContent=outcome.error==='already_submitted_or_daily_limit'?'送信済み、または24時間の上限に達しています。Bufferの下書きを確認してください。':'保存を確認できませんでした。再送せず、Bufferの下書きと操作履歴を確認してください。';return;}result.textContent='Bufferに下書きを保存しました。SNSには公開していません。';}catch(err){result.textContent='結果を確認できません。再送せず、Bufferで確認してください。';}finally{select.disabled=false;button.disabled=false}};drafts.append(save,result)}
   }
  }catch(err){if(current===version)drafts.replaceChildren(text('p',err.message))}}
  select.onchange=refresh;await refresh();
 };e.append(button,panel);
}
async function load(path='/admin/pending') {
 if(bulkBusy)return;
 bulkButton.disabled=true;
 list.replaceChildren(); message.textContent='読み込み中…';
 try {enabled=(await api('/admin/status')).reviewActionsEnabled;const data=await api(path);message.textContent=data.alerts.length+'件（最大100件）'+(enabled?'':'。現在は確認専用です。公開・却下・取り下げ操作は無効です。');
 for(const a of data.alerts) {const e=card(a);if(path==='/admin/published')socialPreview(a,e);for(const [label,status] of (path==='/admin/published'?[['公開を取り下げる','withdrawn']]:[['公開を承認','published'],['却下','rejected']])) {const b=text('button',label);b.disabled=!enabled;b.onclick=async()=>{if(!confirm(a.title+' を'+label+'しますか？'+(status==='published'?'一般の人が閲覧できるようになります。':'')))return; b.disabled=true;try{await api('/admin/review',{id:a.id,contentHash:a.contentHash,status});await load(path)}catch(err){message.textContent=err.message}};e.append(b)}list.append(e)}
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
const connectionButton=text('button','Buffer接続を確認（投稿しません）');publishedButton.after(connectionButton);
const scheduleButton=text('button','自動配信の設定を確認（投稿しません）');connectionButton.after(scheduleButton);
const scheduleResult=text('p','');scheduleResult.setAttribute('role','status');scheduleButton.after(scheduleResult);
scheduleButton.onclick=async()=>{scheduleButton.disabled=true;try{const data=await api('/admin/schedule-check',{});scheduleResult.textContent=(data.enabled?'自動公開は有効です。':'自動公開は無効です。')+'日本時間8時・18時に新着のみまとめて配信します。'+data.channels.map(c=>c.platform+' / '+c.name+(c.queuePaused?'（停止中）':'')).join('、')+'。最近の実行: '+(data.runs.map(r=>r.day+' '+r.slot+' '+r.platform+' '+r.status).join(' / ')||'まだありません。');}catch(err){scheduleResult.textContent=err.message}finally{scheduleButton.disabled=false}};
const emergencyButton=text('button','緊急の新着を配信（予備枠・1日1回）');scheduleResult.after(emergencyButton);
emergencyButton.onclick=async()=>{if(!confirm('次の定時配信まで待てない公式確認済みの重大情報ですか？未配信の新着をまとめてXとThreadsへ公開します。通常2回に加えた予備枠です。'))return;emergencyButton.disabled=true;try{const result=await api('/admin/social-emergency',{});scheduleResult.textContent=result.status==='no_new_alerts'?'未配信の新着はありません。':result.status==='processed'?'緊急配信を処理しました。'+result.results.map(r=>r.platform+': '+r.status).join('、'):'緊急配信は実行されませんでした。設定と履歴を確認してください。';}catch(err){scheduleResult.textContent='処理結果を確認できません。再実行せず、Bufferと操作履歴を確認してください。';}finally{emergencyButton.disabled=false}};
const connectionResult=text('p','');connectionResult.setAttribute('role','status');connectionButton.after(connectionResult);
connectionButton.onclick=async()=>{connectionButton.disabled=true;connectionResult.textContent='接続確認中…';try{const data=await api('/admin/social-connection',{});connectionResult.textContent=!data.configured?'Bufferの秘密キーが未設定です。':data.channels.length?'接続確認済み: '+data.channels.map(c=>(c.platform==='x'?'X':'Threads')+' / '+c.name+(c.queuePaused?'（予約キュー停止中）':'')).join('、')+(data.sendingEnabled?'。朝夕の自動公開は有効です。':'。SNS自動公開は無効です。'):'キーは確認できましたが、X・Threadsの接続先が見つかりません。';}catch(err){connectionResult.textContent='Bufferの接続を確認できませんでした。キー・権限・利用制限を確認してください。';}finally{connectionButton.disabled=false}};
const auditButton=text('button','操作履歴を確認');auditButton.onclick=async()=>{bulkButton.disabled=true;list.replaceChildren();try{const data=await api('/admin/audit');message.textContent='最近の操作（最大100件）';for(const event of data.events)list.append(text('p',event.created_at+' / '+event.action+' / '+event.actor))}catch(err){message.textContent=err.message}};publishedButton.after(auditButton);
load();
`);
