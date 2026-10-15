/* File handles stay in IndexedDB; filenames remain available in fallback browsers. */
window.createCanvasFileManager=options=>{
 const menu=document.getElementById('canvasSaveMenu'),trigger=document.getElementById('saveCanvas'),status=document.getElementById('canvasSaveStatus');
 const openMenu=document.getElementById('canvasOpenMenu'),openTrigger=document.getElementById('openCanvas');
 const canWrite=typeof window.showSaveFilePicker==='function';
 let records=[],active=null,baseline='',timer=0,writing=null,opening=false,message='';
 const key=data=>{const {savedAt,...content}=data;return JSON.stringify(content)};
 const current=()=>key(options.payload());
 const db=new Promise(resolve=>{
  try{const request=indexedDB.open('conceptcards-canvas-files',1);
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
   let result;request.onsuccess=()=>{result=request.result};transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>resolve(null);transaction.onabort=()=>resolve(null);
   }catch{resolve(null)}
  });
 }
 function dirty(){return !opening&&current()!==baseline}
 function metadata(){
  try{
  localStorage.setItem('reflatex-recent-files',JSON.stringify(records.map(({id,name,used})=>({id,name,used}))));
  if(active)localStorage.setItem('reflatex-active-file',active.id);else localStorage.removeItem('reflatex-active-file');
  localStorage.setItem('reflatex-file-baseline',baseline);
  }catch{}
 }
 function render(){
  const pending=dirty();
  status.textContent=message||(active?.handle?`${active.name} · ${pending?'Changes waiting to save':'Autosave on'}`:active?`${active.name} · Choose Save as to enable file autosave`:'Untitled canvas · File autosave off. Save as to name it.');
  trigger.title=active?`Save canvas: ${active.name} (Ctrl/Cmd+S)`:'Save canvas (Ctrl/Cmd+S)';
  document.getElementById('saveCurrentCanvas').textContent=active?`Save ${active.name}`:'Save current canvas';
  const recent=document.getElementById('recentCanvasOpens');recent.replaceChildren();
  for(const record of records.slice(0,10)){
   const button=document.createElement('button');button.type='button';button.textContent=`${record.name}${record.id===active?.id?' · current':''}`;
   button.onclick=()=>openRecent(record);recent.append(button);
  }
 }
 function closeMenu(){menu.hidden=true;trigger.setAttribute('aria-expanded','false');openMenu.hidden=true;openTrigger.setAttribute('aria-expanded','false')}
 function toggleMenu(){const visible=menu.hidden;closeMenu();menu.hidden=!visible;trigger.setAttribute('aria-expanded',String(visible));render();if(visible)document.getElementById('saveCurrentCanvas').focus()}
 function toggleOpenMenu(){const visible=openMenu.hidden;closeMenu();openMenu.hidden=!visible;openTrigger.setAttribute('aria-expanded',String(visible));render();if(visible)document.getElementById('openCanvasFile').focus()}
 async function remember(handle,name){
  let record;
  if(handle)for(const candidate of records){if(candidate.handle&&await candidate.handle.isSameEntry(handle)){record=candidate;break}}
  if(!record&&!handle)record=records.find(item=>!item.handle&&item.name===name);
  record ||= {id:crypto.randomUUID(),name};record.handle=handle||null;record.used=Date.now();
  records=[record,...records.filter(item=>item.id!==record.id)].slice(0,10);
  await stored('put',record);return record;
 }
 async function write(record,manual=false){
  clearTimeout(timer);
  if(writing)await writing;
  if(!record?.handle)return false;
  const task=(async()=>{
   try{
    let permission=await record.handle.queryPermission({mode:'readwrite'});
    if(permission!=='granted'&&manual)permission=await record.handle.requestPermission({mode:'readwrite'});
    if(permission!=='granted'){message=`Save ${record.name} to reconnect file access.`;render();return false}
    const payload=options.payload(),saved=key(payload);
    const stream=await record.handle.createWritable();
    try{await stream.write(JSON.stringify(payload,null,2));await stream.close()}catch(error){try{await stream.abort()}catch{}throw error}
    if(active?.id===record.id){baseline=saved;message='';metadata();render();if(dirty())changed()}
    return true;
   }catch(error){message=`Could not save ${record.name}: ${error.message}`;render();return false}
  })();writing=task;
  try{return await task}finally{if(writing===task)writing=null}
 }
 function changed(){
  if(opening)return;
  message='';clearTimeout(timer);render();
  if(active?.handle&&dirty())timer=setTimeout(()=>write(active),2000);
 }
 function download(name){
  const payload=options.payload(),url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  baseline=key(payload);message=`Downloaded ${name}. File autosave requires Save as in a supported browser.`;metadata();render();
 }
 async function saveAs(suggested=active?.name||'ConceptCards canvas.json'){
  closeMenu();
  try{
   if(canWrite){
    const handle=await showSaveFilePicker({suggestedName:suggested,types:[{description:'ConceptCards canvas',accept:{'application/json':['.json']}}]});
    if(writing)await writing;
    const previous=active;active=await remember(handle,handle.name);
    if(!await write(active,true)){active=previous;render()}
   }else{
    let name=prompt('Save canvas filename',suggested);if(!name)return;
    if(!name.toLowerCase().endsWith('.json'))name+='.json';active=await remember(null,name);download(name);
   }
  }catch(error){if(error.name!=='AbortError'){message=error.message;render()}}
 }
 async function save(){closeMenu();if(active?.handle)await write(active,true);else await saveAs()}
 async function openRecent(record){
  closeMenu();
  if(!record.handle){message=`Choose ${record.name} in the file picker to reconnect it.`;render();await open();return}
  try{
   let permission=await record.handle.queryPermission({mode:'readwrite'});
   if(permission!=='granted')permission=await record.handle.requestPermission({mode:'readwrite'});
   if(permission!=='granted'){message=`File access is needed to open ${record.name}.`;render();return}
   // Flush current edits before reading, including when reopening the active file.
   if(!await beforeOpen())return;
   await importFile(await record.handle.getFile(),record.handle,true);
  }catch(error){message=`Could not open ${record.name}: ${error.message}`;render()}
 }
 async function beforeOpen(){
  options.backup();clearTimeout(timer);
  if(writing)await writing;
  if(dirty()&&active?.handle&&await write(active))return true;
  return !dirty()||!options.hasContent()||confirm('This canvas has changes not saved to a file. Open another canvas anyway? Your browser backup will be replaced.');
 }
 async function importFile(file,handle=null,prepared=false){
  if(!file||(!prepared&&!await beforeOpen()))return;
  opening=true;clearTimeout(timer);
  try{
   if(await options.openFile(file)){
    active=await remember(handle,file.name);baseline=current();message='';metadata();
    if(handle){const permission=await handle.queryPermission({mode:'readwrite'});if(permission!=='granted')message=`Save ${file.name} once to allow autosave.`}
   }
  }finally{opening=false;render()}
 }
 async function open(){
  closeMenu();
  if(typeof showOpenFilePicker!=='function'){document.getElementById('canvasFile').click();return}
  try{const [handle]=await showOpenFilePicker({mode:'readwrite',multiple:false,types:[{description:'ConceptCards canvas',accept:{'application/json':['.json']}}]});if(await beforeOpen())await importFile(await handle.getFile(),handle,true)}catch(error){if(error.name!=='AbortError'){message=error.message;render()}}
 }
 async function newCanvas(){
  await ready;closeMenu();
  if(!await beforeOpen())return;
  opening=true;clearTimeout(timer);
  try{
   options.newCanvas();active=null;baseline=current();message='';metadata();
  }finally{opening=false;render()}
 }
 baseline=options.hasContent()?'':current();
 const ready=(async()=>{
  try{
   const names=JSON.parse(localStorage.getItem('reflatex-recent-files')||'[]'),saved=await stored('getAll');
   records=names.map(name=>saved.find(record=>record.id===name.id)||name);
   active=records.find(record=>record.id===localStorage.getItem('reflatex-active-file'))||null;
   if(active)baseline=localStorage.getItem('reflatex-file-baseline')||baseline;
   render();if(dirty())changed();
  }catch{render()}
 })();
 document.getElementById('saveCurrentCanvas').onclick=save;document.getElementById('saveCanvasAs').onclick=()=>saveAs();
 document.getElementById('openCanvasFile').onclick=open;
 document.getElementById('newBlankCanvas').onclick=newCanvas;
 document.addEventListener('click',event=>{if(!event.target.closest('.canvas-save-picker,.canvas-open-picker'))closeMenu()});
 for(const [panel,button] of [[menu,trigger],[openMenu,openTrigger]])panel.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu();button.focus()}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const buttons=[...panel.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);buttons[(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus()}
 });
 window.addEventListener('beforeunload',event=>{if(dirty()&&(options.hasContent()||JSON.parse(baseline||'{}').notes?.length)){event.preventDefault();event.returnValue=''}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&active?.handle&&dirty())write(active)});
 render();return {changed,toggleMenu,toggleOpenMenu,save,saveAs,open,newCanvas,importFile,ready};
};
