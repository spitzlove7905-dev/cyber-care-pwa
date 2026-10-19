import test from 'node:test';
import assert from 'node:assert/strict';
import { officialGuidance } from '../src/guidance.js';
import { alertsPage } from '../src/pages.js';
import worker from '../src/index.js';

test('reviewed guidance requires matching CVE and vendor',()=>{
 const known=officialGuidance({cve_id:'CVE-2026-21589',title:'Atlassian Multiple Products'});
 assert.equal(known.status,'verified');assert.equal(new URL(known.url).hostname,'confluence.atlassian.com');
 assert.equal(officialGuidance({cve_id:'CVE-2026-21589',title:'Other product'}).status,'not_verified');
 assert.equal(officialGuidance({cve_id:'CVE-2026-99999',title:'Atlassian'}).url,null);
});
test('unverified guidance does not prevent the original alert from appearing',async()=>{
 const row={id:'a'.repeat(64),cve_id:'CVE-2026-99999',title:'Example',summary:'Original',recommended_action:'Check vendor instructions',evidence_json:'[]'};
 const response=await worker.fetch(new Request('https://alerts.example/v1/alerts'),{DB:{prepare:()=>({all:async()=>({results:[row]})})}});
 const data=await response.json();assert.equal(data.alerts.length,1);assert.equal(data.alerts[0].officialGuidance.status,'not_verified');
});
test('public page distinguishes unverified from not announced in both languages',()=>{
 assert.match(alertsPage,/対策が未発表、または存在しないという意味ではありません/);
 assert.match(alertsPage,/does not mean that mitigation has not been announced/);
 assert.match(alertsPage,/メーカー公式の対策ページを開く/);
 assert.doesNotThrow(()=>new Function(alertsPage.match(/<script>([\s\S]*)<\/script>/)[1]));
});
