import {mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);const out=new URL('dist/',root);
await mkdir(out,{recursive:true});
const files=['index.html','enhancements.js','briefing.js','favicon.svg','manifest.webmanifest','operator.html','privacy.html','sw.js','security-data.js','security-database.html','security-database.css','security-database.js','security-status.js','_routes.json','_headers'];
for(const file of files)await copyFile(new URL(file,root),new URL(file,out));
console.log('Pages assets: '+fileURLToPath(out)+' ('+files.length+' public files)');
