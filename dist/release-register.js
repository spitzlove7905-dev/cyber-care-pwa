/* Release registration only; never force activation or erase storage. */
(() => {
 const config=window.CCConfig;
 if(config?.mode!=='production'||config.enabled!==true||config.enableSW!==true||location.protocol!=='https:'||!config.allowedOrigins?.includes(location.origin)||!('serviceWorker' in navigator))return;
 const register=()=>navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{console.warn('Cyber Care: オフライン準備に失敗しました。通信と更新状態を確認してください。');});
 if(document.readyState==='complete')register();else window.addEventListener('load',register,{once:true});
})();
