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
 function shareControl(a,c){
  const group=document.createElement('div');group.className='alert-share';group.style.textAlign='right';group.style.marginTop='12px';
  const button=node('button',lang==='ja'?'この速報を共有':'Share this alert');button.type='button';button.style.fontSize='0.85rem';button.style.padding='7px 11px';button.style.margin='0';button.style.border='1px solid #b9cbd5';button.style.borderRadius='6px';button.style.background='#fff';button.style.minHeight='36px';
  const status=node('p','');status.style.fontSize='0.8rem';status.style.margin='6px 0 0';status.setAttribute('role','status');group.append(button,status);
  const language=lang;const canonical=new URL('/alerts',location.origin);canonical.searchParams.set('id',a.id);
  button.onclick=async()=>{
   button.disabled=true;
   try{
    if(typeof navigator.share==='function'){
     try{await navigator.share({title:c.title,url:canonical.href});return;}catch(error){if(error.name==='AbortError')return;}
    }
    if(navigator.clipboard?.writeText){
     try{await navigator.clipboard.writeText(canonical.href);status.textContent=language==='ja'?'速報のリンクをコピーしました。':'Alert link copied.';return;}catch{}
    }
    status.textContent=language==='ja'?'下のURLを選択してコピーしてください。':'Select and copy the URL below.';
    let input=group.querySelector('input');if(!input){input=document.createElement('input');input.readOnly=true;input.style.width='100%';input.setAttribute('aria-label',language==='ja'?'共有用の速報URL':'Alert URL to share');group.append(input);}
    input.value=canonical.href;input.focus();input.select();
   }finally{button.disabled=false;}
  };return group;
 }
 function about(t){const s=document.createElement('p');s.append(node('span',lang==='ja'?'困ったときの記録や相談準備には、Cyber Careをご利用ください。':'Cyber Care can help you prepare notes and organize a request for support.'));const a=node('a',t.open);a.href='https://cyber-care-pwa.pages.dev/?lang='+lang;a.rel='noreferrer';s.append(document.createElement('br'),a);return s;}
 function render(){const t=copy[lang];document.documentElement.lang=lang;document.title=t.heading+' | Cyber Care';selector.value=lang;document.querySelector('header h1').textContent=t.heading;document.querySelector('header a').textContent=t.back;document.querySelector('header a').href='https://cyber-care-pwa.pages.dev/?lang='+lang;document.getElementById('intro').textContent=t.intro;document.getElementById('message').textContent=loading?t.loading:failed?t.error:alerts.length?'':t.empty;
  const list=document.getElementById('list');list.replaceChildren();
  for(const a of alerts){
   const c=a.languages[lang];const article=document.createElement('article');if(a.informationKind==='history')article.append(node('p',lang==='ja'?'過去の重大事件・注意喚起（新着速報ではありません）':'Historical incident / advisory (not breaking news)'));article.append(node('h2',c.title));
   const labels=lang==='ja'?['対象の人','どんな問題か','今すること']:['Who this affects','What happened','What to do now'];
   for(const [i,value] of [c.target,c.issue,c.action].entries())article.append(node('h3',labels[i]),node('p',value));
   article.append(node('h3',lang==='ja'?'メーカー公式の対策情報':'Official vendor mitigation guidance'));
   const guidance=a.officialGuidance;let guidanceUrl=null;
   try{const parsed=new URL(guidance?.url);if(parsed.protocol==='https:'&&!parsed.username&&!parsed.password)guidanceUrl=parsed;}catch{}
   if(guidance?.status==='verified'&&guidanceUrl){
    const link=node('a',lang==='ja'?'メーカー公式の対策ページを開く（外部サイト）':'Open the official vendor mitigation page (external site)');
    link.href=guidanceUrl.href;link.target='_blank';link.rel='noopener noreferrer';article.append(link);
    article.append(node('p',lang==='ja'?'対象バージョンや具体的な対策は、リンク先の最新の公式案内で確認してください。':'Check the latest official guidance for affected versions and specific mitigation steps.'));
    if(guidance.verifiedAt)article.append(node('small',(lang==='ja'?'リンク確認日: ':'Link checked: ')+guidance.verifiedAt));
   }else{
    article.append(node('p',lang==='ja'?'現時点で、こちらではメーカー公式の対策ページを確認できていません。対策が未発表、または存在しないという意味ではありません。':'We have not yet verified an official vendor mitigation page. This does not mean that mitigation has not been announced or does not exist.'));
   }
   if(a.publishedAt)article.append(node('small',t.date+': '+new Date(a.publishedAt).toLocaleString(lang==='ja'?'ja-JP':'en-US')));
   article.append(about(t),shareControl(a,c));list.append(article);
  }
  const footer=document.getElementById('about');footer.replaceChildren();if(!alerts.length)footer.append(about(t));
 }
 selector.onchange=()=>{lang=selector.value;try{localStorage.setItem('cyber-care-alert-language',lang);}catch{}const u=new URL(location.href);u.searchParams.set('lang',lang);history.replaceState(null,'',u);render();};render();
 const id=query.get('id');const digest=query.get('digest');const preview=location.pathname==='/admin/preview';
 if(preview){const notice=node('p','管理者用の下書きプレビュー / Private draft preview');document.querySelector('header').after(notice);}
 fetch(id?(preview?'/admin/preview-data/':'/v1/alerts/')+encodeURIComponent(id):digest?'/v1/digests/'+encodeURIComponent(digest):'/v1/alerts').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{alerts=id?[data.alert]:data.alerts;loading=false;render();}).catch(()=>{loading=false;failed=true;render();});
})();`;
