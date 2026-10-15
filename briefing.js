/* A browser-local, guided 5W1H consultation-preparation worksheet. */
(() => {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#brief');
  const values = {};
  let step = 0;

  const labels = {
    ja: {
      title: '相談・提出用メモ', note: '事実を順番に整理します。わからない項目は「不明」のままで進められます。',
      steps: [
        ['when', 'いつ起きましたか？', '例：2026年10月15日 14:30ごろ ／ 不明', '日時はおおよそでも大丈夫です。'],
        ['where', 'どこで起きましたか？', '例：銀行を名乗るSMS、○○サービス、メールアプリ', 'サービス名、サイト、アプリ、端末などを記入します。'],
        ['who', '誰から・どの経路でしたか？', '例：表示名○○、不明な電話番号、公式を装うメール', '相手が不明なら「不明」で問題ありません。'],
        ['what', '何が起きましたか？', '見たこと・届いたこと・起きたことを短く', '推測ではなく、確認できた事実を記入してください。'],
        ['how', 'どのような状況でしたか？', '例：リンクは開いていない。画面を保存した。', '操作したこと、保存した資料、金額や表示内容を記入します。'],
        ['why', 'なぜ心配していますか？', '例：身に覚えのないログイン通知があった ／ 不明', '原因の断定は不要です。心配な理由や不明点を書きます。'],
        ['request', 'すでにした対応と、相談したいこと', '例：カード会社に連絡済み。影響範囲と次に必要な対応を知りたい。', '相手に確認したいことを、短くまとめます。']
      ],
      back: '戻る', next: '次へ', preview: '下書きを確認', required: '「何が起きたか」を入力してください。',
      resultTitle: '相談・提出準備メモ（下書き）', resultNote: '内容を確認してからコピー、保存、または印刷してください。これは公的機関の正式様式ではありません。',
      copy: 'コピー', download: 'テキスト保存', print: '印刷 / PDF保存', startAgain: '最初からやり直す', copied: 'コピーしました', unknown: '不明', facts: '確認できている事実（5W1H）', actions: '対応したこと・相談したいこと', disclaimer: 'この文書は相談・提出の準備用メモです。犯罪や被害の事実を断定するものではありません。'
    },
    en: {
      title: 'Consultation preparation note', note: 'We will organize the facts step by step. You may leave an unknown item as “Unknown.”',
      steps: [
        ['when', 'When did it happen?', 'Example: About 2:30 pm on October 15, 2026 / Unknown', 'An approximate date or time is fine.'],
        ['where', 'Where did it happen?', 'Example: A text claiming to be my bank, a service, or an email app', 'Enter the service, site, app, or device.'],
        ['who', 'Who contacted you or what was the route?', 'Example: A displayed name, unknown phone number, or email', 'It is fine to write “Unknown.”'],
        ['what', 'What happened?', 'Briefly describe what you saw, received, or experienced', 'Write confirmed facts rather than a guess.'],
        ['how', 'What was the situation?', 'Example: I did not open the link. I saved a screenshot.', 'Record actions, saved material, amounts, or displayed details.'],
        ['why', 'Why are you concerned?', 'Example: I received an unfamiliar sign-in notice / Unknown', 'Do not try to determine the cause; note your concern or uncertainty.'],
        ['request', 'What have you done, and what do you need help with?', 'Example: I contacted my card company. I need to know the impact and next steps.', 'Keep the request short and clear.']
      ],
      back: 'Back', next: 'Next', preview: 'Review draft', required: 'Please describe what happened.',
      resultTitle: 'Consultation preparation note (draft)', resultNote: 'Review the content before copying, saving, or printing. This is not an official public-authority form.',
      copy: 'Copy', download: 'Save text', print: 'Print / save PDF', startAgain: 'Start again', copied: 'Copied', unknown: 'Unknown', facts: 'Confirmed facts (5W1H)', actions: 'Actions taken and help requested', disclaimer: 'This document is a preparation note for consultation or submission. It does not determine that a crime or loss has occurred.'
    }
  };

  const copy = () => labels[document.documentElement.lang === 'en' ? 'en' : 'ja'];
  const safe = value => String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
  const valueFor = key => values[key] && values[key].trim() ? values[key].trim() : copy().unknown;

  function renderLauncher() {
    const english = document.documentElement.lang === 'en';
    $('#briefLauncherTitle').textContent = english ? 'Prepare a consultation note' : '相談・提出用メモを整える';
    $('#briefLauncherDesc').textContent = english ? 'Answer simple questions to create a 5W1H preparation note.' : '質問に答えるだけで、5W1Hの相談準備メモを作れます。';
  }

  function renderStep() {
    const text = copy();
    const current = text.steps[step];
    $('#briefTitle').textContent = text.title;
    $('#briefNote').textContent = text.note;
    $('#briefBar').style.width = `${(step / text.steps.length) * 100}%`;
    const multiline = ['what', 'how', 'why', 'request'].includes(current[0]);
    $('#briefStep').innerHTML = `<div class="field"><label for="briefInput">${safe(current[1])}</label>${multiline ? `<textarea id="briefInput" placeholder="${safe(current[2])}"></textarea>` : `<input id="briefInput" type="text" placeholder="${safe(current[2])}">`}<p class="sub" style="font-size:.9rem;margin-top:8px">${safe(current[3])}</p></div>`;
    $('#briefInput').value = values[current[0]] || '';
    $('#briefBack').textContent = text.back;
    $('#briefBack').style.visibility = step ? 'visible' : 'hidden';
    $('#briefNext').textContent = step === text.steps.length - 1 ? text.preview : text.next;
    $('#briefInput').focus();
  }

  function report() {
    const text = copy();
    return `${text.resultTitle}\n\n${text.disclaimer}\n\n【${text.facts}】\nいつ：${valueFor('when')}\nどこで：${valueFor('where')}\n誰から・どの経路：${valueFor('who')}\n何が起きたか：${valueFor('what')}\nどのような状況か：${valueFor('how')}\nなぜ心配しているか・不明点：${valueFor('why')}\n\n【${text.actions}】\n${valueFor('request')}`;
  }

  function showResult() {
    const text = copy();
    $('#briefBar').style.width = '100%';
    $('#briefStep').innerHTML = `<div class="field"><h3>${safe(text.resultTitle)}</h3><p class="sub">${safe(text.resultNote)}</p><textarea id="briefResult" aria-label="Consultation preparation note"></textarea></div>`;
    $('#briefResult').value = report();
    $('#briefActions').innerHTML = `<button class="ghost" type="button" id="briefCopy">${safe(text.copy)}</button><button class="ghost" type="button" id="briefDownload">${safe(text.download)}</button><button class="ghost" type="button" id="briefPrint">${safe(text.print)}</button><button class="secondary" type="button" id="briefRestart">${safe(text.startAgain)}</button>`;
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
    $('#briefRestart').onclick = () => { step = 0; Object.keys(values).forEach(key => delete values[key]); $('#briefActions').innerHTML = `<button class="ghost" type="button" id="briefBack">${safe(text.back)}</button><button class="secondary" type="button" id="briefNext">${safe(text.next)}</button>`; bindNavigation(); renderStep(); };
  }

  function bindNavigation() {
    $('#briefBack').onclick = () => { if (step) { values[copy().steps[step][0]] = $('#briefInput').value; step--; renderStep(); } };
    $('#briefNext').onclick = () => {
      const current = copy().steps[step];
      values[current[0]] = $('#briefInput').value;
      if (current[0] === 'what' && !values.what.trim()) { alert(copy().required); return; }
      if (step < copy().steps.length - 1) { step++; renderStep(); } else { showResult(); }
    };
  }

  $('#openBrief').onclick = () => {
    step = 0;
    Object.keys(values).forEach(key => delete values[key]);
    const text = copy();
    $('#briefActions').innerHTML = `<button class="ghost" type="button" id="briefBack">${safe(text.back)}</button><button class="secondary" type="button" id="briefNext">${safe(text.next)}</button>`;
    dialog.showModal();
    bindNavigation();
    renderStep();
  };
  new MutationObserver(renderLauncher).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  renderLauncher();
})();
