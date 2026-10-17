// Raw browser script prevents the Worker bundler from injecting helper calls.
export const publicPageScript = String.raw`(() => {
 const copy={
  ja:{heading:'重大サイバーセキュリティ速報',back:'Cyber Careへ',intro:'公式情報を確認した速報です。対象製品・バージョンと対処方法は公式の案内で確認してください。',loading:'読み込み中…',empty:'現在、公開済みの速報はありません。安全が保証されるという意味ではありません。',error:'速報を取得できませんでした。時間をおいて再度確認してください。',action:'対処の案内',source:'CISA公式情報を確認',original:'英語の公式原文を確認',date:'公開日時',share:'この速報のリンク',about:'Cyber Careについて',description:'Cyber Careは、情報漏えいや不正利用が心配なとき、次の行動を整理し、記録や相談文を端末内で作るための支援ツールです。',open:'Cyber Careを開く'},
  en:{heading:'Critical cybersecurity alerts',back:'Go to Cyber Care',intro:'Advisories based on verified official sources. Check affected products, versions and mitigation steps in the official guidance.',loading:'Loading…',empty:'No published alerts at present. This does not guarantee safety.',error:'Unable to load alerts. Please try again later.',action:'Recommended action',source:'Read the official CISA source',original:'Read the original English advisory',date:'Published',share:'Link to this alert',about:'About Cyber Care',description:'Cyber Care helps you organize next steps when you are concerned about a data leak or unauthorized use, and prepare notes and consultation drafts stored on your device.',open:'Open Cyber Care'}
 };
 const query=new URLSearchParams(location.search);let saved='';try{saved=localStorage.getItem('cyber-care-alert-language')||'';}catch{}
 let lang=['ja','en'].includes(query.get('lang'))?query.get('lang'):['ja','en'].includes(saved)?saved:navigator.language.toLowerCase().startsWith('ja')?'ja':'en';
 const selector=document.getElementById('alert-language');let alerts=[],loading=true,failed=false;
 function node(tag,value){const e=document.createElement(tag);e.textContent=value||'';return e;}
 function about(t){const s=document.createElement('p');s.append(node('span',lang==='ja'?'困ったときの記録や相談準備には、Cyber Careをご利用ください。':'Cyber Care can help you prepare notes and organize a request for support.'));const a=node('a',t.open);a.href='https://cyber-care-pwa.pages.dev/?lang='+lang;a.rel='noreferrer';s.append(document.createElement('br'),a);return s;}
 function render(){const t=copy[lang];document.documentElement.lang=lang;document.title=t.heading+' | Cyber Care';selector.value=lang;document.querySelector('header h1').textContent=t.heading;document.querySelector('header a').textContent=t.back;document.querySelector('header a').href='https://cyber-care-pwa.pages.dev/?lang='+lang;document.getElementById('intro').textContent=t.intro;document.getElementById('message').textContent=loading?t.loading:failed?t.error:alerts.length?'':t.empty;
  const list=document.getElementById('list');list.replaceChildren();
  for(const a of alerts){
   const c=a.languages[lang];const article=document.createElement('article');article.append(node('h2',c.title));
   const labels=lang==='ja'?['対象の人','どんな問題か','今すること']:['Who this affects','What happened','What to do now'];
   for(const [i,value] of [c.target,c.issue,c.action].entries())article.append(node('h3',labels[i]),node('p',value));
   const details=document.createElement('details');details.append(node('summary',lang==='ja'?'詳しく見る':'Read more'),node('small',c.label));
   if(lang==='ja')details.append(node('p',c.summary),node('h3','公式の説明・対処方法（英語原文）'));
   details.append(node('p',a.languages.en.summary),node('p',a.languages.en.recommendedAction));
   const source=node('a',t.source);source.href=a.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';details.append(node('p',a.cveId),source);
   if(a.publishedAt)details.append(node('p',t.date+': '+new Date(a.publishedAt).toLocaleString(lang==='ja'?'ja-JP':'en-US')));
   article.append(details);const share=node('a',t.share);share.href='/alerts?id='+encodeURIComponent(a.id);article.append(share,about(t));list.append(article);
  }
  const footer=document.getElementById('about');footer.replaceChildren();if(!alerts.length)footer.append(about(t));
 }
 selector.onchange=()=>{lang=selector.value;try{localStorage.setItem('cyber-care-alert-language',lang);}catch{}const u=new URL(location.href);u.searchParams.set('lang',lang);history.replaceState(null,'',u);render();};render();
 const id=query.get('id');fetch(id?'/v1/alerts/'+encodeURIComponent(id):'/v1/alerts').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{alerts=id?[data.alert]:data.alerts;loading=false;render();}).catch(()=>{loading=false;failed=true;render();});
})();`;
