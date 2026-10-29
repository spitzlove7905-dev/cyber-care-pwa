/* Device-local image evidence and printable evidence records. */
(async () => {
  const status = document.querySelector('#safetyStatus');
  const reportError = error => { status.textContent = '処理を完了できませんでした。入力と旧データは保持しています。' + (error.message || error); };
  try { await window.CCSafe.init(); } catch(error) { reportError(error); return; }
  window.addEventListener('cc-storage-error',()=>{reportError(new Error('保存領域を再確認してください')); document.querySelector('#saveLog').disabled=true;});
  for (const id of ['saveLog','nextFromLog','openStatement','export','pdfLog']) document.getElementById(id).disabled=false;
  const records = () => window.CCSafe.records();
  let busy = false;
  const guarded = async action => {
    if(busy) return false;
    busy=true; status.textContent='';
    const controls=[...document.querySelectorAll('#log input,#log select,#log textarea,#log button,#clearData')];
    const before=controls.map(c=>c.disabled);
    controls.forEach(c=>c.disabled=true);
    try { return await action(); } catch(error) { reportError(error); return false; }
    finally { controls.forEach((c,i)=>c.disabled=before[i]);busy=false; }
  };
  document.querySelector('#log').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  // Deletion is deliberately unavailable in this migration review copy.
  document.querySelector('#clearData').title='旧データ保護のため、この開発コピーでは消去できません';
  document.querySelector('#export').onclick=()=>guarded(async()=>{
    const backup=await window.CCSafe.exportFull(document.querySelector('#statementText').value), link=document.createElement('a');
    link.href=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json'}));
    link.download='cyber-care-development-with-images.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  });
  const restoreInput=document.createElement('input');restoreInput.type='file';restoreInput.accept='.json,application/json';restoreInput.id='restoreBackup';
  const restoreLabel=document.createElement('label');restoreLabel.htmlFor='restoreBackup';restoreLabel.textContent='完全バックアップを復元（既存記録は保持・重複IDは中止）';
  document.querySelector('#export').after(restoreLabel,restoreInput);
  restoreInput.onchange=()=>guarded(async()=>{
    const file=restoreInput.files[0];if(!file)return;if(file.size>180*1024*1024)throw Error('バックアップが大きすぎます');
    const result=await window.CCSafe.restore(JSON.parse(await file.text()));
    status.textContent='復元を完了しました。追加記録 '+result.added+'件。再読込して相談文と画像を確認してください。';
    try { await window.CCSafe.list();await renderRecordsWithImages();if(!dateEdited)loadRecordedWhen();
    const imported=await window.CCSafe.consultation();draftState=imported.stored===null?{text:imported.current,previous:[]}:JSON.parse(imported.stored);draftState.text=imported.current;draftRaw=localStorage.getItem(draftKey);document.querySelector('#statementText').value=imported.current;
    } catch(error) {status.textContent='復元保存は完了しました。表示の更新に失敗したため、再復元せず再読込してください。';}
  });
  const $ = selector => document.querySelector(selector);
  const oldWhen = $('#when');
  const dateField = document.createElement('input');
  dateField.id = 'when'; dateField.type = 'datetime-local'; dateField.setAttribute('aria-label', '日時');
  oldWhen.replaceWith(dateField);
  // Keep stored wall-clock dates as entered; never reinterpret them in another timezone.
  let dateEdited=false, legacyWhen='';
  const dateNote=document.createElement('p');dateNote.className='sub';dateField.after(dateNote);
  const normalizedWhen=value=>{
    const m=String(value||'').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if(!m)return '';const [,y,mo,d,h,mi,se='00']=m;
    const parts=[y,mo,d,h,mi,se].map(Number),dt=new Date(Date.UTC(...[parts[0],parts[1]-1,...parts.slice(2)]));
    if(parts[0]<1000||dt.getUTCFullYear()!==parts[0]||dt.getUTCMonth()+1!==parts[1]||dt.getUTCDate()!==parts[2]||dt.getUTCHours()!==parts[3]||dt.getUTCMinutes()!==parts[4]||dt.getUTCSeconds()!==parts[5])return '';
    return y+'-'+mo.padStart(2,'0')+'-'+d.padStart(2,'0')+'T'+h.padStart(2,'0')+':'+mi+(m[6]?':'+se:'');
  };
  window.CCIncidentDate=()=>dateField.value||legacyWhen;
  const announceWhen=()=>window.dispatchEvent(new Event('cc-incident-date'));
  function loadRecordedWhen(){
    const raw=String(records()[0]?.when||'');dateField.value=normalizedWhen(raw);legacyWhen=dateField.value?'':raw;
    dateNote.textContent=legacyWhen?'保存された日時：'+legacyWhen+'（元の表記を保持。変更する場合は上の日時欄から入力）':'再読込時は最新の記録の発生日時を表示します。';announceWhen();
  }
  for(const name of ['input','change'])dateField.addEventListener(name,()=>{dateEdited=true;legacyWhen='';dateNote.textContent='';announceWhen();});
  loadRecordedWhen();

  const evidenceField = document.createElement('div');
  evidenceField.className = 'field';
  evidenceField.innerHTML = `<label for="evidenceFiles">スクリーンショット・画像（任意）</label><input id="evidenceFiles" type="file" accept="image/*" multiple><p class="sub" style="font-size:.84rem;margin:7px 0">最大5枚、1枚8MBまで。画像はこの端末のブラウザ内だけに保存され、PDFにも表示できます。</p><div id="imagePreview" class="image-preview"></div>`;
  dateField.closest('.field').after(evidenceField);

  const style = document.createElement('style');
  style.textContent = `.image-preview{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.image-preview img,.record-images img{width:92px;height:70px;object-fit:cover;border:1px solid var(--line);border-radius:9px}.record-images{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.record small{color:var(--muted);word-break:break-all}.file-warning{color:#8b5c19;font-size:.9rem}`;
  document.head.append(style);

  const getAllImages = window.CCSafe.images;
  const esc = value => String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c]));
  const sanitize = value => String(value).replace(/(password|passcode|パスワード)\s*[:：=]\s*\S+/gi,'[secret removed]').replace(/(?<!\d)(?:\d[ -]*?){13,19}(?!\d)/g,'[card-number-like text removed]').replace(/(?<!\d)\d{6}(?!\d)/g,'[one-time-code-like text removed]').trim().slice(0,500);
  const toast = message => { const node = $('#toast'); node.textContent = message; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 3000); };
  const toLocal = value => value ? value.replace('T', ' ') : '';

  $('#evidenceFiles').addEventListener('change', event => {
    const files = [...event.target.files]; const preview = $('#imagePreview'); preview.innerHTML = '';
    files.slice(0, 5).forEach(file => { const image = document.createElement('img'); image.alt = file.name; image.src = URL.createObjectURL(file); preview.append(image); });
  });

  async function renderRecordsWithImages() {
    const data = records();
    const container = $('#records');
    if (!data.length) { container.innerHTML = ''; return; }
    container.innerHTML = '';
    for (const record of data) {
      const node = document.createElement('div'); node.className = 'record';
      const images = record.id ? await getAllImages(record.id) : [];
      node.innerHTML = `<time>${esc(record.when || record.saved)}</time><br>${esc(record.event)}${record.sha ? `<br><small>SHA-256: ${record.sha}</small>` : ''}<div class="record-images"></div>`;
      const imageBox = node.querySelector('.record-images');
      images.forEach(item => { const image = document.createElement('img'); image.src = URL.createObjectURL(item.blob); image.alt = item.name; imageBox.append(image); });
      container.append(node);
    }
  }
  window.renderRecords = () => renderRecordsWithImages().catch(reportError);
  $('#openLog').onclick=async()=>{try {await window.CCSafe.list();await renderRecordsWithImages();$('#log').showModal();}catch(error){reportError(error);}};
  renderRecordsWithImages().catch(reportError);

  const savePreparedRecord = async ({ showToast = true } = {}) => guarded(async () => {
    const raw = $('#event').value.trim();
    if (!raw) { if (showToast) toast(document.documentElement.lang === 'ja' ? '何が起きたかを入力してください。' : 'Please describe what happened.'); return false; }
    const files = [...$('#evidenceFiles').files];
    if (files.length > 5 || files.some(file => file.size > 8 * 1024 * 1024)) { if (showToast) toast(document.documentElement.lang === 'ja' ? '画像は5枚まで、1枚8MBまでです。' : 'Use up to 5 images, 8MB each.'); return false; }
    const place = $('#place').value, source = $('#source').value, response = $('#response').value, request = $('#request').value;
    const prepared = [`どこで：${place}`, `誰から・どの経路：${source}`, `何が起きたか：${raw}`, `どのように対応したか：${response}`, `何を相談したいか：${request}`].filter(line => !line.endsWith('：')).join('\n');
    const when = legacyWhen || toLocal(dateField.value), event = sanitize(prepared), saved = new Date().toLocaleString(), id = crypto.randomUUID();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode([when, event].join('\n')));
    const sha = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
    await window.CCSafe.save({ id, event, when, saved, sha }, files);
    $('#event').value = ''; $('#place').value = ''; $('#source').value = ''; $('#response').value = ''; $('#request').value = ''; announceWhen(); $('#evidenceFiles').value = ''; $('#imagePreview').innerHTML = '';
    try { await renderRecordsWithImages(); } catch(error) { status.textContent='保存は完了しましたが、表示に失敗しました。再保存せず再読込してください。'; }
    if (showToast) toast(document.documentElement.lang === 'ja' ? '画像を含む記録を、この端末内に保存しました。' : 'Your record and images were saved on this device.'); return true;
  });
  $('#saveLog').onclick = () => savePreparedRecord();

  async function printableEvidence() {
    const savedRecords = records();
    const parts = [];
    for (const record of savedRecords) {
      const images = record.id ? await getAllImages(record.id) : [];
      const encoded = await Promise.all(images.map(async item => ({ name: item.name, src: await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror=()=>reject(reader.error); reader.onabort=()=>reject(Error('画像の読込みが中止されました')); reader.readAsDataURL(item.blob); }) })));
      parts.push({ record, images: encoded });
    }
    const body = parts.length ? parts.map(({record, images}, index) => `<section><h2>${index + 1}. ${esc(record.when || record.saved)}</h2><p>${esc(record.event).replace(/\n/g,'<br>')}</p><small>SHA-256: ${esc(record.sha || 'not recorded')}</small>${images.length ? `<div class="images">${images.map(image => `<figure><img src="${image.src}" alt="${esc(image.name)}"><figcaption>${esc(image.name)}</figcaption></figure>`).join('')}</div>` : ''}</section>`).join('') : '<p>保存した記録はありません。</p>';
    const win = window.open('', '_blank');
    if (!win) { toast(document.documentElement.lang === 'ja' ? 'ポップアップを許可してから、もう一度お試しください。' : 'Please allow pop-ups, then try again.'); return; }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Cyber Care - evidence record</title><style>body{font-family:system-ui,"Hiragino Sans",Meiryo,sans-serif;max-width:800px;margin:35px auto;padding:0 28px;color:#19213b;line-height:1.6}h1{color:#4355a7;border-bottom:2px solid #dce2f2;padding-bottom:12px}h2{font-size:18px;margin-bottom:5px}section{break-inside:avoid;border-bottom:1px solid #dce2f2;padding:12px 0 18px}.images{display:flex;gap:12px;flex-wrap:wrap;margin-top:13px}figure{margin:0;width:210px}img{max-width:210px;max-height:190px;object-fit:contain;border:1px solid #dce2f2;border-radius:6px}figcaption{font-size:11px;color:#58627f;word-break:break-all}@media print{body{margin:0}.images{break-inside:avoid}}</style></head><body><h1>Cyber Care - Evidence & event record</h1>${body}</body></html>`);
    win.document.close();
    await Promise.all([...win.document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = image.onerror = resolve; })));
    win.focus(); win.print();
  }
  $('#pdfLog').onclick = () => guarded(printableEvidence);

  // Replace the plain consultation text with a calm, local-only speaking guide.
  const statementTargetField = $('#statementTarget').closest('.field');
  const modeField = document.createElement('div');
  modeField.className = 'field';
  modeField.innerHTML = `<label for="statementMode" id="statementModeLabel">伝え方を選ぶ</label><select id="statementMode"><option value="phone">電話で伝える</option><option value="written">フォーム・メールで送る</option></select><p class="sub" id="statementModeHint" style="font-size:.9rem;margin-top:8px"></p>`;
  statementTargetField.after(modeField);
  const overviewButton = document.createElement('button');
  overviewButton.id = 'viewStatement'; overviewButton.type = 'button'; overviewButton.className = 'ghost';
  $('#copyStatement').before(overviewButton);

  const consultationRecords = () => records();
  const consultationLanguage = () => document.documentElement.lang === 'en' ? 'en' : 'ja';
  const consultationFacts = language => {
    const records = consultationRecords();
    if (!records.length) return language === 'ja' ? '（まだ記録がありません。ステップ1で、5W1Hをわかる範囲で入力してください。）' : '(No saved notes yet. In Step 1, enter the 5W1H details you know.)';
    return records.map((record, index) => `${index + 1}. ${record.when || record.saved}\n   ${record.event}`).join('\n');
  };
  const consultationText = () => {
    const language = consultationLanguage();
    const target = $('#statementTarget').value;
    const phone = $('#statementMode').value === 'phone';
    const facts = consultationFacts(language);
    if (language === 'en') {
      if (phone) return `What to say by phone\n\nStart with\n“Hello. I would like advice about a possible cyber incident or unauthorized use. May I share the facts I have confirmed?”\n\nFacts I can confirm\n${facts}\n\nWhat I need help with\n“Please advise on the next steps, preserving evidence, and anything I should do immediately.”\n\nFor anything uncertain, I will say “I do not know yet.”`;
      return `Consultation request draft\n\nI would like advice about a possible cyber incident or unauthorized use.\n\nFacts I can confirm:\n${facts}\n\nWhat I need help with:\nPlease advise on the next steps, evidence preservation, and any immediate protective action.\n\nAnything I cannot confirm is unknown at this time. This is a preparation draft, not an official report.`;
    }
    const destination = target === 'company' ? 'サービス会社・金融機関' : '警察・公的相談窓口';
    if (phone) return `電話で伝える内容（${destination}への相談準備）\n\n最初に\n「サイバー上の件で相談があります。確認できている事実をお伝えしてもよろしいでしょうか。」\n\n確認できている事実\n${facts}\n\n相談したいこと\n「今後必要な対応、証拠の残し方、すぐに行うべきことを教えてください。」\n\n不明な点は「現時点では不明です」と伝えます。`;
    return `${destination}への相談文（下書き）\n\nサイバー上のトラブルまたは不正利用の可能性について相談します。\n\n【確認できている事実】\n${facts}\n\n【相談したいこと】\n今後必要な対応、証拠の残し方、すぐに行うべきことを教えてください。\n\n不明な点は現時点では不明です。これは相談準備用の下書きであり、正式な被害届や公的機関の様式ではありません。`;
  };
  const draftKey=window.CCConfig.draftKey;
  let draftRaw=localStorage.getItem(draftKey);
  let draftState;
  try { const restored=await window.CCSafe.consultation();draftState=restored.stored===null ? (restored.restored!==true&&restored.current===''?null:{text:restored.current,previous:[]}) : JSON.parse(restored.stored);if(draftState)draftState.text=restored.current; if(draftRaw!==null && (!draftState || typeof draftState.text!=='string' || !Array.isArray(draftState.previous)))throw Error('相談文の保存形式が不正です。元データは保持しています'); }
  catch(error) { reportError(error); $('#openStatement').disabled=true; return; }
  const storeDraft = text => {
    if(localStorage.getItem(draftKey)!==draftRaw)throw Error('別の画面で相談文が更新されました。この入力をコピーして保管してください');
    const next={text,previous:draftState?.previous || [],revision:crypto.randomUUID()};
    const raw=JSON.stringify(next);localStorage.setItem(draftKey,raw);draftRaw=raw;draftState=next;
  };
  $('#statementText').value=draftState?.text ?? '';
  $('#statementText').addEventListener('input',()=>{try{storeDraft($('#statementText').value);}catch(error){reportError(error);}});
  window.addEventListener('beforeunload',event=>{
    if(busy || $('#statementText').value !== (draftState?.text ?? '')){event.preventDefault();event.returnValue='';}
  });
  const refreshConsultation = () => {
    if(draftState!==null)return;
    try {storeDraft(consultationText());$('#statementText').value=draftState.text;}catch(error){reportError(error);}
  };
  const regenerate=document.createElement('button');regenerate.type='button';regenerate.id='regenerateStatement';regenerate.textContent='相談文を作り直す / Regenerate';
  $('#statementText').after(regenerate);
  regenerate.onclick=()=>{
    if(!confirm('現在の文面を退避して、新しく作り直しますか？ / Keep a backup and regenerate?'))return;
    try {
      if(localStorage.getItem(draftKey)!==draftRaw)throw Error('別の画面の更新を検知しました');
      const next={revision:crypto.randomUUID(),text:consultationText(),previous:[...(draftState?.previous || []),{text:$('#statementText').value,at:new Date().toISOString()}]};
      const raw=JSON.stringify(next);localStorage.setItem(draftKey,raw);draftRaw=raw;draftState=next;$('#statementText').value=next.text;
    } catch(error) {reportError(error);}
  };
  const downloadDraft=document.createElement('button');downloadDraft.type='button';downloadDraft.textContent='現在の相談文を保存 / Save current draft';
  regenerate.after(downloadDraft);downloadDraft.onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([$('#statementText').value],{type:'text/plain;charset=utf-8'}));a.download='consultation-draft.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  const localizeConsultation = () => {
    const english = consultationLanguage() === 'en';
    $('#openLog').querySelector('h3').textContent = english ? 'Record & prepare 5W1H' : '記録・5W1Hの相談準備';
    $('#openLog').querySelector('p').textContent = english ? 'Organize facts into a 5W1H preparation note for your consultation.' : '日時と出来事を、相談で伝える5W1Hとして整理します。';
    $('#log h2').textContent = english ? 'Record & prepare 5W1H' : '記録・5W1Hの相談準備';
    $('#statementModeLabel').textContent = english ? 'How would you like to use this?' : '伝え方を選ぶ';
    $('#statementMode').options[0].text = english ? 'Speak by phone' : '電話で伝える';
    $('#statementMode').options[1].text = english ? 'Send by form or email' : 'フォーム・メールで送る';
    $('#statementModeHint').textContent = english ? 'A short guide will put facts first and make it easier to answer questions.' : '事実を先に、短く伝えられるように整えます。';
    overviewButton.textContent = english ? 'View full text for a call' : '電話で確認する（全文表示）';
    $('#statementOverviewTitle').textContent = english ? 'Full text for a call' : '電話で確認する';
    $('#statementOverviewNote').textContent = english ? 'Review the complete text in a wide, easy-to-read view during your call.' : '電話中に見やすいよう、作成した内容を広い画面で表示します。';
    $('#copyOverview').textContent = english ? 'Copy' : 'コピー';
    $('#pdfOverview').textContent = english ? 'Save as PDF' : 'PDFとして保存';
    const description = $('#openStatement').querySelector('p');
    if (description) description.textContent = english ? 'Create a clear phone guide or written draft from your notes.' : '記録から、電話や相談フォームで伝える順番を整えます。';
  };
  $('#openStatement').onclick = async () => { try {await window.CCSafe.list();localizeConsultation(); refreshConsultation(); $('#statement').showModal();}catch(error){reportError(error);} };
  const showStatementOverview = () => {
    const text = $('#statementText').value;
    $('#statementOverviewText').textContent = text;
    $('#statementOverview').showModal();
    requestAnimationFrame(() => {
      const view = $('#statementOverviewText');
      let size = 16;
      view.style.fontSize = '';
      while (view.scrollHeight > view.clientHeight && size > 12) { size -= 1; view.style.fontSize = `${size}px`; }
    });
  };
  overviewButton.onclick = showStatementOverview;
  $('#copyOverview').onclick = async () => { await navigator.clipboard.writeText($('#statementOverviewText').textContent); toast(consultationLanguage() === 'en' ? 'Copied' : 'コピーしました'); };
  $('#pdfOverview').onclick = () => savePdf(consultationLanguage() === 'en' ? 'Cyber Care — Consultation request' : 'Cyber Care — 相談文', $('#statementOverviewText').textContent);
  $('#backFromLog').onclick = () => { $('#log').close(); $('#guide').showModal(); window.showResult(); };
  $('#nextFromLog').onclick = async () => { if(busy)return; const saved = $('#event').value.trim() ? await savePreparedRecord({ showToast: false }) : true; if (!saved) return; $('#log').close(); $('#openStatement').click(); };
  $('#backFromStatement').onclick = () => { $('#statement').close(); $('#openLog').click(); };
  $('#nextFromStatement').onclick = () => { $('#statement').close(); $('#openHelp').click(); };
  $('#backFromHelp').onclick = () => { $('#help').close(); $('#openStatement').click(); };
  $('#statementTarget').onchange = refreshConsultation;
  $('#statementMode').onchange = refreshConsultation;
  new MutationObserver(localizeConsultation).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  localizeConsultation();

  // Turn the introductory advice into a persistent, one-step-at-a-time checklist.
  const checklistCard = document.querySelector('.grid > article.card');
  const checklistKey = 'cc-action-checklist-v1';
  const checklistItems = {
    ja: [
      ['account', '大切なアカウントを守る', 'まずメールのパスワードを見直し、可能なら二段階認証を有効にします。'],
      ['record', '見たことを記録する', '日時、相手、画面、金額など、見聞きした事実だけを残します。'],
      ['consult', '必要なら相談する', '電話用ガイドや相談文を使い、公式の窓口へ相談します。']
    ],
    en: [
      ['account', 'Protect important accounts', 'Start with your email password and enable two-factor authentication where possible.'],
      ['record', 'Record what you saw', 'Keep only the facts: dates, people, screens, and amounts.'],
      ['consult', 'Ask for help if needed', 'Use the phone guide or draft, then contact an official support channel.']
    ]
  };
  const loadChecklist = () => { try { return JSON.parse(localStorage.getItem(checklistKey) || '{}'); } catch { return {}; } };
  const saveChecklist = state => localStorage.setItem(checklistKey, JSON.stringify(state));
  const checklistLanguage = () => document.documentElement.lang === 'en' ? 'en' : 'ja';
  function renderChecklist() {
    const language = checklistLanguage();
    const items = checklistItems[language];
    const state = loadChecklist();
    const complete = items.filter(([key]) => state[key]).length;
    const title = language === 'en' ? 'Your next-step checklist' : '最初にすることチェックリスト';
    const note = language === 'en' ? 'Take one step at a time. Your progress stays in this browser on this device.' : '上からひとつずつ進めましょう。完了した項目は、この端末のブラウザに残ります。';
    const caution = language === 'en'
      ? '<strong>A note about unexpected messages</strong><span>Do not use links or contact details in an unexpected email or text. If you need to check whether it is real, open the service from its official app or your own saved bookmark.</span>'
      : '<strong>突然届いたメール・SMSへの注意</strong><span>届いた連絡のリンクや連絡先は使わないでください。本当か確かめる必要があるときは、公式アプリや自分で保存したブックマークからサービスを開きます。</span>';
    const progress = language === 'en' ? `${complete} of ${items.length} complete` : `${items.length}項目中 ${complete}項目を完了`;
    const reset = language === 'en' ? 'Reset this checklist' : 'チェックを最初からやり直す';
    checklistCard.innerHTML = `<h2>${title}</h2><p class="sub">${note}</p><div class="notice" role="note"><span aria-hidden="true">⚠️</span><div>${caution}</div></div><p class="hint" id="checklistProgress" aria-live="polite">${progress}</p><div class="steps" id="actionChecklist"></div><div class="actions" style="justify-content:flex-start"><button class="ghost" type="button" id="resetChecklist">${reset}</button></div>`;
    const container = $('#actionChecklist');
    items.forEach(([key, heading, detail], index) => {
      const item = document.createElement('label');
      item.className = 'step';
      item.style.cursor = 'pointer';
      item.innerHTML = `<input type="checkbox" data-check="${key}" ${state[key] ? 'checked' : ''} style="margin-top:5px;flex:0 0 20px"><span class="n">${index + 1}</span><span><h3>${heading}</h3><p>${detail}</p></span>`;
      item.querySelector('input').addEventListener('change', event => { const next = loadChecklist(); next[key] = event.target.checked; saveChecklist(next); renderChecklist(); });
      container.append(item);
    });
    $('#resetChecklist').onclick = () => { localStorage.removeItem(checklistKey); renderChecklist(); };
  }
  renderChecklist();
  new MutationObserver(renderChecklist).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  for (const id of ['copyStatement','copyOverview']) {
    const button=$('#'+id),handler=button.onclick;
    button.onclick=async()=>{try {await handler();} catch(error) {reportError(error);} };
  }
})();

