import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSocialDraft, createBufferDraft } from '../src/social.js';
import worker from '../src/index.js';
import { adminPage } from '../src/pages.js';

test('admin draft panel provides a separate single-bulletin reader link', () => {
  assert.match(adminPage,/text\('a','速報の詳細を見る'\)/);
  assert.match(adminPage,/reader.href='\/alerts\?id='/);
  assert.match(adminPage,/reader.rel='noopener noreferrer'/);
  assert.match(adminPage,/この速報一件だけを開きます/);
  const script=adminPage.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(()=>new Function(script));
});

const row = { id:'a'.repeat(64), status:'published', cve_id:'CVE-2026-12345', title:'【重要】Example Productの脆弱性（CVE-2026-12345）', summary:'Official description.', recommended_action:'Apply vendor mitigations.' };

test('social previews require authentication and select only published records without writes', async () => {
  const url='https://alerts.example/admin/social-drafts?id='+row.id;
  assert.equal((await worker.fetch(new Request(url),{})).status,401);
  let reads=0;
  const DB={prepare(sql){assert.match(sql,/status = 'published'/);reads++;return {bind:()=>({first:async()=>row})}}};
  const response=await worker.fetch(new Request(url,{headers:{authorization:'Bearer test-only'}}),{DB,ADMIN_API_TOKEN:'test-only'});
  const result=await response.json();assert.equal(response.status,200);assert.equal(reads,1);assert.equal(result.sendingEnabled,false);assert.deepEqual(result.drafts.map(d=>d.platform),['x','threads']);
});

test('X and Threads preserve identity, CVE, and Cyber Care in both languages', () => {
  for (const platform of ['x','threads']) for (const language of ['ja','en']) {
    const draft = buildSocialDraft(row, platform, language);
    assert.match(draft.text, /CVE-2026-12345/);
    assert.match(draft.text, /Cyber Care/);
    assert.ok(draft.text.endsWith(draft.link));
    assert.doesNotMatch(draft.text,/日本語 \/ English/);
    assert.match(draft.text,language==='ja'?/速報の詳細はこちら ↓\nhttps:/ : /Alert details below ↓\nhttps:/);
    if (platform === 'x') assert.ok(draft.weightedLength <= 280);
    else assert.ok(Array.from(draft.text).length <= 450);
  }
});

test('unpublished alerts and unsupported TikTok text drafts are blocked', () => {
  assert.throws(() => buildSocialDraft({...row,status:'pending'}, 'x'), /alert_not_published/);
  assert.throws(() => buildSocialDraft(row,'tiktok'), /unsupported_channel/);
});

test('long titles are shortened without removing the CVE or link', () => {
  for (const platform of ['x','threads']) {
    const draft = buildSocialDraft({...row,title:'【重要】'+'製品'.repeat(1000)+'の脆弱性（CVE-2026-12345）'}, platform);
    assert.match(draft.text,/CVE-2026-12345/);
    assert.ok(draft.text.endsWith(draft.link));
  }
});

test('Buffer adapter creates only a draft, using a server-side token', async () => {
  const id = await createBufferDraft('Test bulletin','channel','test-token', async (url,options) => {
    assert.equal(url,'https://api.buffer.com');
    assert.equal(options.headers.authorization,'Bearer test-token');
    assert.match(JSON.parse(options.body).query,/saveToDraft: true/);
    return Response.json({data:{createPost:{post:{id:'draft'}}}});
  });
  assert.equal(id,'draft');
});

test('ambiguous Buffer responses and rate limits fail closed', async () => {
  await assert.rejects(createBufferDraft('text','channel','token',async()=>Response.json({errors:[{}]})), /buffer_outcome_unconfirmed/);
  await assert.rejects(createBufferDraft('text','channel','token',async()=>new Response('',{status:429})), /buffer_rate_limited/);
});
