/* Creates a browser-local 5W1H consultation draft from saved evidence records. */
(() => {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#brief');
  let currentDraft = '';

  const labels = {
    ja: {
      launcherTitle: '5W1Hの相談準備を確認',
      launcherDesc: '記録から、5W1Hの相談用下書きを自動で整えます。',
      title: '相談内容の最終確認（5W1H）',
      note: 'この端末に保存した記録から自動で作った下書きです。内容を確認・編集してから、相談先を選びます。',
      noRecords: 'まだ記録がありません。ステップ1で、日時と起きたことを記録してから確認してください。',
      resultTitle: '相談準備メモ（自動下書き）',
      resultNote: '外部AIやサーバーには送信せず、この端末のブラウザ内で作成します。内容に誤りがないか、必ず本人が確認してください。これは公的機関の正式様式ではありません。',
      previousStep: 'ステップ1：記録へ戻る',
      copy: 'コピー', download: 'テキスト保存', print: '印刷 / PDF保存', nextHelp: 'ステップ3：相談文を作る', copied: 'コピーしました', unknown: '不明',
      facts: '確認できている事実（5W1H）', request: '相談したいこと', emptyWhen: '日時は記録されていません',
      unknownRoute: '記録だけでは特定できないため、わかる範囲で相談先に伝えます。',
      how: 'この端末内に記録を保存しました。画像を保存している場合は、必要に応じて提示します。',
      why: '記録にある事実について、不正利用やサイバー上のトラブルの可能性を確認したいです。',
      ask: '適切な相談先、追加で保全すべき証拠、すぐに必要な対応を教えてください。'
    },
    en: {
      launcherTitle: 'Review a 5W1H consultation draft',
      launcherDesc: 'Automatically organize your saved notes into a 5W1H draft.',
      title: 'Final review of your consultation (5W1H)',
      note: 'This draft is automatically created from notes saved on this device. Review and edit it before choosing where to seek help.',
      noRecords: 'There are no saved notes yet. First record when and what happened in Step 1.',
      resultTitle: 'Consultation preparation note (automatic draft)',
      resultNote: 'This is created in this browser without sending your notes to an external AI or server. Check it carefully before using it. It is not an official public-authority form.',
      previousStep: 'Back to Step 1: Record',
      copy: 'Copy', download: 'Save text', print: 'Print / save PDF', nextHelp: 'Step 3: Create a consultation note', copied: 'Copied', unknown: 'Unknown',
      facts: 'Facts I can confirm (5W1H)', request: 'What I need help with', emptyWhen: 'No date or time was saved',
      unknownRoute: 'The record does not identify this clearly; I will share what I know with the support service.',
      how: 'I saved a record on this device. If I saved images, I can provide them when needed.',
      why: 'I would like to confirm whether the recorded facts indicate unauthorized use or another cyber incident.',
      ask: 'Please advise on the appropriate contact point, further evidence to preserve, and any action needed immediately.'
    }
  };

  const copy = () => labels[document.documentElement.lang === 'en' ? 'en' : 'ja'];
  const safe = value => String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
  const records = () => { try { return JSON.parse(localStorage.getItem('cc-records') || '[]'); } catch { return []; } };

  function draft() {
    const text = copy();
    const entries = records();
    if (!entries.length) return '';
    const when = entries.map((entry, index) => `${index + 1}. ${entry.when || entry.saved || text.emptyWhen}`).join('\n');
    const what = entries.map((entry, index) => `${index + 1}. ${entry.event || text.unknown}`).join('\n');
    if (document.documentElement.lang === 'en') return `${text.resultTitle}\n\n【${text.facts}】\nWhen:\n${when}\n\nWhere / who / route:\n${text.unknownRoute}\n\nWhat happened:\n${what}\n\nHow I responded:\n${text.how}\n\nWhy I am concerned:\n${text.why}\n\n【${text.request}】\n${text.ask}`;
    return `${text.resultTitle}\n\n【${text.facts}】\nいつ：\n${when}\n\nどこで・誰から・どの経路：\n${text.unknownRoute}\n\n何が起きたか：\n${what}\n\nどのように対応したか：\n${text.how}\n\nなぜ心配しているか：\n${text.why}\n\n【${text.request}】\n${text.ask}`;
  }

  function renderLauncher() {
    const text = copy();
    $('#briefLauncherTitle').textContent = text.launcherTitle;
    $('#briefLauncherDesc').textContent = text.launcherDesc;
  }

  function openDraft() {
    const text = copy();
    const content = currentDraft || draft();
    $('#briefTitle').textContent = text.title;
    $('#briefNote').textContent = text.note;
    $('#briefBar').style.width = '100%';
    $('#briefStep').innerHTML = content
      ? `<div class="field"><h3>${safe(text.resultTitle)}</h3><p class="sub">${safe(text.resultNote)}</p><textarea id="briefResult" aria-label="Consultation preparation note"></textarea></div>`
      : `<div class="hint">${safe(text.noRecords)}</div>`;
    $('#briefActions').innerHTML = content
      ? `<button class="ghost" type="button" id="briefPreviousStep">${safe(text.previousStep)}</button><button class="ghost" type="button" id="briefCopy">${safe(text.copy)}</button><button class="ghost" type="button" id="briefDownload">${safe(text.download)}</button><button class="ghost" type="button" id="briefPrint">${safe(text.print)}</button><button class="secondary" type="button" id="briefHelp">${safe(text.nextHelp)}</button>`
      : `<button class="ghost" type="button" id="briefPreviousStep">${safe(text.previousStep)}</button>`;
    dialog.showModal();
    $('#briefPreviousStep').onclick = () => { if (content) currentDraft = $('#briefResult').value; dialog.close(); $('#openLog').click(); };
    if (!content) return;
    $('#briefResult').value = content;
    $('#briefCopy').onclick = async () => { await navigator.clipboard.writeText($('#briefResult').value); alert(text.copied); };
    $('#briefDownload').onclick = () => {
      const blob = new Blob([$('#briefResult').value], { type: 'text/plain;charset=utf-8' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'cyber-care-consultation-note.txt'; link.click(); URL.revokeObjectURL(link.href);
    };
    $('#briefPrint').onclick = () => {
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(`<!doctype html><meta charset="utf-8"><title>${safe(text.resultTitle)}</title><style>body{font-family:system-ui,"Hiragino Sans",Meiryo,sans-serif;max-width:760px;margin:40px auto;padding:0 24px;line-height:1.7;color:#19213b;white-space:pre-wrap}</style><body>${safe($('#briefResult').value)}</body>`);
      win.document.close(); win.focus(); win.print();
    };
    $('#briefHelp').onclick = () => { currentDraft = $('#briefResult').value; dialog.close(); $('#openStatement').click(); };
  }

  window.CyberCareBrief = { open: openDraft };
  $('#openBrief').onclick = openDraft;
  new MutationObserver(renderLauncher).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  renderLauncher();
})();
