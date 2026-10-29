import {searchTerms} from './security-data.js';
import {databaseText} from './security-database-language.js';
(() => {
 const session=window.CCDeviceSession,query=document.querySelector('#query');
 if(!session||!query)return;
 const text=value=>databaseText(value,document.documentElement.lang);
 const normalize=value=>value.normalize('NFKC').toLocaleLowerCase('ja');
 const encode=value=>/\s|["\\]/.test(value)?JSON.stringify(value):value;
 const box=document.createElement('section');box.id='deviceReuse';
 const title=document.createElement('h2');title.textContent=text('自分の端末に関係する情報を探す');
 const note=document.createElement('p');note.textContent=text('質問で入力した情報を複数選択できます。選択中は色が変わり、もう一度押すと解除できます。入力値は外部送信しません。検索結果は文字列の一致であり、影響の有無を判定するものではありません。');
 const choices=document.createElement('div');choices.className='device-keywords';
 box.append(title,note,choices);query.closest('form').before(box);
 let previous=[];
 function sync(){
  const selected=new Set(searchTerms(query.value).map(normalize));
  for(const button of choices.querySelectorAll('button'))button.setAttribute('aria-pressed',String(selected.has(normalize(button.dataset.keyword))));
 }
 function apply(terms){query.value=terms.map(encode).join(' ');query.dispatchEvent(new Event('input',{bubbles:true}));}
 function render(){
  const data=session.get(),next=[],seen=new Set();
  for(const key of ['os','maker','model','version','device']){
   const value=data?.[key]?.trim();
   if(!value||value==='不明'||seen.has(normalize(value)))continue;
   seen.add(normalize(value));next.push(value);
  }
  const retired=new Set(previous.filter(value=>!seen.has(normalize(value))).map(normalize));
  previous=next;choices.replaceChildren();
  if(!data)choices.textContent=text('端末情報は未入力、または削除済みです。質問画面で入力できます。');
  for(const value of next){
   const button=document.createElement('button');button.type='button';button.textContent=value;button.dataset.keyword=value;
   button.onclick=()=>{
    if(!session.get())return;
    const terms=searchTerms(query.value),selected=terms.some(term=>normalize(term)===normalize(value));
    apply(selected?terms.filter(term=>normalize(term)!==normalize(value)):[...terms,value]);
   };
   choices.append(button);
  }
  const terms=searchTerms(query.value),kept=terms.filter(term=>!retired.has(normalize(term)));
  if(kept.length!==terms.length)apply(kept);
  sync();
 }
 query.addEventListener('input',sync);
 query.closest('form').addEventListener('reset',()=>setTimeout(sync,0));
 window.addEventListener('cc-device-profile',render);render();
})();
