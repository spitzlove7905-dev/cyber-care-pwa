/* Same-tab temporary device profile. No network or automatic device detection. */
(()=>{'use strict';
 const key='cc-device-session-v1',legacy='cc-consultation-check-v1',ids=['device','os','version','maker','model'];
 const ttl=15*60*1000,warn=13*60*1000;let state=null,storageOK=true;
 const valid=s=>s&&Number.isFinite(s.at)&&s.at<=Date.now()&&s.data&&ids.every(k=>typeof s.data[k]==='string'&&s.data[k].length<=200)&&(s.savedRaw===null||typeof s.savedRaw==='string');
 try{const raw=sessionStorage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(valid(parsed))state=parsed;else sessionStorage.removeItem(key);}}catch{storageOK=false;}
 const notice=document.createElement('dialog');notice.id='deviceIdleWarning';notice.innerHTML='<h3>端末情報をまもなく削除します</h3><p>操作がない状態が13分続きました。15分で端末・OS情報を削除します。記録・画像・相談文は残ります。</p><button type="button">操作を続ける</button>';
 document.body.append(notice);
 const message=document.createElement('p');message.id='deviceSessionStatus';message.setAttribute('role','status');document.body.append(message);
 const publish=()=>window.dispatchEvent(new Event('cc-device-profile'));
 const persist=()=>{try{if(state)sessionStorage.setItem(key,JSON.stringify(state));else sessionStorage.removeItem(key);}catch{storageOK=false;message.textContent='一時保存が利用できません。この画面内のみ保持します。';}};
 function clear(){const previous=state;state=null;persist();let removed=true;
  try{if(previous?.savedRaw!==null&&previous?.savedRaw!==undefined){if(localStorage.getItem(legacy)===previous.savedRaw)localStorage.removeItem(legacy);else removed=false;}}catch{removed=false;}
  if(notice.open)notice.close();publish();message.textContent=removed?'端末・OS情報を削除しました。記録・画像・相談文は保持しています。':'画面の端末情報を削除しました。保存領域の変更・エラーにより端末保存分は削除できません。確認してください。';return removed;
 }
 function check(){if(!state)return false;const age=Date.now()-state.at;if(age>=ttl){clear();return true;}if(age>=warn&&!notice.open)notice.showModal();return false;}
 function touch(){if(check())return;if(state){state.at=Date.now();persist();}if(notice.open)notice.close();}
 window.CCDeviceSession=Object.freeze({get:()=>{check();return state?{...state.data}:null;},set:data=>{check();state={at:Date.now(),data:Object.fromEntries(ids.map(k=>[k,String(data[k]||'').slice(0,200)])),savedRaw:state?.savedRaw??null};persist();publish();},markSaved:raw=>{if(state){state.savedRaw=raw;persist();}},clear,check,available:()=>storageOK});
 notice.querySelector('button').onclick=touch;notice.addEventListener('cancel',e=>{e.preventDefault();touch();});
 for(const name of ['pointerdown','keydown','input','change','wheel','touchstart'])document.addEventListener(name,touch,{capture:true,passive:true});
 window.addEventListener('pageshow',check);document.addEventListener('visibilitychange',check);setInterval(check,15000);check();
})();
