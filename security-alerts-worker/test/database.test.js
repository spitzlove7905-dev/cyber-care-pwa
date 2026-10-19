import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {database} from './db-helper.js';
import {collectionStatus,databaseRecords,parseAdvisories,date} from '../src/database.js';
import {saveReviewedIncident,validateIncident} from '../src/database-admin.js';
import {runMonitor} from '../src/index.js';
import {collectionMessage,selectIncidents} from '../../security-data.js';
import {runSocialSchedule} from '../src/scheduler.js';
import {storeCandidates} from '../src/database-store.js';
import {onRequestGet} from '../../functions/api/security/[[path]].js';

const incident={eventKey:'incident:test-company-2026',title:'テスト用の事件',organization:'株式会社テスト',organizationReading:'テスト',summary:'検証専用',action:'公式案内の確認',severityReason:'公式発表の被害規模',urgencyReason:'対策が必要',damage:'不明',responseStatus:'対応中',sourceName:'当事者の公式発表',sourceUrl:'https://example.org/notice',publishedAt:'2026-10-01T09:00:00+09:00',occurredAt:null,sourceUpdatedAt:null,cvss:null,urgency:2,severity:'高',state:'注意',attackType:'個人情報漏えい',confirmation:'確定情報（情報源で確認）',status:'published'};
test('initial status is unconfirmed and JST comes only from stored collection results',async()=>{
 const {DB}=database();assert.equal((await collectionStatus({DB})).lastSuccessAt,null);
 assert.equal(collectionMessage(await collectionStatus({DB})),'最終確認日時：未確認');
 const message=collectionMessage({status:'success',lastSuccessAt:'2026-10-19T09:00:00.000Z'});
 assert.match(message,/2026年10月19日 18:00/);assert.match(message,/日本時間/);
 assert.doesNotMatch(collectionMessage({status:'success'}),/2026年/);
});
test('failed and partial runs preserve the previous full success timestamp',async()=>{
 const {DB,sql}=database();const insert=sql.prepare('INSERT INTO collection_runs(id,started_at,completed_at,status) VALUES(?,?,?,?)');
 insert.run('1','2026-10-18T00:00:00Z','2026-10-18T00:01:00Z','success');insert.run('2','2026-10-19T00:00:00Z','2026-10-19T00:01:00Z','partial');
 let status=await collectionStatus({DB});assert.equal(status.lastSuccessAt,'2026-10-18T00:01:00Z');assert.match(collectionMessage(status),/一部/);assert.match(collectionMessage(status),/最新情報を確認できていません/);
 insert.run('3','2026-10-19T02:00:00Z','2026-10-19T02:01:00Z','failed');status=await collectionStatus({DB});assert.equal(status.lastSuccessAt,'2026-10-18T00:01:00Z');assert.match(collectionMessage(status),/最新情報を確認できていません/);
});
test('record updates retain identity, sources, unknown dates and null CVSS across reloads',async()=>{
 const {DB,sql}=database();const first=await saveReviewedIncident({DB},incident,'admin');
 await saveReviewedIncident({DB},{...incident,title:'更新後',sourceUrl:'https://example.org/update'},'admin');
 const rows=await databaseRecords({DB});assert.equal(rows.length,1);assert.equal(rows[0].id,first.id);assert.equal(rows[0].title,'更新後');assert.equal(rows[0].occurredAt,null);assert.equal(rows[0].cvss,null);assert.equal(rows[0].sources.length,2);assert.equal(sql.prepare('SELECT COUNT(*) n FROM audit_events').get().n,2);
});
test('unsafe links, invalid classifications and invented invalid CVSS values are rejected',()=>{
 for(const patch of [{sourceUrl:'javascript:alert(1)'},{sourceUrl:'https://user:pass@example.org/'},{cvss:20},{cvss:'9.8'},{urgency:4},{occurredAt:'unknown'},{confirmation:'confirmed?'},{eventKey:'bad key'}])assert.throws(()=>validateIncident({...incident,...patch}));
 assert.equal(validateIncident(incident).cvss,null);
});
test('XML accepts only official alert URLs and rejects DTD/entity input',()=>{
 const xml='<rdf:RDF xmlns:rdf="test" xmlns:dc="test"><item><title>重大な注意喚起</title><link>https://www.jpcert.or.jp/at/2026/at260001.html</link><dc:date>2026-10-19T10:00:00+09:00</dc:date><description>&lt;script&gt;alert(1)&lt;/script&gt;</description></item></rdf:RDF>';
 assert.equal(parseAdvisories(xml).length,1);assert.equal(parseAdvisories(xml.replace('www.jpcert.or.jp','attacker.example')).length,0);
 assert.throws(()=>parseAdvisories('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+xml));assert.throws(()=>parseAdvisories('<invalid'));
});
test('search, filters and seven sort modes compose; unknown occurrence dates stay last',()=>{
 const rows=[{id:'a',title:'漏えい',organization:'イ社',organizationReading:'イ',cve:null,attackType:'個人情報漏えい',severity:'高',urgency:2,state:'注意',publishedAt:'2026-10-18',updatedAt:'2026-10-18',occurredAt:null},{id:'b',title:'脆弱性 CVE-2026-12345',organization:'ア社',organizationReading:'ア',attackType:'脆弱性',severity:'重大',urgency:3,state:'解決',publishedAt:'2026-09-01',updatedAt:'2026-10-19',occurredAt:'2026-08-30'},{id:'c',title:'ランサムウェア',organization:'C社',attackType:'ランサムウェア',severity:'中',urgency:1,state:'注意',publishedAt:'2026-10-16',updatedAt:'2026-10-17',occurredAt:'2026-10-15'}];
 const now=Date.parse('2026-10-19');const first={urgency:'b',severity:'b',latest:'a','occurred-desc':'c','occurred-asc':'b',name:'c',updated:'b'};
 for(const [sort,id] of Object.entries(first))assert.equal(selectIncidents(rows,{sort},now)[0].id,id,sort);
 for(const sort of ['occurred-desc','occurred-asc'])assert.equal(selectIncidents(rows,{sort},now).at(-1).id,'a');
 assert.equal(selectIncidents(rows,{query:'ｃｖｅ－２０２６－１２３４５'},now)[0].id,'b');
 assert.deepEqual(selectIncidents(rows,{query:'漏えい',period:'7',category:'ongoing',severity:'高',attack:'個人情報漏えい',sort:'latest'},now).map(r=>r.id),['a']);
 assert.equal(selectIncidents(rows,{category:'past'},now).length,1);assert.equal(selectIncidents(rows,{period:'30'},now).length,2);
});
test('actual monitor persistence succeeds, partial fails safely, and never posts when collection fails',async()=>{
 const {DB,sql}=database();const previous=globalThis.fetch;let mode='success';let calls=0;
 const kev={vulnerabilities:[{cveID:'CVE-2026-12345',vendorProject:'Vendor',product:'Product',requiredAction:'Update',shortDescription:'Known exploited flaw',dateAdded:new Date().toISOString().slice(0,10),dueDate:'2026-11-01'}]};
 globalThis.fetch=async url=>{calls++;if(mode==='failed')throw Error('network');if(String(url).includes('cisa.gov'))return Response.json(kev);if(mode==='partial')throw Error('network');return new Response('<rdf:RDF xmlns:rdf="x" xmlns:dc="x"><item><title>注意喚起</title><link>https://www.jpcert.or.jp/at/2026/test.html</link><dc:date>2026-10-19</dc:date></item></rdf:RDF>');};
 try{
  await runMonitor({DB,AUTO_PUBLISH_ENABLED:'true'});let status=await collectionStatus({DB});assert.equal(status.status,'success');const success=status.lastSuccessAt;assert.ok(success);
  const rows=await databaseRecords({DB});assert.equal(rows.length,2);assert.equal(rows.find(r=>r.cve).sourceUpdatedAt,null);assert.equal(rows.find(r=>r.cve).cvss,null);
  mode='partial';await runMonitor({DB,AUTO_PUBLISH_ENABLED:'true'});status=await collectionStatus({DB});assert.equal(status.status,'partial');assert.equal(status.lastSuccessAt,success);
  mode='failed';await runMonitor({DB});status=await collectionStatus({DB});assert.equal(status.status,'failed');assert.equal(status.lastSuccessAt,success);
  const before=calls;const result=await runSocialSchedule({DB,SOCIAL_AUTO_ENABLED:'true',BUFFER_API_TOKEN:'test',SOCIAL_START_AT:'2026-01-01'},Date.parse('2026-10-19T09:00:00Z'),Date.parse('2026-10-19T09:00:00Z'));assert.equal(result.status,'collection_unavailable');assert.equal(calls,before);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM alerts').get().n,2);
 }finally{globalThis.fetch=previous;}
});
test('consultation entry points and the question button are preserved',()=>{
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');assert.match(html,/id="startGuide"/);assert.match(html,/質問から始める/);assert.match(html,/id="openLog"/);assert.match(html,/id="openStatement"/);assert.match(html,/重大セキュリティ情報データベース/);
 const sw=readFileSync(new URL('../../sw.js',import.meta.url),'utf8');assert.match(sw,/pathname.startsWith\('\/api\/'\)/);
});
test('unknown dates stay unknown; date-only publications never gain an invented clock time',()=>{
 assert.equal(date('2026-10-19'),'2026-10-19');assert.equal(date('2026-10-19T18:00:00+09:00'),'2026-10-19T09:00:00.000Z');
 for(const invalid of ['2026-02-30','2026-10-19T18:00','2026-10-19T25:00:00Z','3'])assert.equal(date(invalid),null);
});
test('database records and collection completion survive closing and reopening SQLite storage',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'cyber-care-db-test-'));const file=join(dir,'database.sqlite');let sql;
 try{const db=database(file);sql=db.sql;await saveReviewedIncident({DB:db.DB},incident,'test');sql.prepare("INSERT INTO collection_runs(id,started_at,completed_at,status) VALUES('persist','2026-10-19T09:00:00Z','2026-10-19T09:01:00Z','success')").run();sql.close();sql=new DatabaseSync(file);assert.equal(sql.prepare('SELECT title FROM alerts').get().title,incident.title);assert.equal(sql.prepare('SELECT completed_at FROM collection_runs').get().completed_at,'2026-10-19T09:01:00Z');}finally{sql?.close();unlinkSync(file);rmdirSync(dir);}
});
test('legacy ETag does not prevent the initial 90-day backfill on HTTP 304',async()=>{
 const {DB,sql}=database();sql.prepare("INSERT INTO source_state(source_key,etag,last_fetched_at,last_success_at) VALUES('cisa-kev','old-etag','2026-10-18','2026-10-18')").run();
 const previous=globalThis.fetch;let cisaCalls=0;
 globalThis.fetch=async url=>{if(String(url).includes('cisa.gov')){cisaCalls++;if(cisaCalls===1)return new Response(null,{status:304});return Response.json({vulnerabilities:[{cveID:'CVE-2026-12345',vendorProject:'Vendor',product:'Product',requiredAction:'Update',shortDescription:'Known flaw',dateAdded:new Date(Date.now()-60*86400000).toISOString().slice(0,10)}]});}return new Response('<rdf:RDF xmlns:rdf="x" xmlns:dc="x"><item><title>注意喚起</title><link>https://www.jpcert.or.jp/at/2026/test.html</link><dc:date>2026-10-19</dc:date></item></rdf:RDF>');};
 try{await runMonitor({DB,AUTO_PUBLISH_ENABLED:'true'});assert.equal((await collectionStatus({DB})).status,'success');assert.equal(cisaCalls,2);assert.equal(sql.prepare("SELECT COUNT(*) n FROM alerts WHERE cve_id='CVE-2026-12345'").get().n,1);}finally{globalThis.fetch=previous;}
});
test('600-record historical imports use 12 SQL statements and do not duplicate or revive rejected incidents',async()=>{
 const {DB,sql}=database();let queries=0;
 const countingDB={prepare:DB.prepare,batch:async statements=>{queries+=statements.length;return DB.batch(statements);}};
 const stamp='2026-10-19T09:00:00Z';const records=Array.from({length:600},(_,i)=>({id:String(i).padStart(64,'0'),eventKey:'bulk:'+i,sourceKey:'cisa-kev',sourceUrl:'https://www.cisa.gov/feed',sourceName:'CISA',cve:null,title:'Verified vulnerability '+i,summary:'Official source summary',action:'Update',evidence:'[]',score:100,status:'published',publishedAt:'2026-10-01',sourceUpdatedAt:null,stamp,hash:'revision-1',organization:'Vendor',attackType:'脆弱性',severity:'高',severityReason:'実悪用確認',urgency:3,urgencyReason:'対策が必要',state:'注意',damage:'不明',responseStatus:'不明',confirmation:'公式確認済み'}));
 await storeCandidates({DB:countingDB},records,stamp);assert.equal(queries,12);assert.equal(sql.prepare('SELECT COUNT(*) n FROM alerts').get().n,600);
 sql.prepare("UPDATE alerts SET status='rejected' WHERE event_key='bulk:0'").run();records[0].hash='revision-2';records[1].hash='revision-2';records[1].title='Updated official content';
 await storeCandidates({DB},records,stamp);assert.equal(sql.prepare("SELECT status FROM alerts WHERE event_key='bulk:0'").get().status,'rejected');assert.equal(sql.prepare("SELECT title FROM alerts WHERE event_key='bulk:1'").get().title,'Updated official content');assert.equal(sql.prepare('SELECT COUNT(*) n FROM alerts').get().n,600);
});
test('Pages API uses only the bound Worker and fails closed without a binding',async()=>{
 const paths=[];const env={SECURITY_ALERTS:{fetch:async request=>{paths.push(new URL(request.url).pathname);return Response.json({status:'unconfirmed'});}}};
 const response=await onRequestGet({params:{path:['status']},env});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(paths,['/v1/database/status']);
 assert.equal((await onRequestGet({params:{path:['admin','database']},env})).status,404);assert.equal(paths.length,1);
 assert.equal((await onRequestGet({params:{path:['database']},env:{}})).status,503);
});
