import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { authenticateAdmin } from '../src/auth.js';

const env = { ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com', ACCESS_AUD: 'expected-app', ADMIN_API_TOKEN: 'legacy-token' };
const keys = await generateKeyPair('RS256');
async function signed(overrides = {}, key = keys.privateKey) {
  return new SignJWT({ email: 'owner@example.test', ...overrides }).setProtectedHeader({ alg: 'RS256' }).setIssuer('https://test.cloudflareaccess.com').setAudience('expected-app').setSubject('user').setIssuedAt().setExpirationTime('5m').sign(key);
}
const request = token => new Request('https://alerts.example/admin/pending', { headers: { 'cf-access-jwt-assertion': token } });
test('valid Access assertion authenticates the audit actor', async () => {
  const identity = await authenticateAdmin(request(await signed()), env, keys.publicKey);
  assert.equal(identity.actor, 'owner@example.test');
});
test('Access configuration disables bearer bypass', async () => {
  const req = new Request('https://alerts.example/admin/pending', { headers: { authorization: 'Bearer legacy-token' } });
  assert.equal(await authenticateAdmin(req, env, keys.publicKey), null);
});
test('tampered, expired, wrong-audience and wrong-issuer assertions fail closed', async () => {
  const valid = await signed();
  const other = await generateKeyPair('RS256');
  const expired = await new SignJWT({ email: 'owner@example.test' }).setProtectedHeader({alg:'RS256'}).setIssuer('https://test.cloudflareaccess.com').setAudience('expected-app').setSubject('user').setIssuedAt(0).setExpirationTime(1).sign(keys.privateKey);
  assert.equal(await authenticateAdmin(request(valid), { ...env, ACCESS_AUD: 'other' }, keys.publicKey), null);
  assert.equal(await authenticateAdmin(request(valid), { ...env, ACCESS_TEAM_DOMAIN: 'other.cloudflareaccess.com' }, keys.publicKey), null);
  for (const token of [valid.slice(0, -8) + 'AAAAAAAA', expired, await signed({}, other.privateKey)]) assert.equal(await authenticateAdmin(request(token), env, keys.publicKey), null);
});
