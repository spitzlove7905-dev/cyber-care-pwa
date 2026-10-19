import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { alertsPage } from '../src/pages.js';
import { localizedBulletin } from '../src/localization.js';
const row={id:'a'.repeat(64),cve_id:'CVE-2026-12345',title:'【重要】Example Productの脆弱性（CVE-2026-12345）',summary:'Official original description.',recommended_action:'Apply vendor mitigations.',source_url:'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',evidence_json:JSON.stringify(['CISA KEV掲載'])};
test('Japanese summary and original English keep the same CVE and claims',()=>{
 const result=localizedBulletin(row);assert.match(result.ja.summary,/CVE-2026-12345/);assert.match(result.ja.label,/全文翻訳ではありません/);assert.equal(result.en.summary,row.summary);assert.equal(result.en.recommendedAction,row.recommended_action);assert.doesNotMatch(result.en.title,/【重要】|の脆弱性/);
});
test('bilingual API keeps one bulletin identity rather than two publications',async()=>{
 const response=await worker.fetch(new Request('https://alerts.example/v1/alerts'),{DB:{prepare:()=>({all:async()=>({results:[row]})})}});
 const body=await response.json();assert.equal(body.alerts.length,1);assert.equal(body.alerts[0].id,row.id);assert.deepEqual(Object.keys(body.alerts[0].languages),['ja','en']);
});
test('public page embeds a valid script with both languages and Cyber Care introduction',()=>{
 const script=alertsPage.match(/<script>([\s\S]*)<\/script>/)[1];assert.doesNotThrow(()=>new Function(script));assert.match(alertsPage,/alert-language/);assert.match(script,/About Cyber Care/);assert.match(script,/Cyber Careについて/);assert.doesNotMatch(script,/document.createElement\('details'\)/);assert.doesNotMatch(script,/share.href=/);assert.match(script,/article.append\(about\(t\)\)/);
});
