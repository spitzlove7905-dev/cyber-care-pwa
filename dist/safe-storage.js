/* Development copy: one IndexedDB transaction owns records and image blobs. */
(() => {
  'use strict';
  const DB = window.CCConfig?.databaseName || 'cyber-care-development-safe-v1';
  let database, cache = [], legacyRaw, legacyFingerprint;
  const request = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  const done = tx => new Promise((resolve, reject) => {
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || Error('保存を中止しました'));
    tx.onerror = () => {}; // onabort is the authoritative failure signal.
  });
  function validate(records, images) {
    if (!Array.isArray(records) || records.some(r => !r || typeof r.event !== 'string')) throw Error('旧記録の形式が不正です。元データは保持しています');
    const ids = new Set();
    records.forEach(r => { if (r.id) { if (typeof r.id !== 'string' || ids.has(r.id)) throw Error('旧記録IDが不正・重複しています'); ids.add(r.id); } });
    const imageIds = new Set();
    if (images.some(i => {
      if (!i || typeof i.id !== 'string' || !i.id || imageIds.has(i.id) || !ids.has(i.recordId) || !(i.blob instanceof Blob)) return true;
      imageIds.add(i.id); return false;
    })) throw Error('旧画像の参照・ID・形式が不正です');
    for (const r of records) {
      const count = images.filter(i => i.recordId === r.id).length;
      if (r.imageCount !== undefined && (!Number.isInteger(r.imageCount) || r.imageCount !== count)) throw Error('旧記録の画像枚数が一致しません。自動移行を停止しました');
    }
  }
  async function legacyImages() {
    // Opening a nonexistent legacy DB must not leave an empty replacement behind.
    const req = indexedDB.open('cyber-care-evidence');
    return new Promise((resolve, reject) => {
      let absent = false;
      req.onupgradeneeded = () => { absent = true; req.transaction.abort(); };
      req.onerror = () => absent ? resolve([]) : reject(req.error);
      req.onblocked = () => reject(Error('旧画像DBが使用中です。他の画面を閉じてください'));
      req.onsuccess = async () => {
        const old = req.result;
        try {
          if (!old.objectStoreNames.contains('images')) throw Error('旧画像ストアがありません');
          resolve(await request(old.transaction('images').objectStore('images').getAll()));
        } catch (error) { reject(error); } finally { old.close(); }
      };
    });
  }
  async function fingerprint(images) {
    const rows = await Promise.all(images.map(async i => {
      if (!(i.blob instanceof Blob)) throw Error('旧画像形式が不正です');
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await i.blob.arrayBuffer())), b=>b.toString(16).padStart(2,'0')).join('');
      return JSON.stringify([i.id,i.recordId,i.name ?? null,i.blob.type,i.blob.size,digest]);
    }));
    return JSON.stringify(rows.sort());
  }
  async function checkLegacy() {
    if(localStorage.getItem('cc-records') !== legacyRaw || await fingerprint(await legacyImages()) !== legacyFingerprint) {
      window.dispatchEvent(new CustomEvent('cc-storage-error'));
      throw Error('旧本文または旧画像の変更を検知しました。保存を停止します。旧画面を閉じ、画像込みで保全してください');
    }
  }
  async function list() {
    cache = await request(database.transaction('records').objectStore('records').getAll());
    cache.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0) || a.id.localeCompare(b.id));
    return cache;
  }
  async function init() {
    const config=window.CCConfig;
    const loopback=['127.0.0.1','localhost','[::1]'].includes(location.hostname);
    const development=config?.mode==='development'&&loopback&&DB==='cyber-care-development-safe-v1';
    const production=config?.mode==='production'&&config.enabled===true&&location.protocol==='https:'&&config.allowedOrigins?.includes(location.origin)&&DB==='cyber-care-safe-v1'&&config.draftKey==='cc-consultation-safe-v1';
    if(!development&&!production) throw Error('開発専用または無効な構成です。本番では保存できません');
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => {
      for (const name of ['records','images','meta']) open.result.createObjectStore(name,{keyPath:'id'});
    };
    database = await new Promise((resolve,reject)=>{
      let blocked=false;
      open.onblocked=()=>{blocked=true;reject(Error('開発DBが使用中です。他の開発画面を閉じて再読込してください'));};
      open.onerror=()=>reject(open.error);
      open.onsuccess=()=>{if(blocked){open.result.close();return;}resolve(open.result);};
    });
    database.onversionchange = () => { database.close(); window.dispatchEvent(new CustomEvent('cc-storage-error')); };
    legacyRaw = localStorage.getItem('cc-records');
    const existing = await request(database.transaction('meta').objectStore('meta').get('legacy'));
    if (existing) {
      legacyFingerprint=await fingerprint(await legacyImages());
      if(existing.imageFingerprint === undefined || existing.raw !== legacyRaw || existing.imageFingerprint !== legacyFingerprint) throw Error('旧データの変更または画像指紋のない旧移行を検知しました。保全・照合が必要です');
      return list();
    }
    const records = JSON.parse(legacyRaw || '[]'), images = await legacyImages();
    validate(records, images);
    legacyFingerprint=await fingerprint(images);
    await checkLegacy();
    if (localStorage.getItem('cc-records') !== legacyRaw) throw Error('移行中に旧記録が変更されました');
    const tx = database.transaction(['records','images','meta'],'readwrite'), complete = done(tx);
    const meta = tx.objectStore('meta');
    meta.get('legacy').onsuccess = event => {
      if (event.target.result) { if(event.target.result.raw !== legacyRaw || event.target.result.imageFingerprint !== legacyFingerprint) tx.abort(); return; }
      try {
        records.forEach((r,i) => tx.objectStore('records').add({...r,id:r.id || `legacy-${crypto.randomUUID()}`,createdAt: -i}));
        images.forEach(i => tx.objectStore('images').add(i));
        meta.add({id:'legacy',raw:legacyRaw,imageFingerprint:legacyFingerprint,importedAt:new Date().toISOString(),count:records.length});
      } catch(error) { tx.abort(); }
    };
    await complete;
    await checkLegacy();
    return list();
  }
  async function save(record, files) {
    await checkLegacy();
    const tx = database.transaction(['records','images'],'readwrite'), complete = done(tx);
    try {
      tx.objectStore('records').add({...record,createdAt:Date.now(),imageCount:files.length});
      files.forEach((blob,i) => tx.objectStore('images').add({id:`${record.id}-${i}`,recordId:record.id,name:blob.name,blob}));
    } catch(error) { tx.abort(); await complete.catch(()=>{}); throw error; }
    await complete;
    // A successful commit must not become a reported save failure if a later read fails.
    cache = [{...record,createdAt:Date.now(),imageCount:files.length},...cache];
  }
  const images = async id => (await request(database.transaction('images').objectStore('images').getAll())).filter(i=>i.recordId===id);
  async function backup() {
    const tx = database.transaction(['records','images','meta']);
    const [records,images,meta] = await Promise.all(['records','images','meta'].map(n=>request(tx.objectStore(n).getAll())));
    return {format:'cyber-care-development-backup-v1',records,meta,images:await Promise.all(images.map(async i=>({...i,blob:undefined,type:i.blob.type,data:await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(i.blob);})})))};
  }
  const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
  async function consultation() {
    const raw=localStorage.getItem(window.CCConfig.draftKey);
    const saved=await request(database.transaction('meta').objectStore('meta').get('restored-consultation'));
    return saved && saved.baseRaw===raw ? {...structuredClone(saved.value),restored:true} : {stored:raw,current:raw===null?'':JSON.parse(raw).text};
  }
  async function exportFull(current) {
    const payload=await backup();
    payload.consultation=await consultation();
    delete payload.consultation.restored;
    if(current!==undefined) payload.consultation.current=current;
    return {format:'cyber-care-full-v2',payload,sha256:await digest(payload)};
  }
  async function restore(input) {
    if(!input || input.format!=='cyber-care-full-v2' || !input.payload || input.sha256!==await digest(input.payload)) throw Error('バックアップの形式・整合性が不正です');
    const b=structuredClone(input.payload), c=b.consultation;
    if(!c || typeof c.current!=='string' || !(c.stored===null||typeof c.stored==='string')) throw Error('相談文が不正です');
    if(c.stored!==null){const d=JSON.parse(c.stored);if(!d||typeof d.text!=='string'||!Array.isArray(d.previous))throw Error('相談文履歴が不正です');}
    if(!Array.isArray(b.images)||!Array.isArray(b.records)||b.records.some(r=>typeof r.id!=='string'||!r.id))throw Error('記録が不正です');
    let bytes=0;
    const decoded=b.images.map(i=>{
      if(typeof i.data!=='string'||typeof i.type!=='string'||!i.type.startsWith('image/')||!i.data.startsWith('data:'+i.type+';base64,'))throw Error('画像が不正です');
      const encoded=i.data.slice(i.data.indexOf(',')+1);
      if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw Error('画像が破損しています');
      const raw=atob(encoded);bytes+=raw.length;if(raw.length>8*1024*1024||bytes>128*1024*1024)throw Error('復元容量の上限を超えています');
      const {data,type,...rest}=i;return {...rest,blob:new Blob([Uint8Array.from(raw,x=>x.charCodeAt(0))],{type})};
    });
    validate(b.records,decoded);
    const estimate=await navigator.storage?.estimate?.();
    if(estimate?.quota && estimate.quota-(estimate.usage||0)<bytes*2+JSON.stringify(b.records).length*4)throw Error('空き容量が不足しています');
    await checkLegacy();
    const baseRaw=localStorage.getItem(window.CCConfig.draftKey);
    const tx=database.transaction(['records','images','meta'],'readwrite'), complete=done(tx);
    try {
      // All reads and writes share one transaction: another tab cannot insert a conflicting ID between them.
      const rs=tx.objectStore('records'), ims=tx.objectStore('images'), meta=tx.objectStore('meta');
      const existingRecords=request(rs.getAll()), existingImages=request(ims.getAll());
      const [oldRecords,oldImages]=await Promise.all([existingRecords,existingImages]);
      const oldR=new Map(oldRecords.map(r=>[r.id,r])),oldI=new Set(oldImages.map(i=>i.id));
      if(b.records.some(r=>oldR.has(r.id))||decoded.some(i=>oldI.has(i.id)))throw Error('既存IDと重複しています。既存記録は変更していません');
      b.records.forEach(r=>rs.add(r));decoded.forEach(i=>ims.add(i));
      // Preserve both previous and imported consultation; no localStorage write is part of restore.
      const prior=await request(meta.get('restored-consultation'));
      meta.put({id:'restore-history-'+crypto.randomUUID(),value:{previousRaw:baseRaw,previousRestore:prior||null,sourceMeta:b.meta||[],imported:c},at:new Date().toISOString()});
      meta.put({id:'restored-consultation',baseRaw,value:c});
    } catch(error) {tx.abort();await complete.catch(()=>{});throw error;}
    await complete;
    // A commit is success even if a later display read fails.
    return {added:b.records.length,images:decoded.length};
  }
  window.CCSafe = {init,list,save,images,backup,exportFull,restore,consultation,checkLegacy,records:()=>structuredClone(cache),databaseName:DB};
})();
