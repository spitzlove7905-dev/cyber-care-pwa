/* Consultation reference only: no network, device detection or statement integration. */
(() => {
  'use strict';
  const key='cc-consultation-check-v1';
  const session=window.CCDeviceSession;
  const host=document.querySelector('#helpLinks');
  if(!host)return;
  const box=document.createElement('section');box.id='consultationCheck';
  box.innerHTML=`<h3>相談時の確認情報 / Consultation details</h3>
<p>質問で回答した情報を一覧で確認できます。修正ボタンからステップ1の該当項目に戻れます。発生日時はステップ1から自動反映します。</p>
<p>「この端末に保存」を押すと、このブラウザ内だけに保存します。自動送信・自動取得はしません。ステップ2の相談文には入りません。既存の記録・画像のバックアップには含まれません。下の専用バックアップを明示的に操作した場合だけファイルに保存できます。共有端末では保存せず、保存した場合は下の専用消去ボタンを使ってください。</p>`;
  const fields=[['device','使用端末 / Device','例：スマートフォン、タブレット、パソコン'],['os','OS名 / OS','例：Android、iOS、iPadOS、Windows、macOS'],['version','OSバージョン / OS version','設定画面で確認した表記'],['maker','メーカー / Manufacturer','例：Apple、Samsung'],['model','機種名 / Model','機種名のみ。IMEI・シリアル番号は不要'],['occurred','問題発生日時 / Incident date and time','例：2026/10/29 14:30頃 日本時間。不明・おおよそでも可']];
  const controls={}, summaries={};
  const question=document.createElement('section');question.id='deviceQuestions';
  question.innerHTML='<h3>問題が起きた端末について（任意）</h3><p>わかる範囲で選択してください。候補は一例です。正確なバージョンや機種名がなければ「その他」で手入力できます。ステップ2の相談文には追加されません。</p>';
  document.querySelector('#when').closest('.field').after(question);
  const options={device:['スマートフォン','パソコン','タブレット'],os:['Android','iOS','iPadOS','Windows','macOS','Linux','ChromeOS'],version:['10','11','12','13','14','15','16','17','18','26','23H2','24H2'],maker:['Apple','Google','Samsung','SHARP','Sony','富士通','NEC','Lenovo','Microsoft','ASUS','Acer','Dell','HP'],model:['iPhone','iPad','Pixel','Galaxy','AQUOS','Xperia','arrows','Surface']};
  const style='display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box';
  for(const [id,title,hint] of fields){
    const row=document.createElement('div');row.style.marginBlock='12px';row.style.overflowWrap='anywhere';
    const label=document.createElement('strong');label.textContent=title;
    const value=document.createElement('p');value.id='summary-'+id;summaries[id]=value;row.append(label,value);box.append(row);
    if(id==='occurred'){
      const output=document.createElement('output');output.id='check-occurred';row.append(output);value.hidden=true;
      Object.defineProperty(output,'value',{get:()=>window.CCIncidentDate?.()??document.querySelector('#when').value,set:()=>{}});controls[id]=output;
      const edit=document.createElement('button');edit.type='button';edit.textContent='日時をステップ1で変更';edit.onclick=()=>openQuestion('when');row.append(edit);continue;
    }
    const field=document.createElement('div');field.className='field';field.id='question-'+id;
    const l=document.createElement('label');l.htmlFor='select-'+id;l.textContent=title;
    const select=document.createElement('select');select.id=l.htmlFor;select.style.cssText=style;
    const input=document.createElement('input');input.id='check-'+id;input.type='text';input.maxLength=200;input.autocomplete='off';input.placeholder=hint;input.setAttribute('aria-label',title+'（手入力）');input.style.cssText=style;
    for(const text of ['',...options[id],'不明','その他（手入力）']){const o=document.createElement('option');o.value=text;o.textContent=text||'選んでください';select.append(o);}
    const sync=()=>{select.value=options[id].includes(input.value)||input.value==='不明'?input.value:input.value?'その他（手入力）':'';input.hidden=select.value!=='その他（手入力）';};
    select.onchange=()=>{input.value=select.value==='その他（手入力）'?'':select.value;input.hidden=select.value!=='その他（手入力）';input.dispatchEvent(new Event('input'));if(!input.hidden)input.focus();};
    input.addEventListener('input',()=>{render();});input.sync=sync;controls[id]=input;
    field.append(l,select,input);question.append(field);
    const edit=document.createElement('button');edit.type='button';edit.textContent='この項目を修正';edit.onclick=()=>openQuestion(select.id);row.append(edit);
  }
  function openQuestion(id){const help=host.closest('dialog');if(help?.open)help.close();document.querySelector('#openLog').click();setTimeout(()=>{const target=document.getElementById(id);target.scrollIntoView({block:'center'});target.focus();},0);}
  function render(){for(const id in controls){if(id==='occurred')controls[id].textContent=controls[id].value.replace(/^(\d{4}-\d{2}-\d{2})T(?=\d{2}:\d{2})/,'$1 ')||'未入力（ステップ1で入力）';else summaries[id].textContent=controls[id].value||'未回答';}}
  document.addEventListener('input',e=>{if(e.target.id==='when'){render();reset();}});
  document.addEventListener('change',e=>{if(e.target.id==='when'){render();reset();}});
  document.querySelector('#openHelp').addEventListener('click',render);
  window.addEventListener('cc-incident-date',()=>{render();reset();});
  const syncControls=()=>{for(const id in controls)controls[id].sync?.();render();};
  const guide=document.createElement('details');guide.innerHTML=`<summary>OS・バージョン・機種の確認方法 / How to check</summary>
<p>Android：「設定」→「デバイス情報」または「タブレット情報」→「Android バージョン」。メーカーにより項目名が異なります。</p>
<p>iPhone / iPad：「設定」→「一般」→「情報」でOSバージョンと機種名を確認。</p>
<p>Windows：「設定」→「システム」→「バージョン情報」で「Windows の仕様」を確認。</p>
<p>Mac：Appleメニュー→「このMacについて」でOSバージョンとモデルを確認。</p>
<p>表示された情報を転記してください。パスワード・認証コード・IMEI・シリアル番号の入力は不要です。</p>
<p>公式案内：<a href="https://support.google.com/android/answer/7680439?hl=ja" target="_blank" rel="noopener noreferrer">Android</a> / <a href="https://support.apple.com/ja-jp/109065" target="_blank" rel="noopener noreferrer">iPhone・iPad</a> / <a href="https://support.microsoft.com/ja-jp/windows/experience/find-information-about-your-windows-device" target="_blank" rel="noopener noreferrer">Windows</a> / <a href="https://support.apple.com/ja-jp/guide/mac-help/syspr35536/mac" target="_blank" rel="noopener noreferrer">Mac</a>（リンクを開くと外部サイトに移動します。入力値は渡しません。）</p>`;
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.id='checkStatus';
  const save=document.createElement('button');save.type='button';save.textContent='この端末に保存 / Save locally';
  const erase=document.createElement('button');erase.type='button';erase.textContent='確認情報だけを消去 / Erase these details';
  let raw=null,readable=false;
  try{
    raw=localStorage.getItem(key);
    const data=raw===null?{}:JSON.parse(raw);
    if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!controls[k]||typeof data[k]!=='string'||data[k].length>200))throw Error();
    for(const id in controls)controls[id].value=data[id]||'';
    const temporary=session?.get();if(temporary)for(const id of ['device','os','version','maker','model'])controls[id].value=temporary[id];
    readable=true;syncControls();
  }catch{status.textContent='保存済み情報を読み込めません。元データは保持しています。再読込して確認してください。';save.disabled=true;erase.disabled=true;}
  const persisted=data=>({...data,occurred:raw===null?'':JSON.parse(raw).occurred||''});
  const unchanged=()=>{if(!readable||localStorage.getItem(key)!==raw)throw Error('別画面の変更を検知しました。入力を控えてから再読込してください。');};
  save.onclick=()=>{try{unchanged();const data={};for(const id in controls)data[id]=controls[id].value;const next=JSON.stringify(persisted(data));localStorage.setItem(key,next);raw=next;session?.set(values());session?.markSaved(raw);status.textContent='このブラウザ内に保存しました。外部送信はしていません。';}catch(e){status.textContent='保存できませんでした。入力は画面内に残っています。'+(e.message||'');}};
  erase.onclick=()=>{if(!confirm('相談時の確認情報だけを消去しますか？ / Erase only these details?'))return;try{unchanged();localStorage.removeItem(key);raw=null;session?.markSaved(null);session?.clear();for(const id in controls)controls[id].value='';syncControls();status.textContent='確認情報を消去しました。ステップ1の日時・記録は保持しています。';}catch(e){status.textContent='消去できませんでした。'+(e.message||'');}};
  for(const input of Object.values(controls))input.addEventListener('input',()=>{status.textContent='未保存の変更があります / Unsaved changes';});
  const backup=document.createElement('button');backup.type='button';backup.textContent='確認情報のバックアップを保存';backup.id='checkExport';
  const warning=document.createElement('p');warning.textContent='確認情報専用バックアップ（記録・画像は含みません）。個人情報を含む可能性がある暗号化されていないファイルです。保存先・共有先に注意してください。画面上の5項目とステップ1の日時を書き出します。旧形式との互換性のため6項目形式を維持します。日時は参照専用で、復元ではステップ1を変更しません。端末内保存とは別の操作です。既存の記録・画像のバックアップと併せて保管してください。';
  const fileLabel=document.createElement('label');fileLabel.textContent='確認情報のバックアップを選んでプレビュー：';
  const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.id='checkImport';fileLabel.append(file);
  const preview=document.createElement('section');preview.id='checkPreview';preview.hidden=true;
  const restore=document.createElement('button');restore.type='button';restore.textContent='選択項目を確認して端末に復元';restore.id='checkRestore';restore.disabled=true;
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='復元を取り消す';
  const values=()=>Object.fromEntries(Object.entries(controls).map(([id,input])=>[id,input.value]));
  const validate=data=>{
    if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==fields.length||fields.some(([id])=>!Object.hasOwn(data,id)||typeof data[id]!=='string'||data[id].length>200))throw Error('6項目の形式が正しくありません。');
    return data;
  };
  let pending=null,loadId=0;
  const reset=()=>{pending=null;loadId++;preview.replaceChildren();preview.hidden=true;restore.disabled=true;file.value='';};
  for(const input of Object.values(controls))input.addEventListener('input',reset);
  backup.onclick=()=>{try{
    const data=validate(values());
    if(!confirm('個人情報を含む可能性のある、暗号化されていない確認情報ファイルを保存しますか？ 記録・画像は含まれません。'))return;
    const blob=new Blob([JSON.stringify({format:'cyber-care-consultation-check',version:1,data},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Cyber-Care-consultation-details.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status.textContent='確認情報のダウンロードを開始しました。保存先でファイルを確認してください。';
  }catch{status.textContent='バックアップを作成できませんでした。入力内容を確認してください。';}};
  file.onchange=async()=>{
    const selected=file.files[0];reset();if(!selected)return;const token=loadId;
    try{
      if(selected.size>16384)throw Error('ファイルが大きすぎます（上限16KB）。');
      const envelope=JSON.parse(await selected.text());if(token!==loadId)return;
      if(!envelope||Array.isArray(envelope)||Object.keys(envelope).sort().join(',')!=='data,format,version'||envelope.format!=='cyber-care-consultation-check'||envelope.version!==1)throw Error('専用バックアップ形式ではありません。');
      const data=validate(envelope.data);unchanged();const before=values(),choices={};
      const title=document.createElement('h4');title.textContent='復元プレビュー（選択した項目だけ反映）';preview.append(title);
      const note=document.createElement('p');note.textContent='現在値がある項目は未選択です。選択すると置き換わります。空のバックアップ値は復元せず、既存値を消しません。記録・画像・相談文は変更しません。';preview.append(note);
      for(const [id,label] of fields){const row=document.createElement('div'),check=document.createElement('input');check.type='checkbox';check.id='restore-'+id;check.disabled=id==='occurred'||!data[id];check.checked=!check.disabled&&!before[id];choices[id]=check;const l=document.createElement('label');l.htmlFor=check.id;l.textContent=label;const current=document.createElement('p');current.textContent='現在：'+(before[id]||'（空欄）');const incoming=document.createElement('p');incoming.textContent='ファイル：'+(data[id]||'（空欄・復元対象外）');row.style.overflowWrap='anywhere';row.append(check,l,current,incoming);preview.append(row);}
      pending={data,before,choices};preview.hidden=false;restore.disabled=false;status.textContent='内容を確認して復元する項目を選んでください。日時は参照専用で復元対象外です。まだ保存していません。';
    }catch(e){if(token!==loadId)return;reset();status.textContent='復元できません。元データは変更していません。'+(e.message||'');}
  };
  restore.onclick=()=>{try{
    if(!pending)throw Error('ファイルを選び直してください。');unchanged();
    if(JSON.stringify(values())!==JSON.stringify(pending.before))throw Error('画面の値が変わりました。プレビューをやり直してください。');
    const selected=fields.filter(([id])=>pending.choices[id].checked&&!pending.choices[id].disabled);
    if(!selected.length){status.textContent='復元する項目を選択してください。';return;}
    if(!confirm('次の項目を端末内に保存します。選んだ既存値は置き換わります。\n'+selected.map(([,label])=>label).join('\n')+'\n復元しますか？'))return;
    unchanged();const next={...pending.before};for(const [id] of selected)next[id]=pending.data[id];
    const encoded=JSON.stringify(persisted(validate(next)));localStorage.setItem(key,encoded);raw=encoded;session?.set(values());session?.markSaved(raw);
    for(const id in controls)controls[id].value=next[id];syncControls();reset();status.textContent='選択項目をこの端末に復元しました。記録・画像・相談文は変更していません。';
  }catch(e){status.textContent='復元できませんでした。'+(e.message||'');}};
  cancel.onclick=()=>{reset();status.textContent='復元を取り消しました。保存データは変更していません。';};
  save.addEventListener('click',reset);erase.addEventListener('click',reset);
  box.append(guide,save,erase,warning,backup,fileLabel,preview,restore,cancel,status);host.after(box);
  // Keep a single temporary profile for related features and navigation in this tab.
  if(!session?.get()&&Object.values(controls).some(c=>c.id!=='check-occurred'&&c.value)) {session?.set(values());session?.markSaved(raw);}
  for(const id of ['device','os','version','maker','model'])controls[id].addEventListener('input',()=>session?.set(values()));
  window.addEventListener('cc-device-profile',()=>{const data=session.get();if(!data){for(const id of ['device','os','version','maker','model'])controls[id].value='';try{raw=localStorage.getItem(key);}catch{}syncControls();reset();}});
  const note=document.createElement('p');note.textContent='入力した端末・OS情報は同じタブの操作中に再利用できます。13分無操作で案内し、15分で画面・一時保存・この機能の端末保存分を削除します。操作で延長します。記録・画像・相談文と保存済みファイルは削除しません。';question.append(note);
  const finish=document.createElement('button');finish.type='button';finish.id='finishConsultation';finish.textContent='相談を終了する';box.append(finish);
  const ending=document.createElement('dialog');ending.id='consultationEnd';ending.innerHTML='<h3>相談を終了する</h3><p>PDFには端末・OS情報、発生日時と現在の相談文を含みます。画像は含みません。画像付き記録は従来のPDF・完全バックアップで保存してください。削除対象は今回の端末・OS情報です。既存記録・画像・相談文は残ります。</p><button type="button" id="endPdf">PDFで保存する</button><p id="endPdfStatus" role="status"></p><button type="button" id="endSaved" hidden>PDFの保存を確認して終了・端末情報を削除</button><button type="button" id="endDelete">PDFを保存せず端末情報を削除して終了</button><button type="button" id="endCancel">相談を続ける</button>';
  document.body.append(ending);
  finish.onclick=()=>{session?.check();ending.querySelector('#endSaved').hidden=true;ending.querySelector('#endPdfStatus').textContent='';ending.showModal();};
  const done=()=>{const ok=session.clear();ending.close();if(host.closest('dialog').open)host.closest('dialog').close();status.textContent=ok?'相談を終了しました。端末情報を削除しました。':'端末保存分を削除できませんでした。画面下の案内を確認してください。';};
  ending.querySelector('#endDelete').onclick=()=>{if(confirm('端末・OS情報を削除して終了しますか？記録・画像・相談文は残ります。'))done();};
  ending.querySelector('#endCancel').onclick=()=>ending.close();
  ending.querySelector('#endSaved').onclick=()=>{if(confirm('PDFファイルが保存されたことを確認しましたか？端末・OS情報を削除して終了します。'))done();};
  ending.querySelector('#endPdf').onclick=()=>{const win=window.open('','_blank');if(!win){ending.querySelector('#endPdfStatus').textContent='PDF画面を開けませんでした。端末情報は保持しています。ポップアップの許可を確認してください。';return;}
    const title=win.document.createElement('title');title.textContent='Cyber Care 相談情報';win.document.head.append(title);const style=win.document.createElement('style');style.textContent='body{font-family:system-ui,sans-serif;line-height:1.7;padding:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}';win.document.head.append(style);
    const content=win.document.createElement('pre');content.textContent=fields.map(([id,label])=>label+'：'+(controls[id].value||'未回答')).join('\n')+'\n\n相談文\n'+document.querySelector('#statementText').value;win.document.body.append(content);win.document.close();
    try{win.focus();win.print();ending.querySelector('#endSaved').hidden=false;ending.querySelector('#endPdfStatus').textContent='印刷画面で「PDFに保存」を選んでください。保存は自動確認できません。取消・失敗なら「相談を続ける」を選べます。保存を確認するまでは削除しません。';}catch{ending.querySelector('#endPdfStatus').textContent='印刷を開始できませんでした。情報は保持しています。';}
  };

})();

