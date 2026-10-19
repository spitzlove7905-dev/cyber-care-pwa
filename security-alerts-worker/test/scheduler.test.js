import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { scheduledSlot,eligibleForSocial,digestText,runSocialSchedule } from '../src/scheduler.js';
import twitterText from 'twitter-text';
import {database as fullDatabase} from './db-helper.js';

const time=Date.parse('2026-10-19T09:00:00.000Z');
const sample={id:'a'.repeat(64),status:'published',source_url:'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',severity_score:100,evidence_json:'["CISA KEV掲載","公的機関が実悪用を確認"]',recommended_action:'Follow vendor instructions',cve_id:'CVE-2026-21589'};
function database(){
 const {sql}=fullDatabase();
 sql.prepare("INSERT INTO collection_runs(id,started_at,completed_at,status) VALUES('test',?,?,'success')").run(new Date(time).toISOString(),new Date(time).toISOString());
 function prepare(text,args=[]){
  return {text,args,bind(...values){return prepare(text,values)},async first(){return sql.prepare(text).get(...args)||null},async all(){return {results:sql.prepare(text).all(...args)}},async run(){return {meta:{changes:Number(sql.prepare(text).run(...args).changes)}}}};
 }
 const DB={prepare,async batch(statements){sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result}catch(error){sql.exec('ROLLBACK');throw error}}};
 function add(row=sample){sql.prepare('INSERT INTO alerts(id,status,source_url,severity_score,evidence_json,recommended_action,cve_id,published_at,source_published_at,event_key,source_key,title,summary,content_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.status,row.source_url,row.severity_score,row.evidence_json,row.recommended_action,row.cve_id,'2026-10-19T04:00:00.000Z','2026-10-19T04:00:00.000Z',row.id,'cisa-kev','Test title','Test summary',row.id,'2026-10-19T04:00:00.000Z','2026-10-19T04:00:00.000Z');sql.prepare("INSERT INTO incident_details(alert_id,severity,urgency,incident_state) VALUES(?,'高',3,'注意')").run(row.id);}
 return {DB,sql,add};
}
const env=DB=>({DB,SOCIAL_AUTO_ENABLED:'true',BUFFER_API_TOKEN:'test-secret',BUFFER_ALLOWED_ACCOUNT:'spitz7905',SOCIAL_START_AT:'2026-10-19T02:10:00.000Z'});
function fakeBuffer(fail=false){
 const calls=[];
 const fetcher=async(url,options)=>{
  const query=JSON.parse(options.body).query;calls.push(query);
  assert.equal(options.headers.authorization,'Bearer test-secret');
  if(query.includes('account {'))return Response.json({data:{account:{organizations:[{id:'org',name:'Workspace'}]}}});
  if(query.startsWith('query'))return Response.json({data:{channels:[{id:'x-channel',name:'spitz7905',service:'twitter'},{id:'t-channel',name:'spitz7905',service:'threads'}]}});
  assert.match(query,/mode: shareNow/);assert.doesNotMatch(query,/saveToDraft/);
  if(fail)throw Error('timeout');
  return Response.json({data:{createPost:{post:{id:'post-'+calls.length}}}});
 };return {calls,fetcher};
}
test('only exact 08:00 and 18:00 Japan time are normal slots',()=>{
 assert.deepEqual(scheduledSlot(Date.parse('2026-10-18T23:00:00Z')),{day:'2026-10-19',slot:'morning'});
 assert.deepEqual(scheduledSlot(time),{day:'2026-10-19',slot:'evening'});
 assert.equal(scheduledSlot(time+15*60000),null);assert.equal(scheduledSlot(time+3600000),null);
});
test('pending, withdrawn, weak or nonofficial information cannot be auto-posted',()=>{
 assert.equal(eligibleForSocial(sample),true);
 for(const patch of [{status:'pending_review'},{status:'withdrawn'},{severity_score:20},{source_url:'https://example.com'},{evidence_json:'[]'}])assert.equal(eligibleForSocial({...sample,...patch}),false);
});
test('digest fits X and Threads with an actual snapshot link',()=>{
 const text=digestText(Array.from({length:10},()=>sample),'a'.repeat(64));
 assert.ok(twitterText.parseTweet(text).valid);assert.ok(Array.from(text).length<=450);
 assert.match(text,/速報の詳細はこちら ↓\nhttps:/);assert.doesNotMatch(text,/日本語 \/ English/);
});
test('empty slots, outside hours and disabled mode never call Buffer',async()=>{
 const {DB}=database();const {calls,fetcher}=fakeBuffer();
 assert.equal((await runSocialSchedule(env(DB),time,time,fetcher)).status,'no_new_alerts');
 assert.equal((await runSocialSchedule(env(DB),time+900000,time+900000,fetcher)).status,'outside_schedule');
 assert.equal((await runSocialSchedule({...env(DB),SOCIAL_AUTO_ENABLED:'false'},time,time,fetcher)).status,'disabled');
 assert.equal(calls.length,0);
});
test('each channel receives one digest and repeated cron delivery cannot duplicate it',async()=>{
 const {DB,sql,add}=database();add();add({...sample,id:'b'.repeat(64),cve_id:'CVE-2026-12345'});
 const {calls,fetcher}=fakeBuffer();
 const result=await runSocialSchedule(env(DB),time,time,fetcher);assert.equal(result.results.length,2);
 assert.ok(result.results.every(r=>r.status==='submitted'));
 assert.equal(sql.prepare('SELECT COUNT(*) AS total FROM social_run_items').get().total,4);
 assert.equal(sql.prepare('SELECT COUNT(*) AS total FROM audit_events').get().total,2);
 const before=calls.length;assert.equal((await runSocialSchedule(env(DB),time,time,fetcher)).status,'no_new_alerts');assert.equal(calls.length,before);
 // Neither the next normal slot nor an old cron replay repeats an existing bulletin.
 const morning=Date.parse('2026-10-19T23:00:00Z');
 sql.prepare('UPDATE collection_runs SET completed_at=?').run(new Date(morning).toISOString());
 assert.equal((await runSocialSchedule(env(DB),morning,morning,fetcher)).status,'no_new_alerts');
 assert.equal((await runSocialSchedule(env(DB),time,time+3600000,fetcher)).status,'outside_schedule');
});
test('unknown external outcomes stay reserved and are never retried automatically',async()=>{
 const {DB,sql,add}=database();add();const {calls,fetcher}=fakeBuffer(true);
 await runSocialSchedule(env(DB),time,time,fetcher);
 assert.equal(sql.prepare("SELECT COUNT(*) AS total FROM social_runs WHERE status='needs_check'").get().total,2);
 const count=calls.length;await runSocialSchedule(env(DB),time,time,fetcher);assert.equal(calls.length,count);
});
 test('historical publications are explicitly labelled rather than presented as new',async()=>{
 const {DB,sql,add}=database();add();sql.prepare('UPDATE alerts SET published_at = ?').run('2026-10-17T00:00:00Z');
 const {calls,fetcher}=fakeBuffer();assert.equal((await runSocialSchedule(env(DB),time,time,fetcher)).status,'processed');assert.ok(calls.some(q=>q.includes('過去の重大事件・注意喚起')));
});
test('emergency capacity requires explicit invocation and is limited to one extra slot',async()=>{
 const {DB,sql,add}=database();add();const {calls,fetcher}=fakeBuffer();
 const offHours=Date.parse('2026-10-19T05:00:00Z');
 sql.prepare('UPDATE collection_runs SET completed_at=?').run(new Date(offHours).toISOString());
 assert.equal((await runSocialSchedule(env(DB),offHours,offHours,fetcher)).status,'outside_schedule');assert.equal(calls.length,0);
 const result=await runSocialSchedule(env(DB),offHours,offHours,fetcher,{day:'2026-10-19',slot:'emergency'});
 assert.ok(result.results.every(r=>r.status==='submitted'));
 const count=calls.length;
 await runSocialSchedule(env(DB),offHours,offHours,fetcher,{day:'2026-10-19',slot:'emergency'});
 assert.equal(calls.length,count);
});
test('material updates keep incident identity and receive an update label only once per revision',async()=>{
 const {DB,sql,add}=database();add();const {calls,fetcher}=fakeBuffer();await runSocialSchedule(env(DB),time,time,fetcher);
 const morning=Date.parse('2026-10-19T23:00:00Z');sql.prepare('UPDATE collection_runs SET completed_at=?').run(new Date(morning).toISOString());sql.prepare("UPDATE alerts SET content_hash='new-revision',updated_at=?").run(new Date(morning).toISOString());
 await runSocialSchedule(env(DB),morning,morning,fetcher);assert.ok(calls.some(q=>q.includes('重大セキュリティ情報の更新')));assert.equal(sql.prepare('SELECT COUNT(*) n FROM database_deliveries').get().n,4);
 const count=calls.length;await runSocialSchedule(env(DB),morning,morning,fetcher);assert.equal(calls.length,count);
});
