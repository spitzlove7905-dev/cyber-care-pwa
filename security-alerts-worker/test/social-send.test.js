import test from 'node:test';
import assert from 'node:assert/strict';
import { sendSocialDraft, ensureSocialStorage } from '../src/social.js';
import worker from '../src/index.js';

const row={id:'a'.repeat(64),status:'published',content_hash:'b'.repeat(64),cve_id:'CVE-2026-12345',title:'【重要】Exampleの脆弱性（CVE-2026-12345）',summary:'Original',recommended_action:'Apply mitigations'};
function database() {
  let claimed=false;const statements=[];
  return {
    statements,
    prepare(sql) {
      return {
        sql,
        bind(...args) {
          return {sql,args,run:async()=>{
            statements.push({sql,args});
            if(sql.startsWith('INSERT OR IGNORE')){
              if(claimed)return {meta:{changes:0}};
              claimed=true;
            }
            return {meta:{changes:1}};
          }};
        }
      };
    },
    async batch(items) { statements.push(...items);return items.map(()=>({meta:{changes:1}})); }
  };
}
const environment=DB=>({DB,BUFFER_SEND_ENABLED:'true',BUFFER_API_TOKEN:'test-key',BUFFER_CHANNELS_JSON:'{"x":"channel","threads":"channel"}'});

test('one receipt blocks duplicate sends including another language',async()=>{
  const DB=database();let calls=0;
  const fetcher=async()=>{calls++;return Response.json({data:{createPost:{post:{id:'draft'}}}})};
  const result=await sendSocialDraft(environment(DB),row,'x','ja','admin',fetcher);
  assert.equal(result.status,'draft_created');
  await assert.rejects(sendSocialDraft(environment(DB),row,'x','en','admin',fetcher),/already_submitted_or_daily_limit/);
  assert.equal(calls,1);
  assert.ok(DB.statements.some(s=>s.sql.includes('buffer_draft_created')));
  assert.ok(DB.statements.some(s=>s.sql.includes('COUNT(*)')&&s.sql.includes('< 5')));
});

test('ambiguous external failure marks needs_check and does not retry',async()=>{
  const DB=database();let calls=0;
  const fetcher=async()=>{calls++;throw Error('timeout with private information')};
  await assert.rejects(sendSocialDraft(environment(DB),row,'x','ja','admin',fetcher),/^Error: buffer_needs_manual_check$/);
  await assert.rejects(sendSocialDraft(environment(DB),row,'x','ja','admin',fetcher),/already_submitted_or_daily_limit/);
  assert.equal(calls,1);assert.ok(DB.statements.some(s=>s.sql.includes("status = 'needs_check'")));
});

test('disabled sending and unpublished content never contact Buffer',async()=>{
  const DB=database();const fetcher=()=>{throw Error('unexpected external call')};
  await assert.rejects(sendSocialDraft({...environment(DB),BUFFER_SEND_ENABLED:'false'},row,'x','ja','admin',fetcher),/buffer_not_configured/);
  await assert.rejects(sendSocialDraft(environment(DB),{...row,status:'withdrawn'},'x','ja','admin',fetcher),/alert_not_published/);
  assert.equal(DB.statements.length,0);
});

test('storage setup is additive and idempotent',async()=>{
  const DB=database();await ensureSocialStorage(DB);
  assert.equal(DB.statements.length,2);for(const statement of DB.statements){assert.match(statement.sql,/^CREATE (TABLE|INDEX) IF NOT EXISTS/);assert.doesNotMatch(statement.sql,/DROP|DELETE|ALTER/)}
});

test('draft route rejects untrusted origins, disabled mode and invalid bodies',async()=>{
  const url='https://alerts.example/admin/social-draft';
  const env={ADMIN_API_TOKEN:'test-only',BUFFER_API_TOKEN:'key',BUFFER_DRAFTS_ENABLED:'true'};
  const request=(body,origin='https://alerts.example')=>new Request(url,{method:'POST',headers:{authorization:'Bearer test-only',origin,'content-type':'application/json'},body});
  assert.equal((await worker.fetch(request('{}','https://evil.example'),env)).status,403);
  assert.equal((await worker.fetch(request('{}'),{...env,BUFFER_DRAFTS_ENABLED:'false'})).status,403);
  assert.equal((await worker.fetch(request('null'),env)).status,400);
  assert.equal((await worker.fetch(request('{}'),env)).status,400);
});
