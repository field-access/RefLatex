/* Local recovery is independent of the user's manually saved JSON files. */
window.createCanvasRecovery=()=>{
 let database=null,previous=new Map(),revision=null,pending=null,writing=false,initialized=false;
 const waiters=[];
 const fingerprint=note=>({...note,highlights:JSON.stringify(note.highlights||[])});
 const same=(a,b)=>a&&Object.keys(b).every(key=>a[key]===b[key])&&Object.keys(a).length===Object.keys(b).length;
 function legacy(){try{return JSON.parse(localStorage.getItem('reflatex')||'null')}catch{return null}}
 function fallback(data){try{localStorage.setItem('reflatex',JSON.stringify(data));return true}catch{return false}}
 function open(){return new Promise(resolve=>{
  let settled=false;
  const finish=value=>{if(!settled){settled=true;resolve(value)}else value?.close()};
  try{
   const request=indexedDB.open('conceptcards-recovery',1);
   request.onupgradeneeded=()=>{
    request.result.createObjectStore('canvas');
    request.result.createObjectStore('cards',{keyPath:'id'});
   };
   request.onsuccess=()=>finish(request.result);
   request.onerror=()=>finish(null);request.onblocked=()=>finish(null);
  }catch{finish(null)}
 })}
 function readDatabase(){return new Promise(resolve=>{
  if(!database){resolve(null);return}
  try{
   const tx=database.transaction(['canvas','cards'],'readonly');
   const meta=tx.objectStore('canvas').get('current'),cards=tx.objectStore('cards').getAll();
   tx.oncomplete=()=>{
    if(!meta.result||!Array.isArray(meta.result.cardIds)||!meta.result.data){resolve(null);return}
    const byId=new Map(cards.result.map(note=>[note.id,note]));
    const notes=meta.result.cardIds.map(id=>byId.get(id));
    if(notes.some(note=>!note)){resolve(null);return}
    resolve({data:{...meta.result.data,notes},revision:meta.result.revision});
   };
   tx.onerror=()=>resolve(null);tx.onabort=()=>resolve(null);
  }catch{resolve(null)}
 })}
 function writeDatabase(data){return new Promise(resolve=>{
  if(!database){resolve(false);return}
  let tx;
  try{
   tx=database.transaction(['canvas','cards'],'readwrite');
   const canvas=tx.objectStore('canvas'),cards=tx.objectStore('cards');
   const current=canvas.get('current'),nextRevision=crypto.randomUUID(),next=new Map();
   const ids=new Set(data.notes.map(note=>note.id));
   for(const note of data.notes){
    const key=fingerprint(note);next.set(note.id,key);
    if(!same(previous.get(note.id),key))cards.put(note);
   }
   for(const id of previous.keys())if(!ids.has(id))cards.delete(id);
   const {notes,...metadata}=data;
   canvas.put({data:metadata,cardIds:notes.map(note=>note.id),revision:nextRevision},'current');
   // Queue writes immediately, including from pagehide. If another tab
   // changed the canvas, refresh our card records in the same transaction.
   current.onsuccess=()=>{
    try{
     if(current.result?current.result.revision!==revision:previous.size>0)for(const note of data.notes)cards.put(note);
     for(const id of current.result?.cardIds||[])if(!ids.has(id))cards.delete(id);
    }catch{tx.abort()}
   };
   tx.oncomplete=()=>{previous=next;revision=nextRevision;resolve(true)};
   tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);
  }catch{try{tx?.abort()}catch{}resolve(false)}
 })}
 const ready=(async()=>{
  database=await open();
  if(database)database.onversionchange=()=>{database.close();database=null};
  const stored=await readDatabase(),old=legacy();
  if(stored){
   revision=stored.revision;previous=new Map(stored.data.notes.map(note=>[note.id,fingerprint(note)]));
   // A fallback save can be newer than IndexedDB after a storage failure.
   if(!old)return stored.data;
  }
  if(old&&Array.isArray(old.notes)){
   if(await writeDatabase(old))try{localStorage.removeItem('reflatex')}catch{}
   return old;
  }
  return stored?.data||null;
 })().catch(()=>legacy()).then(data=>{initialized=true;return data});
 async function drain(){
  if(writing)return;
  writing=true;
  if(!initialized)await ready;
  let success=true;
  while(pending){
   const data=pending;pending=null;
   const stored=database?await writeDatabase(data):false;
   success=stored||fallback(data);
   if(stored)try{localStorage.removeItem('reflatex')}catch{}
  }
  writing=false;
  for(const resolve of waiters.splice(0))resolve(success);
 }
 return {
  load:()=>ready,
  read:async()=>{await ready;return legacy()||(await readDatabase())?.data||null},
  save:data=>new Promise(resolve=>{pending=data;waiters.push(resolve);drain()}),
 };
};
