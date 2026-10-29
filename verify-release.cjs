/* Read-only local release validation. Never contacts GitHub or Cloudflare. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname,fail=message=>{throw Error(message)},hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const list=(base,sub='')=>fs.readdirSync(path.join(base,sub),{withFileTypes:true}).flatMap(e=>e.isDirectory()?list(base,path.join(sub,e.name)):[path.join(sub,e.name).replaceAll('\\','/')]);
try{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'release-manifest.json'),'utf8'));
 for(const file of manifest.files){const p=path.resolve(root,file.path);if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||hash(p)!==file.sha256)fail('Asset missing or changed: '+file.path)}
 const actual=['dist','functions'].flatMap(dir=>list(path.join(root,dir)).map(p=>dir+'/'+p)).sort(),expected=manifest.files.map(f=>f.path).filter(p=>p.startsWith('dist/')||p.startsWith('functions/')).sort();
 if(JSON.stringify(actual)!==JSON.stringify(expected))fail('Published file set differs');
 for(const name of ['index.html','sw.js','enhancements.js','briefing.js','manifest.webmanifest','favicon.svg','privacy.html','operator.html'])if(fs.existsSync(path.join(root,name)))fail('Legacy root asset must be moved to dist: '+name);
 if(fs.readFileSync(path.join(root,'.gitattributes'),'utf8').trim()!=='* -text')fail('Byte-preserving Git attributes differ');
 const config=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8').replace(/^\uFEFF/,''));
 if(config.name!=='cyber-care-pwa'||config.pages_build_output_dir!=='dist'||config.compatibility_date!=='2026-10-09')fail('Pages configuration differs');
 if(JSON.stringify(config.services)!==JSON.stringify([{binding:'SECURITY_ALERTS',service:'cyber-care-security-alerts',environment:'production'}]))fail('Service binding differs');
 const runtime=fs.readFileSync(path.join(root,'dist/runtime-config.js'),'utf8'),cfg=JSON.parse(runtime.match(/Object\.freeze\((\{.*\})\)/s)[1]);
 if(cfg.release!==manifest.release||cfg.mode!=='production'||cfg.databaseName!=='cyber-care-safe-v1'||cfg.draftKey!=='cc-consultation-safe-v1'||JSON.stringify(cfg.allowedOrigins)!==JSON.stringify(['https://cyber-care-pwa.pages.dev']))fail('Runtime/storage identity differs');
 const sw=fs.readFileSync(path.join(root,'dist/sw.js'),'utf8'),hashes=JSON.parse(sw.match(/const HASHES=(\{[^;]+\});/)[1]);
 for(const [url,digest]of Object.entries(hashes)){if(!/^\/[\w./-]+$/.test(url)||url.includes('..')||hash(path.join(root,'dist',url.slice(1)))!==digest)fail('SW asset mismatch: '+url)}
 if(/skipWaiting\s*\(|clients\.claim\s*\(|caches\.keys\s*\(/.test(sw))fail('Unsafe activation/cache cleanup');
 if(!fs.readFileSync(path.join(root,'dist/device-session.js'),'utf8').includes('ttl=15*60*1000,warn=13*60*1000'))fail('Timeout policy differs');
 if(JSON.parse(fs.readFileSync(path.join(root,'dist/_routes.json'),'utf8')).include.join(',')!=='/api/security/*')fail('API route differs');
 console.log(JSON.stringify({result:'PASS',release:manifest.release,kind:manifest.kind,files:manifest.files.length,networkRequests:0,writes:0}));
}catch(e){console.error('Release verification failed: '+e.message);process.exitCode=1}
