/* Keep recent canvases for opening; saving is a direct JSON download in app.js. */
window.createCanvasFileManager=options=>{
 const menu=document.getElementById('canvasOpenMenu'),trigger=document.getElementById('openCanvas');
 let records=[],active=null;
 const db=new Promise(resolve=>{
  try{
   const request=indexedDB.open('conceptcards-canvas-files',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('files',{keyPath:'id'});
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);
  }catch{resolve(null)}
 });
 async function stored(method,value){
  const database=await db;if(!database)return method==='getAll'?[]:null;
  return new Promise(resolve=>{
   try{
    const transaction=database.transaction('files',method==='getAll'?'readonly':'readwrite');
    const request=transaction.objectStore('files')[method](value);
    let result;request.onsuccess=()=>{result=request.result};transaction.oncomplete=()=>resolve(result);
    transaction.onerror=()=>resolve(null);transaction.onabort=()=>resolve(null);
   }catch{resolve(null)}
  });
 }
 function render(){
  const recent=document.getElementById('recentCanvasOpens');recent.replaceChildren();
  for(const record of records.slice(0,10)){
   const button=document.createElement('button');button.type='button';button.textContent=record.name+(record.id===active?.id?' · current':'');
   button.title=record.handle?`Open ${record.name} from its saved location`:`Locate ${record.name} to reconnect its saved location`;
   button.onclick=()=>openRecent(record);recent.append(button);
  }
 }
 function closeMenu(){menu.hidden=true;trigger.setAttribute('aria-expanded','false')}
 function toggleOpenMenu(){const visible=menu.hidden;menu.hidden=!visible;trigger.setAttribute('aria-expanded',String(visible));render();if(visible)document.getElementById('newBlankCanvas').focus()}
 async function remember(handle,name,reconnect=null){
  let record;
  if(handle)for(const candidate of records){if(candidate.handle&&await candidate.handle.isSameEntry(handle)){record=candidate;break}}
  if(!record&&!handle)record=records.find(item=>!item.handle&&item.name===name);
  if(!record&&reconnect&&!reconnect.handle&&reconnect.name===name)record=reconnect;
  record ||= {id:crypto.randomUUID(),name};record.handle=handle||null;record.name=name;record.used=Date.now();
  records=[record,...records.filter(item=>item.id!==record.id)].slice(0,10);
  // Native handles contain IPC functions; persist only their approved file ID.
  const saved=handle?.desktopId?{...record,handle:{desktopId:handle.desktopId,name:handle.name,kind:'file'}}:record;
  await stored('put',saved);
  try{localStorage.setItem('reflatex-recent-files',JSON.stringify(records.map(({id,name,used})=>({id,name,used}))))}catch{}
  return record;
 }
 async function importFile(file,handle=null,reconnect=null){
  if(!file)return;
  await ready;
  if(await options.openFile(file)){active=await remember(handle,file.name,reconnect);render()}
 }
 async function openRecent(record){
  closeMenu();
  if(!record.handle){await open(record);return}
  try{
   let permission=await record.handle.queryPermission({mode:'read'});
   if(permission!=='granted')permission=await record.handle.requestPermission({mode:'read'});
   if(permission!=='granted')return;
   await importFile(await record.handle.getFile(),record.handle);
  }catch(error){alert(`Could not open ${record.name}: ${error.message}`)}
 }
 async function open(reconnect=null){
  closeMenu();
  if(typeof showOpenFilePicker!=='function'){document.getElementById('canvasFile').click();return}
  try{
   const picker={id:reconnect?.id?`cc-${reconnect.id.slice(0,24)}`:'conceptcards-canvas',multiple:false,types:[{description:'ConceptCards canvas',accept:{'application/json':['.json']}}]};
   const location=reconnect?.handle||(!reconnect&&(active?.handle||records.find(record=>record.handle)?.handle));
   if(location)picker.startIn=location;
   const [handle]=await showOpenFilePicker(picker);
   await importFile(await handle.getFile(),handle,reconnect);
  }catch(error){if(error.name!=='AbortError')alert(`Could not open canvas: ${error.message}`)}
 }
 async function newCanvas(){await ready;closeMenu();options.newCanvas();active=null;render()}
 const ready=(async()=>{
  try{
   localStorage.removeItem('reflatex-active-file');localStorage.removeItem('reflatex-file-baseline');
   const names=JSON.parse(localStorage.getItem('reflatex-recent-files')||'[]'),saved=await stored('getAll');
   records=names.map(name=>saved.find(record=>record.id===name.id)||name).slice(0,10).map(record=>{
    if(record.handle?.desktopId)record.handle=window.ConceptDesktop?.restoreFileHandle(record.handle)||null;
    return record;
   });
  }catch{}
  render();
 })();
 document.getElementById('openCanvasFile').onclick=()=>open();
 document.getElementById('newBlankCanvas').onclick=newCanvas;
 document.getElementById('importMarkdownFiles').onclick=()=>{closeMenu();document.getElementById('markdownFiles').click()};
 document.addEventListener('click',event=>{if(!event.target.closest('.canvas-open-picker'))closeMenu()});
 menu.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu();trigger.focus()}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();const buttons=[...menu.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);
   buttons[(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
  }
 });
 return {toggleOpenMenu,open,newCanvas,importFile,ready};
};
