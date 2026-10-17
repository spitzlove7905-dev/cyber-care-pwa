const shell = (title, body, script) => `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Cyber Care</title><style>body{font-family:system-ui,sans-serif;max-width:850px;margin:auto;padding:24px;background:#f5f8fa;color:#172e3d}a{color:#005e88}article,section{background:white;border:1px solid #b9cbd5;border-radius:12px;padding:20px;margin:20px 0}button,input{font:inherit;padding:12px;margin:4px;max-width:90%}button{cursor:pointer}button:disabled{cursor:default}h1{font-size:1.6rem}p{line-height:1.7}label{display:block}#message{min-height:2em}small{color:#435968}</style><header><a href="https://cyber-care-pwa.pages.dev/">Cyber Careへ戻る</a><h1>${title}</h1></header>${body}<script>${script}</script></html>`;

const renderHelpers = `
function text(tag, value) { const e=document.createElement(tag); e.textContent=value || ''; return e; }
function card(a) {
 const e=document.createElement('article');
 e.append(text('h2',a.title),text('p',a.summary),text('h3','公式の対処案内（原文）'),text('p',a.recommendedAction),text('p','判定根拠: '+a.evidence.join(' / ')),text('small','優先度スコア: '+a.severityScore+' / 100（CVSSではありません）'));
 const u=new URL(a.sourceUrl); if(u.protocol==='https:' && u.hostname==='www.cisa.gov') { const l=text('a','CISA公式情報を確認'); l.href=u.href; l.target='_blank'; l.rel='noopener noreferrer'; e.append(document.createElement('br'),l); }
 return e;
}
`;

export const alertsPage = shell('重大サイバーセキュリティ速報', `<p>公式情報を確認した速報を掲載します。対象製品・バージョンと対処方法は必ず公式の案内で確認してください。</p><p id="message" role="status">読み込み中…</p><main id="list"></main>`, renderHelpers + `
fetch('/v1/alerts').then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{
 document.getElementById('message').textContent=data.alerts.length?'公開済みの速報':'現在、公開済みの速報はありません。安全が保証されるという意味ではありません。';
 for(const a of data.alerts) {const e=card(a);e.append(text('p','公開日時: '+a.publishedAt));document.getElementById('list').append(e)}
}).catch(()=>{document.getElementById('message').textContent='速報を取得できませんでした。時間をおいて再度確認してください。'});
`);

export const adminPage = shell('速報の承認待ち', `<p>公式の対象・影響範囲・対処を確認してから判断してください。取得原文は英語のまま表示します。</p><section><label for="token">管理用トークン</label><input id="token" type="password" autocomplete="off"><button id="load">一覧を読み込む</button><button id="logout">終了</button><p>トークンはこの画面のメモリだけで使用します。共有端末では終了ボタンを押してください。</p></section><p id="message" role="status"></p><main id="list"></main>`, renderHelpers + `
let token=''; let enabled=false;
const message=document.getElementById('message'); const list=document.getElementById('list');
async function api(path,body) {const r=await fetch(path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error(r.status===401?'認証できませんでした。':r.status===409?'内容が更新されたか、審査済みです。一覧を読み直してください。':'操作できませんでした。設定や接続を確認してください。');return r.json()}
async function load() {
 list.replaceChildren(); message.textContent='読み込み中…';
 try {enabled=(await api('/admin/status')).reviewActionsEnabled;const data=await api('/admin/pending');message.textContent=data.alerts.length+'件（最大100件）'+(enabled?'':'。現在は確認専用です。公開・却下操作は無効です。');
 for(const a of data.alerts) {const e=card(a);for(const [label,status] of [['公開を承認','published'],['却下','rejected']]) {const b=text('button',label);b.disabled=!enabled;b.onclick=async()=>{if(!confirm(a.title+' を'+label+'しますか？'+(status==='published'?'一般の人が閲覧できるようになります。':'')))return; b.disabled=true;try{await api('/admin/review',{id:a.id,contentHash:a.contentHash,status});await load()}catch(err){message.textContent=err.message}};e.append(b)}list.append(e)}
 }catch(err){message.textContent=err.message}
}
document.getElementById('load').onclick=()=>{token=document.getElementById('token').value;document.getElementById('token').value='';load()};
document.getElementById('logout').onclick=()=>{token='';list.replaceChildren();document.getElementById('token').value='';message.textContent='終了しました。'};
`);
