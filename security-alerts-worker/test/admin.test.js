import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const endpoint = 'https://alerts.example/admin/review';
const body = { id: 'a'.repeat(64), contentHash: 'b'.repeat(64), status: 'published' };
const request = (origin = 'https://alerts.example') => new Request(endpoint, { method: 'POST', headers: { authorization: 'Bearer test-only', origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('admin endpoints fail closed without credentials', async () => {
  assert.equal((await worker.fetch(request(), {})).status, 401);
});
test('publication remains disabled until explicitly configured', async () => {
  assert.equal((await worker.fetch(request(), { ADMIN_API_TOKEN: 'test-only' })).status, 403);
});
test('cross-origin publication is blocked even with credentials', async () => {
  assert.equal((await worker.fetch(request('https://evil.example'), { ADMIN_API_TOKEN: 'test-only', REVIEW_ACTIONS_ENABLED: 'true' })).status, 403);
});
test('stale content cannot be approved', async () => {
  const DB = { prepare: () => ({ bind: () => ({}) }), batch: async () => [{ meta: { changes: 0 } }] };
  assert.equal((await worker.fetch(request(), { DB, ADMIN_API_TOKEN: 'test-only', REVIEW_ACTIONS_ENABLED: 'true' })).status, 409);
});
test('public list excludes pending records in its database query', async () => {
  const DB = { prepare(sql) { assert.match(sql, /WHERE status = 'published'/); return { all: async () => ({ results: [] }) }; } };
  const response = await worker.fetch(new Request('https://alerts.example/v1/alerts'), { DB });
  assert.deepEqual(await response.json(), { alerts: [] });
});
