/* Device-local image evidence and printable evidence records. */
(() => {
  const $ = selector => document.querySelector(selector);
  const oldWhen = $('#when');
  const dateField = document.createElement('input');
  dateField.id = 'when'; dateField.type = 'datetime-local'; dateField.setAttribute('aria-label', '日時');
  oldWhen.replaceWith(dateField);

  const evidenceField = document.createElement('div');
  evidenceField.className = 'field';
  evidenceField.innerHTML = `<label for="evidenceFiles">スクリーンショット・画像（任意）</label><input id="evidenceFiles" type="file" accept="image/*" multiple><p class="sub" style="font-size:.84rem;margin:7px 0">最大5枚、1枚8MBまで。画像はこの端末のブラウザ内だけに保存され、PDFにも表示できます。</p><div id="imagePreview" class="image-preview"></div>`;
  dateField.closest('.field').after(evidenceField);

  const style = document.createElement('style');
  style.textContent = `.image-preview{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.image-preview img,.record-images img{width:92px;height:70px;object-fit:cover;border:1px solid var(--line);border-radius:9px}.record-images{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.record small{color:var(--muted);word-break:break-all}.file-warning{color:#8b5c19;font-size:.9rem}`;
  document.head.append(style);

  const db = new Promise((resolve, reject) => {
    const request = indexedDB.open('cyber-care-evidence', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const getAllImages = async recordId => new Promise(async (resolve, reject) => {
    const store = (await db).transaction('images', 'readonly').objectStore('images');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result.filter(x => x.recordId === recordId));
    request.onerror = () => reject(request.error);
  });
  const putImages = async (recordId, files) => {
    const database = await db;
    return new Promise((resolve, reject) => {
      const tx = database.transaction('images', 'readwrite');
      files.forEach((file, index) => tx.objectStore('images').put({ id: `${recordId}-${index}`, recordId, name: file.name, blob: file }));
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  };
  const esc = value => String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c]));
  const sanitize = value => String(value).replace(/(password|passcode|パスワード)\s*[:：=]\s*\S+/gi,'[secret removed]').replace(/(?<!\d)(?:\d[ -]*?){13,19}(?!\d)/g,'[card-number-like text removed]').replace(/(?<!\d)\d{6}(?!\d)/g,'[one-time-code-like text removed]').trim().slice(0,500);
  const toast = message => { const node = $('#toast'); node.textContent = message; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 3000); };
  const toLocal = value => value ? value.replace('T', ' ') : '';

  $('#evidenceFiles').addEventListener('change', event => {
    const files = [...event.target.files]; const preview = $('#imagePreview'); preview.innerHTML = '';
    files.slice(0, 5).forEach(file => { const image = document.createElement('img'); image.alt = file.name; image.src = URL.createObjectURL(file); preview.append(image); });
  });

  async function renderRecordsWithImages() {
    const data = JSON.parse(localStorage.getItem('cc-records') || '[]');
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
  window.renderRecords = renderRecordsWithImages;
  renderRecordsWithImages();

  $('#saveLog').onclick = async () => {
    const raw = $('#event').value.trim();
    if (!raw) { toast(document.documentElement.lang === 'ja' ? '何が起きたかを入力してください。' : 'Please describe what happened.'); return; }
    const files = [...$('#evidenceFiles').files];
    if (files.length > 5 || files.some(file => file.size > 8 * 1024 * 1024)) { toast(document.documentElement.lang === 'ja' ? '画像は5枚まで、1枚8MBまでです。' : 'Use up to 5 images, 8MB each.'); return; }
    const when = toLocal(dateField.value), event = sanitize(raw), saved = new Date().toLocaleString(), id = crypto.randomUUID();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode([when, event].join('\n')));
    const sha = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
    const records = JSON.parse(localStorage.getItem('cc-records') || '[]');
    records.unshift({ id, event, when, saved, sha, imageCount: files.length });
    localStorage.setItem('cc-records', JSON.stringify(records));
    await putImages(id, files);
    $('#event').value = ''; dateField.value = ''; $('#evidenceFiles').value = ''; $('#imagePreview').innerHTML = '';
    await renderRecordsWithImages(); toast(document.documentElement.lang === 'ja' ? '画像を含む記録を、この端末内に保存しました。' : 'Your record and images were saved on this device.');
  };

  async function printableEvidence() {
    const records = JSON.parse(localStorage.getItem('cc-records') || '[]');
    const parts = [];
    for (const record of records) {
      const images = record.id ? await getAllImages(record.id) : [];
      const encoded = await Promise.all(images.map(async item => ({ name: item.name, src: await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(item.blob); }) })));
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
  $('#pdfLog').onclick = printableEvidence;

  $('#clearData').onclick = async () => {
    const japanese = document.documentElement.lang === 'ja';
    if (!confirm(japanese ? 'この端末に保存した記録と画像をすべて消去しますか？' : 'Erase all notes and images saved on this device?')) return;
    const database = await db;
    await new Promise((resolve, reject) => {
      const tx = database.transaction('images', 'readwrite');
      tx.objectStore('images').clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    localStorage.removeItem('cc-records');
    await renderRecordsWithImages();
    toast(japanese ? 'この端末の記録と画像を消去しました' : 'Notes and images on this device were erased');
  };
  // Replace the plain consultation text with a calm, local-only speaking guide.
  const statementTargetField = $('#statementTarget').closest('.field');
  const modeField = document.createElement('div');
  modeField.className = 'field';
  modeField.innerHTML = `<label for="statementMode" id="statementModeLabel">伝え方を選ぶ</label><select id="statementMode"><option value="phone">電話で伝える</option><option value="written">フォーム・メールで送る</option></select><p class="sub" id="statementModeHint" style="font-size:.9rem;margin-top:8px"></p>`;
  statementTargetField.after(modeField);

  const consultationRecords = () => JSON.parse(localStorage.getItem('cc-records') || '[]');
  const consultationLanguage = () => document.documentElement.lang === 'en' ? 'en' : 'ja';
  const consultationFacts = language => {
    const records = consultationRecords();
    if (!records.length) return language === 'ja' ? '（まだ記録がありません。「証拠・出来事を記録」から、いつ・何が起きたかを先にメモしてください。）' : '(No saved notes yet. First use “Record evidence & events” to note when and what happened.)';
    return records.map((record, index) => `${index + 1}. ${record.when || record.saved}\n   ${record.event}`).join('\n');
  };
  const consultationText = () => {
    const language = consultationLanguage();
    const target = $('#statementTarget').value;
    const phone = $('#statementMode').value === 'phone';
    const facts = consultationFacts(language);
    if (language === 'en') {
      if (phone) return `Phone consultation guide\n\nStart with:\n“Hello. I would like advice about a possible cyber incident or unauthorized use. I have written down the facts so I can explain them clearly.”\n\nShare the facts in this order:\n${facts}\n\nThen say:\n“I would appreciate guidance on the next steps, how to preserve evidence, and whether there is anything I should do immediately.”\n\nHelpful tip: answer only what you know. If you are unsure, say “I do not know yet.”\n\nThis is a preparation guide, not an official report.`;
      return `Consultation request draft\n\nI would like advice about a possible cyber incident or unauthorized use.\n\nFacts I can confirm:\n${facts}\n\nWhat I need help with:\nPlease advise on the next steps, evidence preservation, and any immediate protective action.\n\nAnything I cannot confirm is unknown at this time. This is a preparation draft, not an official report.`;
    }
    const destination = target === 'company' ? 'サービス会社・金融機関' : '警察・公的相談窓口';
    if (phone) return `電話での伝え方（${destination}への相談準備）\n\n最初に：\n「サイバー上の件で相談があります。確認できている事実を時系列でメモしていますので、相談してもよろしいでしょうか。」\n\n事実は、次の順で短く伝えます：\n${facts}\n\n最後に：\n「今後必要な対応、証拠の残し方、すぐに行うべきことを教えてください。」\n\n伝えるコツ：\n・見たこと、届いたこと、したことだけを伝える\n・わからない点は「現時点では不明です」と伝える\n・担当者の質問に沿って、メモを見ながら答える\n\nこれは相談準備用のガイドであり、正式な被害届や公的機関の様式ではありません。`;
    return `${destination}への相談文（下書き）\n\nサイバー上のトラブルまたは不正利用の可能性について相談します。\n\n【確認できている事実】\n${facts}\n\n【相談したいこと】\n今後必要な対応、証拠の残し方、すぐに行うべきことを教えてください。\n\n不明な点は現時点では不明です。これは相談準備用の下書きであり、正式な被害届や公的機関の様式ではありません。`;
  };
  const refreshConsultation = () => { $('#statementText').value = consultationText(); };
  const localizeConsultation = () => {
    const english = consultationLanguage() === 'en';
    $('#statementModeLabel').textContent = english ? 'How would you like to use this?' : '伝え方を選ぶ';
    $('#statementMode').options[0].text = english ? 'Speak by phone' : '電話で伝える';
    $('#statementMode').options[1].text = english ? 'Send by form or email' : 'フォーム・メールで送る';
    $('#statementModeHint').textContent = english ? 'A short guide will put facts first and make it easier to answer questions.' : '事実を先に、短く伝えられるように整えます。';
    const description = $('#openStatement').querySelector('p');
    if (description) description.textContent = english ? 'Create a clear phone guide or written draft from your notes.' : '記録から、電話や相談フォームで伝える順番を整えます。';
  };
  $('#openStatement').onclick = () => { localizeConsultation(); refreshConsultation(); $('#statement').showModal(); };
  $('#statementTarget').onchange = refreshConsultation;
  $('#statementMode').onchange = refreshConsultation;
  new MutationObserver(localizeConsultation).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  localizeConsultation();

  // Turn the introductory advice into a persistent, one-step-at-a-time checklist.
  const checklistCard = document.querySelector('.grid > article.card');
  const checklistKey = 'cc-action-checklist-v1';
  const checklistItems = {
    ja: [
      ['official', '安全な公式の入口を開く', '不審なリンクや連絡先は使わず、公式アプリか保存済みのブックマークから確認します。'],
      ['account', '大切なアカウントを守る', 'まずメールのパスワードを見直し、可能なら二段階認証を有効にします。'],
      ['record', '見たことを記録する', '日時、相手、画面、金額など、見聞きした事実だけを残します。'],
      ['consult', '必要なら相談する', '電話用ガイドや相談文を使い、公式の窓口へ相談します。']
    ],
    en: [
      ['official', 'Use an official starting point', 'Avoid suspicious links and contact details. Use an official app or a saved bookmark.'],
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
    const progress = language === 'en' ? `${complete} of ${items.length} complete` : `${items.length}項目中 ${complete}項目を完了`;
    const reset = language === 'en' ? 'Reset this checklist' : 'チェックを最初からやり直す';
    checklistCard.innerHTML = `<h2>${title}</h2><p class="sub">${note}</p><p class="hint" id="checklistProgress" aria-live="polite">${progress}</p><div class="steps" id="actionChecklist"></div><div class="actions" style="justify-content:flex-start"><button class="ghost" type="button" id="resetChecklist">${reset}</button></div>`;
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
})();

