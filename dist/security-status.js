import {collectionMessage} from './security-data.js';
const output=document.querySelector('#securityCheckedAt');
if(output)fetch('/api/security/status',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{output.textContent=collectionMessage(data);}).catch(()=>{output.textContent=collectionMessage({status:'unavailable'});});
