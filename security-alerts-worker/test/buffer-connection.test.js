import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBufferConnection } from '../src/buffer-connection.js';
import worker from '../src/index.js';

test('missing secret does not contact Buffer', async () => {
  const result = await checkBufferConnection({}, () => { throw Error('unexpected call'); });
  assert.equal(result.configured, false);
  assert.equal(result.sendingEnabled, false);
});

test('connection check uses queries only, filters channels and never returns the key', async () => {
  let calls = 0;
  const result = await checkBufferConnection({BUFFER_API_TOKEN:'private-test-key'}, async (url,options) => {
    assert.equal(url,'https://api.buffer.com');
    assert.equal(options.headers.authorization,'Bearer private-test-key');
    const query=JSON.parse(options.body).query; assert.match(query,/^query /); assert.doesNotMatch(query,/mutation/);
    calls++;
    return Response.json({data:calls===1?{account:{organizations:[{id:'org',name:'Test'}]}}:{channels:[{id:'x1',name:'account',service:'twitter',isQueuePaused:false},{id:'t1',name:'account',service:'threads',isQueuePaused:true},{id:'f1',name:'other',service:'facebook'}]}});
  });
  assert.equal(calls,2);assert.equal(result.channels.length,2);assert.equal(result.channels[0].platform,'x');
  assert.equal(result.sendingEnabled,false);assert.doesNotMatch(JSON.stringify(result),/private-test-key/);
});

test('Buffer errors do not disclose upstream content', async () => {
  await assert.rejects(checkBufferConnection({BUFFER_API_TOKEN:'key'},async()=>new Response('private upstream error',{status:401})),/^Error: buffer_auth_failed$/);
  await assert.rejects(checkBufferConnection({BUFFER_API_TOKEN:'key'},async()=>new Response('',{status:429})),/buffer_rate_limited/);
});

test('connection route requires authentication and same origin', async () => {
  const url='https://alerts.example/admin/social-connection';
  assert.equal((await worker.fetch(new Request(url,{method:'POST'}),{})).status,401);
  const response=await worker.fetch(new Request(url,{method:'POST',headers:{authorization:'Bearer test-only',origin:'https://evil.example','content-type':'application/json'},body:'{}'}),{ADMIN_API_TOKEN:'test-only'});
  assert.equal(response.status,403);
});
