import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateFromKev, publicationDecision, scoreCandidate } from '../src/policy.js';

const KEV_ITEM = {
  cveID: 'CVE-2026-12345',
  vendorProject: 'Example Vendor',
  product: 'Example Product',
  vulnerabilityName: 'Example Vulnerability',
  dateAdded: '2026-10-17',
  shortDescription: 'An attacker could exploit this vulnerability remotely.',
  requiredAction: 'Apply the vendor update or discontinue use by the due date.',
  dueDate: '2026-10-24'
};

test('CISA KEV candidate has an explainable, publication-eligible score', () => {
  const candidate = candidateFromKev(KEV_ITEM);
  assert.equal(candidate.cveId, 'CVE-2026-12345');
  assert.equal(candidate.score, 100);
  assert.deepEqual(candidate.evidence, ['公式一次情報', '公的機関が実悪用を確認', 'CISA KEV掲載', '公式の対処案内あり']);
  assert.equal(publicationDecision(candidate, false).status, 'pending_review');
  assert.equal(publicationDecision(candidate, true).status, 'published');
});

test('insufficient evidence never becomes publication eligible', () => {
  const result = scoreCandidate({ official: true, knownExploited: false, inKevCatalog: false, recommendedAction: false });
  const decision = publicationDecision({ official: true, cveId: 'CVE-2026-12345', recommendedAction: '', sourceUrl: 'https://example.invalid', score: result.score }, true);
  assert.equal(result.score, 20);
  assert.equal(decision.eligible, false);
  assert.equal(decision.status, 'pending_review');
});

test('malformed or incomplete feed records are rejected before persistence', () => {
  assert.equal(candidateFromKev({ ...KEV_ITEM, cveID: 'not-a-cve' }), null);
  assert.equal(candidateFromKev({ ...KEV_ITEM, requiredAction: '' }), null);
});
