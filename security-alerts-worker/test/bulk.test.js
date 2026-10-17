import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { adminPage } from '../src/pages.js';

const snapshot = '2026-10-17T12:00:00.000Z';
test('bulk queue is paginated beyond the first 100 and bound to its start time', async () => {
  const rows = Array.from({length:101}, (_, i) => ({id:i.toString(16).padStart(64,'0'), title:'Example advisory', evidence_json:'[]',content_hash:'b'.repeat(64)}));
  const DB = { prepare(sql) {
    assert.match(sql, /status = 'pending_review' AND created_at <= \? AND id > \?/);
    return {bind(time, cursor) {assert.equal(time,snapshot);return {all:async()=>({results: rows.filter(row=>row.id>cursor).slice(0,100)})};}};
  }};
  const env = {DB,ADMIN_API_TOKEN:'test-only'};
  const get = cursor => worker.fetch(new Request('https://alerts.example/admin/pending?snapshot='+snapshot+'&cursor='+cursor, {headers:{authorization:'Bearer test-only'}}), env);
  const first = await (await get('')).json();
  assert.equal(first.alerts.length,100);
  assert.equal(first.nextCursor,rows[99].id);
  const second = await (await get(first.nextCursor)).json();
  assert.equal(second.alerts.length,1);
  assert.equal(second.nextCursor,null);
});
test('bulk pagination rejects invalid cursor and timestamp before database access', async () => {
  for(const query of ['snapshot=invalid','snapshot='+snapshot+'&cursor=invalid']) {
    const response=await worker.fetch(new Request('https://alerts.example/admin/pending?'+query,{headers:{authorization:'Bearer test-only'}}),{ADMIN_API_TOKEN:'test-only'});
    assert.equal(response.status,400);
  }
});
test('admin browser script parses with the one-tap bulk control', () => {
  const script=adminPage.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(()=>new Function(script));
  const bulkHandler=script.slice(script.indexOf('bulkButton.onclick='),script.indexOf("document.getElementById('load').onclick="));
  assert.doesNotMatch(bulkHandler,/confirm\(/);
  assert.match(bulkHandler,/contentHash:a.contentHash/);
});
