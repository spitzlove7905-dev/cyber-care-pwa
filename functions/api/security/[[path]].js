// Fixed upstream: visitors cannot select a URL or access administrative routes.
export async function onRequestGet({params}) {
 const path=Array.isArray(params.path)?params.path.join('/'):params.path||'';
 if(!['database','status'].includes(path))return new Response('Not found',{status:404});
 try{
  const response=await fetch('https://cyber-care-security-alerts.spitz-love-7905.workers.dev/v1/database'+(path==='status'?'/status':''),{signal:AbortSignal.timeout(15000),redirect:'error',headers:{accept:'application/json'}});
  if(!response.ok)throw Error('unavailable');
  return new Response(response.body,{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch{return Response.json({error:'collection_unavailable'},{status:503,headers:{'cache-control':'no-store'}});}
}
